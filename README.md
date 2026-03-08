# muse-studio
AI fashion studio app

## Prompt Lab backend integration
- `Prompt Lab` now emits a structured payload and posts generation requests to Imagen.
- Default endpoint: `/api/vertex/imagen/generate`
- Override endpoint with env: `VITE_IMAGEN_BACKEND_URL=https://your-backend/imagen/generate`
- Local API server script: `npm run dev:api` (default port `8787`)
- Integration tests: `npm run test:integration`

### Expected backend response shape
```json
{
  "requestId": "req_123",
  "model": "imagen-3.0-generate-002",
  "images": [
    { "id": "v1-1", "url": "https://..." },
    { "id": "v2-1", "base64": "iVBORw0..." }
  ],
  "meta": {
    "provider": "vertex-imagen",
    "variantsRequested": 2,
    "variantsResolved": 2
  },
  "latencyMs": 1450
}
```

### Notes
- `variants` + `seedPolicy` are sent in payload under `generation`.
- Each run is saved to local `Archive` (browser localStorage).
- Run lifecycle is normalized as: `idle | building | generating | success | error | cancelled`.
- Prompt Lab and Archive now include UX feedback with loading/retry/cancel toasts.

## Backend service (`/api/vertex/imagen/generate`)
Environment variables:
- `VERTEX_PROJECT_ID` required unless using `VERTEX_IMAGEN_ENDPOINT` override
- `VERTEX_LOCATION` optional, default `us-central1`
- `VERTEX_IMAGEN_MODEL` optional, default `imagen-3.0-generate-002`
- `VERTEX_IMAGEN_ENDPOINT` optional full override URL
- `VERTEX_TIMEOUT_MS` optional, default `45000`
- `PORT` optional, default `8787`
- `CORS_ORIGIN` optional, default `*`
- `VITE_API_PROXY_TARGET` optional Vite dev proxy target, default `http://localhost:8787`
- `MOCK_IMAGEN=1` optional mock mode for local testing
- `MOCK_IMAGEN_DELAY_MS` optional mock delay in ms (useful for timeout tests)
- `VITE_ARCHIVE_BACKEND_URL` optional archive API URL (enables backend persistence path)
- `MAX_JSON_BODY_BYTES` optional JSON body max bytes (default `8000000`)
- `STORAGE_PROVIDER` object-storage adapter (`filesystem` default, `none` to disable)
- `STORAGE_LOCAL_DIR` local object-storage directory (`data/object-assets` default)
- `STORAGE_PUBLIC_BASE_URL` public asset base URL (`/api/assets` default)
- `STORAGE_S3_BUCKET` S3 bucket name when `STORAGE_PROVIDER=s3`
- `STORAGE_S3_REGION` S3 region when `STORAGE_PROVIDER=s3`
- `STORAGE_S3_KEY_PREFIX` object key prefix (default `generated`)
- `STORAGE_S3_PUBLIC_BASE_URL` public CDN/base URL for `STORAGE_S3_URL_MODE=public`
- `STORAGE_S3_URL_MODE` `public` | `signed` | `proxy` (default `public`)
- `STORAGE_SIGNED_URL_TTL_SECONDS` signed URL TTL (default `900`)

Error response shape:
```json
{
  "requestId": "req_123",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Missing payload.prompt.positivePrompt",
    "details": null
  }
}
```

Archive backend routes (file-backed in `data/archive-runs.json`):
- `GET /api/archive/runs`
- `POST /api/archive/runs`
- `DELETE /api/archive/runs`

Documents backend routes (SQLite-backed in `data/studio.db` by default):
- `GET /api/documents`
- `GET /api/documents/:slug`

Jobs intake routes (SQLite-backed in `data/studio.db` by default):
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/overview`
- `PUT /api/jobs/:id/status`
- `PUT /api/jobs/:id/sla`
- `POST /api/jobs/:id/sla/recompute`
- `GET /api/jobs/:id/audit`
- `GET /api/jobs/:id/case-study/draft`
- `GET /api/jobs/:id/testimonial`
- `POST /api/jobs/:id/testimonial/generate`
- `PUT /api/jobs/:id/testimonial`
- `GET /api/jobs/:id/proof-pack`
- `POST /api/jobs/:id/proof-pack/generate`
- `PUT /api/jobs/:id/proof-pack`
- `POST /api/generation-cost-runs`

Proof Asset Pack behavior:
- Proof packs are persisted artifacts, not live computed views.
- `POST /api/jobs/:id/proof-pack/generate` captures a snapshot from current job/case-study/testimonial/SLA/cost/final-asset context.
- Upstream changes after generation do not auto-sync existing proof packs; regenerate to refresh.
- Source of truth:
  - Job/quote/SLA/testimonial records remain source of truth for operational data.
  - Proof pack record is the source of truth for publish-ready proof copy after operator edits/approval.
- Permission enforcement:
  - Read returns eligibility/visibility metadata for operator awareness.
  - Generate/update is blocked when job is not eligible.
  - Pilot jobs require case-study permission for proof-pack visibility/editability.
- Audit traceability:
  - `proof_pack_generated`
  - `proof_pack_updated`

Pilot mode fields:
- Jobs: `is_pilot`, `case_study_permission`, `testimonial_permission`
- Quotes: `is_pilot` (derived from job or explicit quote input override)

Quotes routes:
- `POST /api/quotes/draft`
- `POST /api/quotes`
- `GET /api/jobs/:id/quotes`
- `GET /api/quotes/:id`

Generated asset route (filesystem adapter):
- `GET /api/assets/:key`
- `GET /api/assets/s3/:encodedKey` (signed/proxy S3 delivery modes)

Normalized asset fields:
- `storage.mode`, `storage.provider`, `storage.key`, `storage.url`
- `mimeType`, `size`, `createdAt`, `status`
- remote URL is primary; inline (`base64`/`dataUri`) remains fallback

Documents scripts:
- `npm run documents:migrate`
- `npm run documents:seed`
- `npm run documents:rollback`
- `npm run test:documents`

Intake scripts:
- `npm run test:intake-validation`
- `npm run test:jobs-intake`
- `npm run test:quotes`
- `npm run test:jobs-overview`
- `npm run test:audit-log`
- `npm run test:pilot-mode`
- `npm run test:generation-cost`
- `npm run test:sla-logic`
- `npm run test:sla-endpoint`
- `npm run test:case-study`
- `npm run test:testimonial`
- `npm run test:proof-pack`
