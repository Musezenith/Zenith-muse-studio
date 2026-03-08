import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRemoteImageAsset } from "./assetSchema.mjs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "filesystem";
const STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR || "data/object-assets";
const STORAGE_PUBLIC_BASE_URL = process.env.STORAGE_PUBLIC_BASE_URL || "/api/assets";
const STORAGE_SIGNED_URL_TTL_SECONDS = Number(
  process.env.STORAGE_SIGNED_URL_TTL_SECONDS || "900"
);

const STORAGE_S3_BUCKET = process.env.STORAGE_S3_BUCKET || "";
const STORAGE_S3_REGION = process.env.STORAGE_S3_REGION || "";
const STORAGE_S3_KEY_PREFIX = process.env.STORAGE_S3_KEY_PREFIX || "generated";
const STORAGE_S3_PUBLIC_BASE_URL = process.env.STORAGE_S3_PUBLIC_BASE_URL || "";
const STORAGE_S3_URL_MODE = process.env.STORAGE_S3_URL_MODE || "public";

const storageDirAbs = path.resolve(process.cwd(), STORAGE_LOCAL_DIR);
const s3Client =
  STORAGE_S3_REGION && STORAGE_PROVIDER === "s3"
    ? new S3Client({
        region: STORAGE_S3_REGION,
      })
    : null;

function guessExtension(mimeType = "image/png") {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "bin";
}

function bytesFromAsset(asset) {
  if (asset.base64) {
    return Buffer.from(asset.base64, "base64");
  }
  if (asset.dataUri && asset.dataUri.startsWith("data:")) {
    const commaIndex = asset.dataUri.indexOf(",");
    if (commaIndex >= 0) {
      return Buffer.from(asset.dataUri.slice(commaIndex + 1), "base64");
    }
  }
  return null;
}

async function persistToFilesystem(asset) {
  const bytes = bytesFromAsset(asset);
  if (!bytes) {
    throw new Error("No inline bytes found");
  }

  await mkdir(storageDirAbs, { recursive: true });
  const ext = guessExtension(asset.mimeType);
  const key = `${Date.now()}-${randomUUID()}.${ext}`;
  const filePath = path.join(storageDirAbs, key);
  await writeFile(filePath, bytes);

  return createRemoteImageAsset({
    id: asset.id,
    url: `${STORAGE_PUBLIC_BASE_URL}/${key}`,
    provider: "filesystem",
    key,
    mimeType: asset.mimeType || null,
    size: bytes.byteLength,
    fallback: {
      base64: asset.base64 || null,
      dataUri: asset.dataUri || null,
    },
  });
}

function buildS3ObjectKey(asset) {
  const ext = guessExtension(asset.mimeType);
  const prefix = STORAGE_S3_KEY_PREFIX.replace(/\/+$/, "");
  return `${prefix}/${Date.now()}-${randomUUID()}.${ext}`;
}

