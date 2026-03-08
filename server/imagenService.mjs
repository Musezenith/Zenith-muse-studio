import { GoogleAuth } from "google-auth-library";
import {
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
  const providerOverride = String(process.env.IMAGE_PROVIDER || "")
    .trim()
    .toLowerCase();

  const endpoint =
    endpointOverride ||
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  return {
    location,
    model,
    projectId,
    timeoutMs,
    endpoint,
    imageProvider: providerOverride,
    mockMode: process.env.MOCK_IMAGEN === "1",
    mockDelayMs: Math.max(0, ensureInteger(process.env.MOCK_IMAGEN_DELAY_MS, 0)),
  };
}

function resolveProvider(config) {
  const value = String(config?.imageProvider || "").trim().toLowerCase();
  if (!value) {
    return config?.mockMode ? "mock" : "vertex";
  }
  if (value === "vertex-imagen") return "vertex";
  return value;
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

function mapAspectRatioToDimensions(aspectRatio) {
  const raw = String(aspectRatio || "1:1").trim();
  if (raw === "3:4" || raw === "9:16") return { width: 1024, height: 1536 };
  if (raw === "4:3" || raw === "16:9") return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

function parseDataUri(dataUri = "") {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:")) return null;
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex < 0) return null;
  const meta = dataUri.slice(5, commaIndex);
  const mimeType = meta.split(";")[0] || "application/octet-stream";
  const raw = dataUri.slice(commaIndex + 1);
  return {
    mimeType,
    base64: raw,
  };
}

function isBase64Payload(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(value)
  );
}

function inlineByteLength(asset) {
  if (isBase64Payload(asset?.base64)) {
    try {
      return Buffer.from(asset.base64, "base64").byteLength;
    } catch (_) {
      return 0;
    }
  }
  if (typeof asset?.dataUri === "string" && asset.dataUri.startsWith("data:")) {
    const parsed = parseDataUri(asset.dataUri);
    if (!parsed || !isBase64Payload(parsed.base64)) return 0;
    try {
      return Buffer.from(parsed.base64, "base64").byteLength;
    } catch (_) {
      return 0;
    }
  }
  return 0;
}

function validateAndHydrateProviderAssets(assets, dimensionsByAssetId = {}, provider = "unknown") {
  const out = [];
  for (let index = 0; index < (Array.isArray(assets) ? assets.length : 0); index += 1) {
    const asset = assets[index];
    if (!asset || typeof asset !== "object") {
      const error = new Error(`Corrupted ${provider} asset at index ${index}`);
      error.status = 502;
      throw error;
    }
    const hasRemote = typeof asset.url === "string" && asset.url.startsWith("http");
    const inlineBytes = inlineByteLength(asset);
    if (!hasRemote && inlineBytes <= 0) {
      const error = new Error(`Corrupted ${provider} asset payload`);
      error.status = 502;
      throw error;
    }
    const dimensions = dimensionsByAssetId?.[asset.id] || { width: 1024, height: 1024 };
    const width = Number(dimensions.width || 0);
    const height = Number(dimensions.height || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      const error = new Error(`Invalid ${provider} asset dimensions`);
      error.status = 502;
      throw error;
    }
    out.push({
      ...asset,
      width,
      height,
      size_bytes: inlineBytes > 0 ? inlineBytes : Number(asset.size || 0) || null,
      size: inlineBytes > 0 ? inlineBytes : Number(asset.size || 0) || null,
    });
  }
  return out;
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
const mockAttemptByRequestId = new Map();

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
  const failFirstAttempts = Math.max(
    0,
    ensureInteger(process.env.MOCK_IMAGEN_FAIL_FIRST_ATTEMPTS, 0)
  );
  const alwaysFail = process.env.MOCK_IMAGEN_ALWAYS_FAIL === "1";
  const seenAttempts = Number(mockAttemptByRequestId.get(requestId) || 0);
  if (alwaysFail || seenAttempts < failFirstAttempts) {
    mockAttemptByRequestId.set(requestId, seenAttempts + 1);
    const transient = new Error("Mock transient timeout");
    transient.status = 504;
    throw transient;
  }

  if (delayMs > 0) {
    await delayWithSignal(delayMs, signal);
  }
  const variants = ensureInteger(payload?.generation?.variants, 1);
  const dimensions = mapAspectRatioToDimensions(payload?.generation?.aspectRatio);
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
      provider: "mock",
      variantsRequested: variants,
      variantsResolved: assets.length,
      endpoint: "mock",
      mock: true,
    },
    dimensionsByAssetId: Object.fromEntries(
      assets.map((asset) => [asset.id, dimensions])
    ),
  };
}

