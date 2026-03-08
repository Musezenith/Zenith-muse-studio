function nowIso() {
  return new Date().toISOString();
}

export function createRemoteImageAsset({
  id,
  url,
  mimeType = null,
  size = null,
  createdAt = null,
  provider = "filesystem",
  key = null,
  fallback = null,
  status = "ready",
}) {
  return {
    id,
    kind: "image",
    storage: {
      mode: "remote",
      provider,
      key,
      url,
    },
    url,
    dataUri: fallback?.dataUri || null,
    base64: fallback?.base64 || null,
    mimeType,
    size,
    createdAt: createdAt || nowIso(),
    status,
  };
}

export function createInlineImageAsset({
  id,
  base64 = null,
  dataUri = null,
  mimeType = "image/png",
  size = null,
  createdAt = null,
  status = "ready",
}) {
  return {
    id,
    kind: "image",
    storage: {
      mode: "inline",
      provider: "inline",
      key: null,
      url: null,
    },
    url: null,
    dataUri,
    base64,
    mimeType,
    size,
    createdAt: createdAt || nowIso(),
    status,
  };
}

export function assetToLegacyImage(asset) {
  if (!asset) return null;
  if (asset.url) return { id: asset.id, url: asset.url };
  if (asset.dataUri) return { id: asset.id, url: asset.dataUri };
  if (asset.base64) {
    const mime = asset.mimeType || "image/png";
    return { id: asset.id, url: `data:${mime};base64,${asset.base64}` };
  }
  return null;
}

export function assetsToLegacyImages(assets = []) {
  return assets.map(assetToLegacyImage).filter(Boolean);
}

export function getAssetStorageMode(asset) {
  if (!asset) return "";
  if (typeof asset.storage === "string") return asset.storage;
  return asset.storage?.mode || "";
}

export function getAssetStorageKey(asset) {
  if (!asset) return "";
  if (typeof asset.storage === "object" && asset.storage?.key) {
    return asset.storage.key;
  }
  return "";
}
