import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractStorageKeyFromAsset,
  extractStorageProviderFromAsset,
  hasStoredAsset,
  removeStoredAsset,
} from "./assetStorage.mjs";
import { getAssetStorageMode } from "./assetSchema.mjs";

const archiveDir = path.resolve(process.cwd(), "data");
const archiveFile = path.join(archiveDir, "archive-runs.json");

async function ensureArchiveDir() {
  await mkdir(archiveDir, { recursive: true });
}

function entryAssets(entry) {
  const assets = entry?.generation?.assets;
  return Array.isArray(assets) ? assets : [];
}

function collectStorageKeys(entry) {
  const keys = new Map();
  for (const asset of entryAssets(entry)) {
    const mode = getAssetStorageMode(asset);
    if (mode !== "remote") continue;
    const key = extractStorageKeyFromAsset(asset);
    const provider = extractStorageProviderFromAsset(asset);
    if (key) keys.set(`${provider}:${key}`, { provider, key });
  }
  return keys;
}

async function sanitizeAssetForDelivery(asset) {
  const mode = getAssetStorageMode(asset);
  if (mode !== "remote") return asset;

  const key = extractStorageKeyFromAsset(asset);
  if (!key) {
    return {
      ...asset,
      status: "missing",
      url: null,
      storage: {
        ...(typeof asset.storage === "object" ? asset.storage : {}),
        mode: "remote",
        key: null,
        url: null,
      },
    };
  }

  const provider = extractStorageProviderFromAsset(asset);
  const exists = await hasStoredAsset({ provider, key });
  if (exists) return asset;

  const hasInlineFallback = Boolean(asset.base64 || asset.dataUri);
  return {
    ...asset,
    url: null,
    status: hasInlineFallback ? "fallback-inline" : "missing",
    storage: {
      ...(typeof asset.storage === "object" ? asset.storage : {}),
      mode: "remote",
      key,
      url: null,
      missing: true,
    },
  };
}

async function sanitizeEntryForDelivery(entry) {
  const assets = entryAssets(entry);
  if (assets.length === 0) return entry;
  const nextAssets = [];
  for (const asset of assets) {
    nextAssets.push(await sanitizeAssetForDelivery(asset));
  }
  return {
    ...entry,
    generation: {
      ...(entry.generation || {}),
      assets: nextAssets,
    },
  };
}

async function removeOrphanKeys(keys) {
  for (const ref of keys.values()) {
    await removeStoredAsset(ref);
  }
}

export async function listArchiveRuns() {
  try {
    const raw = await readFile(archiveFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized = [];
    for (const item of parsed) {
      sanitized.push(await sanitizeEntryForDelivery(item));
    }
    return sanitized;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveArchiveRun(entry) {
  await ensureArchiveDir();
  const existing = await listArchiveRuns();
  const next = [entry, ...existing];
  await writeFile(archiveFile, JSON.stringify(next, null, 2), "utf8");
}

export async function clearArchiveRuns() {
  const existing = await listArchiveRuns();
  const keys = new Set();
  const refs = new Map();
  for (const entry of existing) {
    for (const [compound, ref] of collectStorageKeys(entry)) {
      refs.set(compound, ref);
    }
  }
  await removeOrphanKeys(refs);
  await rm(archiveFile, { force: true });
}

export async function updateArchiveRun(entryId, nextEntry) {
  await ensureArchiveDir();
  const existing = await listArchiveRuns();
  let found = false;
  const orphanKeys = new Map();
  const updated = existing.map((item) => {
    if (item.id !== entryId) return item;
    found = true;
    const oldKeys = collectStorageKeys(item);
    const newKeys = collectStorageKeys(nextEntry);
    for (const [compound, ref] of oldKeys) {
      if (!newKeys.has(compound)) orphanKeys.set(compound, ref);
    }
    return nextEntry;
  });
  if (!found) return false;
  await removeOrphanKeys(orphanKeys);
  await writeFile(archiveFile, JSON.stringify(updated, null, 2), "utf8");
  return true;
}

export async function deleteArchiveRun(entryId) {
  await ensureArchiveDir();
  const existing = await listArchiveRuns();
  let deletedEntry = null;
  const updated = existing.filter((item) => {
    if (item.id !== entryId) return true;
    deletedEntry = item;
    return false;
  });
  if (!deletedEntry) return false;
  const refs = collectStorageKeys(deletedEntry);
  await removeOrphanKeys(refs);
  await writeFile(archiveFile, JSON.stringify(updated, null, 2), "utf8");
  return true;
}