function providerNotImplementedError(provider) {
  const error = new Error(
    `IMAGE_PROVIDER=${provider} is not implemented in this runtime yet. Supported now: mock, vertex, openai.`
  );
  error.status = 501;
  return error;
}

async function generateWithVertex({ payload, requestId, config, signal }) {
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

  return {
    requestId,
    model: payload.generation.model || config.model,
    assets,
    meta: {
      provider: "vertex-imagen",
      variantsRequested: variants,
      variantsResolved: assets.length,
      endpoint: config.endpoint,
    },
    dimensionsByAssetId: Object.fromEntries(
      assets.map((asset) => [asset.id, mapAspectRatioToDimensions(payload.generation.aspectRatio)])
    ),
  };
}

async function callOpenAiImagesGenerate({ apiKey, body, signal }) {
  const timeoutMs = Math.max(1000, ensureInteger(process.env.OPENAI_TIMEOUT_MS, 30000));
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let jsonBody = null;
    try {
      jsonBody = text ? JSON.parse(text) : null;
    } catch (_) {
      jsonBody = null;
    }

    if (!response.ok) {
      const message =
        jsonBody?.error?.message || jsonBody?.message || text || "OpenAI image generation failed";
      const error = new Error(message);
      error.status = response.status;
      error.body = jsonBody;
      throw error;
    }
    return jsonBody;
  } catch (error) {
    if (error?.name === "AbortError" && timedOut) {
      const timeoutError = new Error(`OpenAI image request timed out after ${timeoutMs}ms`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function generateWithOpenAi({ payload, requestId, signal }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error("Missing OPENAI_API_KEY for IMAGE_PROVIDER=openai");
    error.status = 500;
    throw error;
  }
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
  const variants = ensureInteger(payload?.generation?.variants, 1);
  const dimensions = mapAspectRatioToDimensions(payload?.generation?.aspectRatio);
  const size = `${dimensions.width}x${dimensions.height}`;
  const prompt = String(payload?.prompt?.positivePrompt || "").trim();
  const negativePrompt = String(payload?.prompt?.negativePrompt || "").trim();

  const body = {
    model,
    prompt: negativePrompt ? `${prompt}\n\nNegative prompt: ${negativePrompt}` : prompt,
    size,
    n: variants,
  };

  const raw = await callOpenAiImagesGenerate({
    apiKey,
    body,
    signal,
  });

  const data = Array.isArray(raw?.data) ? raw.data : [];
  const assets = data
    .map((item, index) => {
      const id = `openai-v${index + 1}`;
      if (typeof item?.url === "string" && item.url.startsWith("http")) {
        return createRemoteImageAsset({ id, url: item.url, provider: "openai" });
      }
      if (looksLikeBase64(item?.b64_json)) {
        return createInlineImageAsset({
          id,
          base64: item.b64_json,
        });
      }
      return null;
    })
    .filter(Boolean);

  if (assets.length === 0) {
    const error = new Error("OpenAI returned no image assets");
    error.status = 502;
    throw error;
  }

  return {
    requestId,
    model,
    assets,
    meta: {
      provider: "openai",
      variantsRequested: variants,
      variantsResolved: assets.length,
      endpoint: "https://api.openai.com/v1/images/generations",
    },
    dimensionsByAssetId: Object.fromEntries(
      assets.map((asset) => [asset.id, dimensions])
    ),
  };
}

function normalizeProviderImages(assets, { provider, dimensionsByAssetId = {} } = {}) {
  return (Array.isArray(assets) ? assets : [])
    .map((asset, index) => {
      if (!asset) return null;
      const key = asset?.storage?.key || null;
      const width = Number(dimensionsByAssetId?.[asset.id]?.width || 0) || null;
      const height = Number(dimensionsByAssetId?.[asset.id]?.height || 0) || null;
      const url =
        typeof asset.url === "string" && asset.url
          ? asset.url
          : asset.dataUri
          ? asset.dataUri
          : looksLikeBase64(asset.base64)
          ? `data:${asset.mimeType || "image/png"};base64,${asset.base64}`
          : "";
      if (!url) return null;
      return {
        id: asset.id || `img-${index + 1}`,
        url,
        asset_key: key,
        width,
        height,
        size_bytes: Number(asset?.size_bytes || asset?.size || 0) || null,
        provider: provider || asset?.storage?.provider || "unknown",
      };
    })
    .filter(Boolean);
}

export async function generateViaVertexImagen({ payload, requestId, signal }) {
  const validationError = validatePayload(payload);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }

  const config = readConfig();
  const selectedProvider = resolveProvider(config);
  const startedAt = Date.now();
  let providerResult;
  if (selectedProvider === "mock") {
    providerResult = await generateMockImages({
      payload,
      requestId,
      delayMs: config.mockDelayMs,
      signal,
    });
  } else if (selectedProvider === "vertex") {
    providerResult = await generateWithVertex({
      payload,
      requestId,
      config,
      signal,
    });
  } else if (selectedProvider === "openai") {
    providerResult = await generateWithOpenAi({
      payload,
      requestId,
      signal,
    });
  } else if (
    selectedProvider === "replicate" ||
    selectedProvider === "comfy"
  ) {
    throw providerNotImplementedError(selectedProvider);
  } else {
    const error = new Error(
      `Unsupported IMAGE_PROVIDER=${selectedProvider}. Supported values: mock, vertex, openai, replicate, comfy.`
    );
    error.status = 400;
    throw error;
  }

  const hydratedAssets = validateAndHydrateProviderAssets(
    providerResult.assets || [],
    providerResult?.dimensionsByAssetId || {},
    providerResult?.meta?.provider || selectedProvider
  );
  const persistedAssetsRaw = await persistAssetsWithFallback(hydratedAssets);
  const persistedAssets = persistedAssetsRaw.map((asset) => {
    const fromHydrated = hydratedAssets.find((item) => item.id === asset.id);
    return {
      ...asset,
      width: Number(fromHydrated?.width || 0) || null,
      height: Number(fromHydrated?.height || 0) || null,
      size_bytes:
        Number(asset?.size || fromHydrated?.size_bytes || 0) ||
        Number(fromHydrated?.size_bytes || 0) ||
        null,
    };
  });
  const provider = providerResult?.meta?.provider || selectedProvider || "unknown";
  const images = normalizeProviderImages(persistedAssets, {
    provider,
    dimensionsByAssetId: providerResult?.dimensionsByAssetId || {},
  });

  return {
    requestId: providerResult.requestId || requestId,
    model: providerResult.model || payload.generation.model || config.model,
    provider,
    generation_time_ms: Date.now() - startedAt,
    assets: persistedAssets,
    images,
    meta: {
      ...providerResult.meta,
      variantsResolved: persistedAssets.length,
    },
  };
}

export function getTimeoutMs() {
  return readConfig().timeoutMs;
}

export function getImagenProviderRuntimeInfo() {
  const config = readConfig();
  return {
    active_provider: resolveProvider(config),
    supported_providers: ["mock", "vertex", "openai", "replicate", "comfy"],
  };
}
