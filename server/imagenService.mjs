import { GoogleAuth } from "google-auth-library";
import {
  assetsToLegacyImages,
  createInlineImageAsset,
  createRemoteImageAsset,
} from "./assetSchema.mjs";
import { persistAssetsWithFallback } from "./assetStorage.mjs";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function ensureInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function readConfig() {
  const location = process.env.VERTEX_LOCATION || "us-central1";
  const model = process.env.VERTEX_IMAGEN_MODEL || "imagen-3.0-generate-002";
  const projectId = process.env.VERTEX_PROJECT_ID || "";
  const timeoutMs = Math.max(1000, ensureInteger(process.env.VERTEX_TIMEOUT_MS, 45000));
  const endpointOverride = process.env.VERTEX_IMAGEN_ENDPOINT || "";

  const endpoint =
    endpointOverride ||
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  return {
    location,
    model,
    projectId,
    timeoutMs,
    endpoint,
    mockMode: process.env.MOCK_IMAGEN === "1",
    mockDelayMs: Math.max(0, ensureInteger(process.env.MOCK_IMAGEN_DELAY_MS, 0)),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Missing payload";
  }

  if (!payload.prompt || typeof payload.prompt !== "object") {
    return "Missing payload.prompt";
  }

  if (!payload.prompt.positivePrompt || typeof payload.prompt.positivePrompt !== "string") {
    return "Missing payload.prompt.positivePrompt";
  }

  if (!payload.generation || typeof payload.generation !== "object") {
    return "Missing payload.generation";
  }

  const variants = ensureInteger(payload.generation.variants, 1);
  if (variants < 1 || variants > 8) {
    return "payload.generation.variants must be between 1 and 8";
  }

  return "";
}

function looksLikeBase64(value) {
  return (
    typeof value === "string" &&
    value.length > 128 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(value)
  );
}

function extractImageCandidates(node, path = "", bucket = []) {
  if (!node) return bucket;

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      extractImageCandidates(node[index], `${path}[${index}]`, bucket);
    }
    return bucket;
  }

  if (typeof node !== "object") return bucket;

  const directUrlKeys = ["url", "uri", "gcsUri", "imageUri"];
  const directBase64Keys = [
    "bytesBase64Encoded",
    "base64",
    "imageBase64",
    "b64Json",
    "imageBytes",
  ];

  for (const key of directUrlKeys) {
    if (typeof node[key] === "string" && node[key].startsWith("http")) {
      bucket.push({ type: "url", value: node[key], source: `${path}.${key}` });
    }
  }

  for (const key of directBase64Keys) {
    if (looksLikeBase64(node[key])) {
      bucket.push({ type: "base64", value: node[key], source: `${path}.${key}` });
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && looksLikeBase64(value) && /image|bytes|base64/i.test(key)) {
      bucket.push({ type: "base64", value, source: `${path}.${key}` });
      continue;
    }
    if (value && typeof value === "object") {
      extractImageCandidates(value, `${path}.${key}`, bucket);
    }
  }

  return bucket;
}

