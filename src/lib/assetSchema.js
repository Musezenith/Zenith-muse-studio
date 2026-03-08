function isLikelyBase64(value) {
  return (
    typeof value === "string" &&
    value.length > 64 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(value)
  );
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeImageAsset(raw, index = 0) {
  if (!raw) return null;

  if (typeof raw === "string") {
    if (raw.startsWith("http")) {
      return {
        id: `asset-${index + 1}`,
        kind: "image",
        storage: {
          mode: "remote",
          provider: "unknown",
          key: null,
          url: raw,
        },
        url: raw,
        dataUri: null,
        base64: null,
        mimeType: null,
        size: null,
        createdAt: nowIso(),
        status: "ready",
      };
    }
    if (raw.startsWith("data:image/")) {
      return {
        id: `asset-${index + 1}`,
        kind: "image",
        storage: {
          mode: "inline",
          provider: "inline",
          key: null,
          url: null,
        },
        url: null,
        dataUri: raw,
        base64: null,
        mimeType: raw.slice(5, raw.indexOf(";")) || "image/png",
        size: null,
        createdAt: nowIso(),
        status: "ready",
      };
    }
    if (isLikelyBase64(raw)) {
      return {
        id: `asset-${index + 1}`,
        kind: "image",
        storage: {
          mode: "inline",
          provider: "inline",
          key: null,
          url: null,
        },
        url: null,
        dataUri: null,
        base64: raw,
        mimeType: "image/png",
        size: null,
        createdAt: nowIso(),
        status: "ready",
      };
    }
    return null;
  }

  const id = raw.id || raw.assetId || `asset-${index + 1}`;
  const storageObj = typeof raw.storage === "object" ? raw.storage : null;
  const storageMode =
    storageObj?.mode || (raw.storage === "remote" || raw.url ? "remote" : "inline");
  const url = raw.url || raw.uri || raw.gcsUri || storageObj?.url || null;
  const dataUri = raw.dataUri || null;
  const base64 = raw.base64 || raw.bytesBase64Encoded || null;
  const mimeType = raw.mimeType || raw.mime || "image/png";

  if (!url && !dataUri && !base64) return null;

  return {
    id,
    kind: raw.kind || "image",
    storage: {
      mode: storageMode,
      provider: storageObj?.provider || (storageMode === "remote" ? "unknown" : "inline"),
      key: storageObj?.key || null,
      url: storageObj?.url || url || null,
    },
    url,
    dataUri,
    base64,
    mimeType,
    size: Number.isFinite(raw.size) ? raw.size : null,
    createdAt: raw.createdAt || nowIso(),
    status: raw.status || "ready",
  };
}

export function getImageAssetPreviewUrl(asset) {
  if (!asset) return "";
  if (asset.status !== "missing" && asset.url) return asset.url;
  if (asset.dataUri) return asset.dataUri;
  if (asset.base64) {
    const mime = asset.mimeType || "image/png";
    return `data:${mime};base64,${asset.base64}`;
  }
  return "";
}

export function normalizeImageAssets(rawAssets = []) {
  return rawAssets
    .map((asset, index) => normalizeImageAsset(asset, index))
    .filter(Boolean);
}

export function toLegacyImages(assets = []) {
  return assets
    .map((asset, index) => {
      const previewUrl = getImageAssetPreviewUrl(asset);
      if (!previewUrl) return null;
      return {
        id: asset.id || `img-${index + 1}`,
        url: previewUrl,
      };
    })
    .filter(Boolean);
}
