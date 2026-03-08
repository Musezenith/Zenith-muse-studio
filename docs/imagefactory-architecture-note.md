# ImageFactory Architecture Note

## 1) Request Path
- UI trigger: `PromptLab` (and Archive rerun) calls `generateImagesWithImagen()`.
- Frontend endpoint: `src/lib/imagenClient.js` -> `POST /api/vertex/imagen/generate`.
- API handler: `server/index.mjs` (single route handler near bottom).
- Generation core: `server/imagenService.mjs`.

## 2) Provider Selection
- Runtime switch is read in `imagenService.readConfig()`.
- `IMAGE_PROVIDER` controls adapter selection.
- Resolution behavior:
  - `IMAGE_PROVIDER=mock` -> mock generator.
  - `IMAGE_PROVIDER=vertex` (or `vertex-imagen`) -> Vertex Imagen flow.
  - empty `IMAGE_PROVIDER` -> backward-compatible fallback:
    - `MOCK_IMAGEN=1` => mock
    - else => vertex
- Placeholder provider keys (`openai`, `replicate`, `comfy`) are recognized and currently return explicit `501` to avoid silent behavior drift.

## 3) Generation + Persistence
- Adapter output is normalized into asset schema objects (`assetSchema.mjs`).
- `persistAssetsWithFallback()` stores inline image bytes by storage provider (`assetStorage.mjs`):
  - filesystem -> `data/object-assets/...` + URL `/api/assets/<key>`
  - s3 -> object key + delivery URL (`/api/assets/s3/<key>` or configured public URL)
- Response includes both:
  - `assets` (normalized structured asset records)
  - `images` (legacy array for compatibility)

## 4) Side Effects on Success
- `server/index.mjs` logs audit event:
  - `prompt_generated` or `rerun_triggered` (if rerun_count > 0)
- Writes generation cost run (`generationCostStore.mjs`).
- Updates SLA first-output milestone (`first_output_created` audit path).

## 5) Downstream Consumers
- `Archive` stores generation runs (`/api/archive/runs` -> `archiveFileStore.mjs` JSON file).
- `CaseStudy` pulls final asset metadata from:
  - job references uploads
  - archive run generation assets for matching job_id
- `Proof Asset Pack` uses case-study snapshot output and persists into `proof_asset_packs`.