function s3DeliveryUrlForKey(key) {
  if (STORAGE_S3_URL_MODE === "public" && STORAGE_S3_PUBLIC_BASE_URL) {
    return `${STORAGE_S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
  }
  return `${STORAGE_PUBLIC_BASE_URL}/s3/${encodeURIComponent(key)}`;
}

async function persistToS3(asset) {
  if (!s3Client || !STORAGE_S3_BUCKET) {
    throw new Error("S3 storage is not configured");
  }

  const bytes = bytesFromAsset(asset);
  if (!bytes) {
    throw new Error("No inline bytes found");
  }

  const key = buildS3ObjectKey(asset);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: STORAGE_S3_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: asset.mimeType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return createRemoteImageAsset({
    id: asset.id,
    url: s3DeliveryUrlForKey(key),
    provider: "s3",
    key,
    mimeType: asset.mimeType || null,
    size: bytes.byteLength,
    fallback: {
      base64: asset.base64 || null,
      dataUri: asset.dataUri || null,
    },
  });
}

async function persistSingleAsset(asset) {
  if (!asset) return null;
  if (asset.storage === "remote" && asset.url) return asset;

  if (STORAGE_PROVIDER === "none") {
    throw new Error("Storage provider disabled");
  }

  if (STORAGE_PROVIDER === "filesystem") {
    return persistToFilesystem(asset);
  }

  if (STORAGE_PROVIDER === "s3") {
    return persistToS3(asset);
  }

  throw new Error(`Unsupported STORAGE_PROVIDER: ${STORAGE_PROVIDER}`);
}

export async function persistAssetsWithFallback(assets = []) {
  const output = [];
  for (const asset of assets) {
    try {
      const persisted = await persistSingleAsset(asset);
      output.push(persisted || asset);
    } catch (error) {
      output.push({
        ...asset,
        status: "fallback-inline",
      });
    }
  }
  return output;
}

export function extractStorageKeyFromAsset(asset) {
  if (!asset) return "";
  if (typeof asset.storage === "object" && asset.storage?.key) {
    return String(asset.storage.key);
  }
  const url = asset.url || asset.storage?.url;
  if (typeof url !== "string") return "";
  const prefix = `${STORAGE_PUBLIC_BASE_URL}/`;
  if (!url.startsWith(prefix)) return "";
  return path.basename(url.slice(prefix.length));
}

export function extractStorageProviderFromAsset(asset) {
  if (!asset) return "";
  if (typeof asset.storage === "object" && asset.storage?.provider) {
    return String(asset.storage.provider);
  }
  return STORAGE_PROVIDER === "s3" ? "s3" : "filesystem";
}

async function hasStoredFilesystemAsset(key) {
  const normalized = path.basename(key || "");
  if (!normalized || normalized !== key) return false;
  try {
    await access(path.join(storageDirAbs, normalized));
    return true;
  } catch (error) {
    return false;
  }
}

async function removeStoredFilesystemAsset(key) {
  const normalized = path.basename(key || "");
  if (!normalized || normalized !== key) return false;
  try {
    await rm(path.join(storageDirAbs, normalized), { force: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function hasStoredS3Asset(key) {
  if (!s3Client || !STORAGE_S3_BUCKET || !key) return false;
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: STORAGE_S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function removeStoredS3Asset(key) {
  if (!s3Client || !STORAGE_S3_BUCKET || !key) return false;
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: STORAGE_S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    return false;
  }
}

export async function hasStoredAsset({ provider, key }) {
  if (provider === "s3") return hasStoredS3Asset(key);
  return hasStoredFilesystemAsset(key);
}

export async function removeStoredAsset({ provider, key }) {
  if (provider === "s3") return removeStoredS3Asset(key);
  return removeStoredFilesystemAsset(key);
}

async function readStoredFilesystemAsset(key) {
  const normalized = path.basename(key || "");
  if (!normalized || normalized !== key) return null;
  const filePath = path.join(storageDirAbs, normalized);
  try {
    const bytes = await readFile(filePath);
    const ext = path.extname(normalized).toLowerCase();
    const mimeType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
        ? "image/gif"
        : "image/png";
    return {
      bytes,
      mimeType,
    };
  } catch (error) {
    return null;
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readStoredS3Asset(key) {
  if (!s3Client || !STORAGE_S3_BUCKET || !key) return null;
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: STORAGE_S3_BUCKET,
        Key: key,
      })
    );
    let bytes = null;
    if (result.Body instanceof Readable) {
      bytes = await streamToBuffer(result.Body);
    } else if (result.Body?.transformToByteArray) {
      const arr = await result.Body.transformToByteArray();
      bytes = Buffer.from(arr);
    }
    if (!bytes) return null;
    return {
      bytes,
      mimeType: result.ContentType || "application/octet-stream",
    };
  } catch (error) {
    return null;
  }
}

export async function readStoredAsset({ provider, key }) {
  if (provider === "s3") return readStoredS3Asset(key);
  return readStoredFilesystemAsset(key);
}

export async function getSignedAssetUrl({ provider, key }) {
  if (provider !== "s3" || !s3Client || !STORAGE_S3_BUCKET || !key) return null;
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: STORAGE_S3_BUCKET,
        Key: key,
      }),
      { expiresIn: Math.max(60, STORAGE_SIGNED_URL_TTL_SECONDS) }
    );
  } catch (error) {
    return null;
  }
}

export function getS3UrlMode() {
  return STORAGE_S3_URL_MODE;
}
