import { normalizeImageAssets, toLegacyImages } from "./assetSchema";

export async function generateImagesWithImagen(payload, options = {}) {
  const endpoint =
    import.meta.env.VITE_IMAGEN_BACKEND_URL || "/api/vertex/imagen/generate";

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: options.signal,
      body: JSON.stringify({
        payload,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Generation cancelled");
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let parsed = null;
    try {
      parsed = errorText ? JSON.parse(errorText) : null;
    } catch (error) {
      parsed = null;
    }
    const message =
      parsed?.error?.message || parsed?.message || errorText || "unknown error";
    throw new Error(`Imagen request failed (${response.status}): ${message}`);
  }

  const body = await response.json();
  const rawAssets = Array.isArray(body.assets)
    ? body.assets
    : Array.isArray(body.images)
    ? body.images
    : [];
  const assets = normalizeImageAssets(rawAssets);
  const images = toLegacyImages(assets);

  return {
    provider: "vertex-imagen",
    model: body.model || payload.generation.model,
    requestId: body.requestId || null,
    assets,
    images,
    raw: body,
  };
}
