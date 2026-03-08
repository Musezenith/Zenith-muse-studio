# Provider Integration Plan (Non-breaking)

## Goal
Move from mock-only demo mode to real image providers without changing routes or business logic.

## Existing Stable Contract
- Request route remains: `POST /api/vertex/imagen/generate`.
- Frontend contract remains: `generateImagesWithImagen(payload)` returns `{ assets, images, model, requestId }`.
- Storage and archive/proof-pack downstream remain unchanged.

## Current Adapter State
- Implemented providers:
  - `mock`
  - `vertex`
  - `openai`
- Reserved provider keys (safe placeholder):
  - `replicate`
  - `comfy`
- Unsupported/placeholder providers return explicit `501`.

## Runtime Switch
- `IMAGE_PROVIDER=mock|vertex|openai|replicate|comfy`
- Backward compatibility:
  - If `IMAGE_PROVIDER` is unset and `MOCK_IMAGEN=1`, system uses mock.
  - If unset and `MOCK_IMAGEN!=1`, system uses vertex.

## Implementation Steps for Real Providers
1. Add provider-specific request builders and response mappers in `server/imagenService.mjs`.
2. Preserve normalized output to `assetSchema` shape.
3. Keep `persistAssetsWithFallback()` unchanged so storage behavior is shared.
4. Keep route and payload shape unchanged to avoid UI/backend contract churn.
5. Add focused endpoint tests per provider behind env flags.

## Suggested Env Additions
- OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_IMAGE_MODEL`
- Replicate:
  - `REPLICATE_API_TOKEN`
  - `REPLICATE_PREDICT_ENDPOINT`
- ComfyUI:
  - `COMFYUI_ENDPOINT`

## Guardrails
- Do not alter proof pack semantics.
- Keep backend permission enforcement server-side.
- Keep audit actions intact.

## OpenAI Provider Activation
- Required env:
  - `IMAGE_PROVIDER=openai`
  - `OPENAI_API_KEY=<your_api_key>`
  - optional `OPENAI_IMAGE_MODEL=gpt-image-1`
- Runtime example:
  - `IMAGE_PROVIDER=openai OPENAI_API_KEY=... npm run dev:api`
- Response normalization (same shape as other providers):
  - `provider`
  - `generation_time_ms`
  - `images[]` with `{ url, asset_key, width, height, provider }`
  - `assets[]` remains available for archive/case-study/proof-pack downstream usage.
- Troubleshooting:
  - `500 Missing OPENAI_API_KEY`: key not configured.
  - `4xx/5xx OpenAI image generation failed`: inspect API key/model/quota and upstream error body.
  - `502 OpenAI returned no image assets`: provider returned empty payload; retry with simpler prompt/model defaults.
