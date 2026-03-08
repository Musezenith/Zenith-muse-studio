import { normalizeImageAssets } from "./assetSchema";

function inferImageRef(item, fallbackId) {
  if (!item) return null;

  if (typeof item === "string") {
    if (item.startsWith("http")) {
      return { id: fallbackId, type: "url", value: item };
    }
    if (item.startsWith("data:image/")) {
      return { id: fallbackId, type: "data-uri", value: item };
    }
    return { id: fallbackId, type: "raw", value: item };
  }

  if (item.url) {
    if (String(item.url).startsWith("data:image/")) {
      return { id: item.id || fallbackId, type: "data-uri", value: item.url };
    }
    return { id: item.id || fallbackId, type: "url", value: item.url };
  }

  if (item.dataUri) {
    return { id: item.id || fallbackId, type: "data-uri", value: item.dataUri };
  }

  if (item.base64) {
    return { id: item.id || fallbackId, type: "base64", value: item.base64 };
  }

  return null;
}

function collectImageReferences(run) {
  const refs = [];
  const normalizedAssets = normalizeImageAssets(run?.generation?.assets || []);
  if (normalizedAssets.length > 0) {
    normalizedAssets.forEach((asset, index) => {
      const ref = inferImageRef(asset, `asset-${index + 1}`);
      if (ref) refs.push(ref);
    });
  }

  const rawImages = run?.generation?.raw?.images;

  if (refs.length === 0 && Array.isArray(rawImages)) {
    rawImages.forEach((img, index) => {
      const ref = inferImageRef(img, `raw-${index + 1}`);
      if (ref) refs.push(ref);
    });
  }

  if (refs.length === 0 && Array.isArray(run?.generation?.images)) {
    run.generation.images.forEach((img, index) => {
      const ref = inferImageRef(img, `img-${index + 1}`);
      if (ref) refs.push(ref);
    });
  }

  return refs;
}

export function createArchiveRunBundle(run) {
  const normalizedAssets = normalizeImageAssets(
    run?.generation?.assets || run?.generation?.images || []
  );

  return {
    bundleVersion: "2026-03-08.archive-run.v1",
    exportedAt: new Date().toISOString(),
    run: {
      id: run.id,
      type: run.type,
      createdAt: run.createdAt,
      runState: run.runState || "idle",
      generationError: run.generationError || null,
    },
    promptPackage: run.payload?.prompt || null,
    quality: run.payload?.quality || run.exportPayload?.scores || null,
    generation: {
      provider: run.generation?.provider || run.payload?.generation?.provider || null,
      model: run.generation?.model || run.payload?.generation?.model || null,
      requestId: run.generation?.requestId || null,
      config: run.payload?.generation || null,
      assets: normalizedAssets,
      imageReferences: collectImageReferences(run),
    },
    metadata: {
      source: run.payload?.source || run.exportPayload?.meta || null,
      hasImages: normalizedAssets.length > 0,
      imageCount: normalizedAssets.length,
    },
  };
}

export function downloadArchiveRunBundle(run) {
  const bundle = createArchiveRunBundle(run);
  const fileName = `muse-archive-run-${run.id || Date.now()}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