function mapVertexResponseToAssets(rawResponse, variantIndex) {
  const predictions = Array.isArray(rawResponse?.predictions)
    ? rawResponse.predictions
    : [rawResponse];

  const mapped = [];
  for (const prediction of predictions) {
    const candidates = extractImageCandidates(prediction);
    for (const candidate of candidates) {
      if (candidate.type === "url") {
        mapped.push({ url: candidate.value });
      } else {
        mapped.push({ base64: candidate.value });
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const image of mapped) {
    const key = image.url || image.base64;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(image);
  }

  return deduped.map((image, index) => {
    const id = `v${variantIndex + 1}-${index + 1}`;
    if (image.url) {
      return createRemoteImageAsset({ id, url: image.url });
    }
    return createInlineImageAsset({ id, base64: image.base64 });
  });
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: [CLOUD_PLATFORM_SCOPE],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error("Unable to obtain Google Cloud access token");
  }
  return token;
}

async function callVertexPredict({ endpoint, accessToken, body, signal }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let jsonBody = null;
  try {
    jsonBody = text ? JSON.parse(text) : null;
  } catch (error) {
    jsonBody = null;
  }

  if (!response.ok) {
    const message =
      jsonBody?.error?.message || jsonBody?.message || text || "Vertex predict request failed";
    const statusError = new Error(message);
    statusError.status = response.status;
    statusError.body = jsonBody;
    throw statusError;
  }

  return jsonBody;
}

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WIwr3kAAAAASUVORK5CYII=";

async function delayWithSignal(ms, signal) {
  if (ms <= 0) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function generateMockImages({ payload, requestId, delayMs, signal }) {
  if (delayMs > 0) {
    await delayWithSignal(delayMs, signal);
  }
  const variants = ensureInteger(payload?.generation?.variants, 1);
  const assets = Array.from({ length: variants }, (_, index) =>
    createInlineImageAsset({
      id: `mock-v${index + 1}`,
      base64: MOCK_PNG_BASE64,
    })
  );

  return {
    requestId,
    model: payload?.generation?.model || "imagen-mock",
    assets,
    meta: {
      provider: "vertex-imagen",
      variantsRequested: variants,
      variantsResolved: assets.length,
      endpoint: "mock",
      mock: true,
    },
  };
}

export async function generateViaVertexImagen({ payload, requestId, signal }) {
  const validationError = validatePayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }

  const config = readConfig();
  let providerResult;
  if (config.mockMode) {
    providerResult = await generateMockImages({
      payload,
      requestId,
      delayMs: config.mockDelayMs,
      signal,
    });
  } else {
    if (!config.projectId && !process.env.VERTEX_IMAGEN_ENDPOINT) {
      const error = new Error(
        "Missing VERTEX_PROJECT_ID (or set VERTEX_IMAGEN_ENDPOINT override)"
      );
      error.status = 500;
      throw error;
    }

    const accessToken = await getAccessToken();
    const variants = ensureInteger(payload.generation.variants, 1);
    const seeds = Array.isArray(payload.generation.seeds) ? payload.generation.seeds : [];

    const requests = Array.from({ length: variants }, (_, index) => {
      const seed = Number.isInteger(seeds[index]) ? seeds[index] : null;
      const predictBody = {
        instances: [
          {
            prompt: payload.prompt.positivePrompt,
            ...(payload.prompt.negativePrompt
              ? { negative_prompt: payload.prompt.negativePrompt }
              : {}),
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: payload.generation.aspectRatio || "1:1",
          guidanceScale: Number(payload.generation.cfg) || 6,
          sampleImageSize: "1K",
          ...(seed !== null ? { seed } : {}),
        },
      };

      return callVertexPredict({
        endpoint: config.endpoint,
        accessToken,
        body: predictBody,
        signal,
      }).then((raw) => ({
        raw,
        variantIndex: index,
      }));
    });

    const settled = await Promise.all(requests);
    const assets = settled.flatMap(({ raw, variantIndex }) =>
      mapVertexResponseToAssets(raw, variantIndex)
    );

    if (assets.length === 0) {
      const error = new Error("No images returned by Vertex/Imagen");
      error.status = 502;
      throw error;
    }

    providerResult = {
      requestId,
      model: payload.generation.model || config.model,
      assets,
      meta: {
        provider: "vertex-imagen",
        variantsRequested: variants,
        variantsResolved: assets.length,
        endpoint: config.endpoint,
      },
    };
  }

  const persistedAssets = await persistAssetsWithFallback(providerResult.assets || []);

  return {
    requestId: providerResult.requestId || requestId,
    model: providerResult.model || payload.generation.model || config.model,
    assets: persistedAssets,
    images: assetsToLegacyImages(persistedAssets),
    meta: {
      ...providerResult.meta,
      variantsResolved: persistedAssets.length,
    },
  };
}

export function getTimeoutMs() {
  return readConfig().timeoutMs;
}
