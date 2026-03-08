# ImageFactory Runtime (Production Hardening)

## Runtime Modes

- Default mode: `IMAGE_QUEUE=inline`
  - API request executes provider call directly in-process.
- Worker mode: `IMAGE_QUEUE=worker`
  - API enqueues generation job and waits for worker completion.
  - Worker process executes provider call and writes result back to queue table.

## Start Commands

```bash
# API
npm run dev:api

# Optional worker (required when IMAGE_QUEUE=worker)
npm run dev:imagen-worker
```

## Environment Variables

- `IMAGE_QUEUE=inline|worker` (default: `inline`)
- `IMAGE_QUEUE_WAIT_TIMEOUT_MS` (API wait timeout for worker mode)
- `IMAGE_QUEUE_POLL_MS` (API poll interval)
- `IMAGEN_WORKER_ID` (optional worker identifier)
- `IMAGEN_WORKER_POLL_MS` (worker poll interval)
- `OPENAI_TIMEOUT_MS` (OpenAI upstream timeout, default 30000)

Provider configuration:
- `IMAGE_PROVIDER=mock|vertex|openai|replicate|comfy`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL` (default: `gpt-image-1`)

## Diagnostics Endpoint

`GET /api/imagen/providers`

Response:

```json
{
  "active_provider": "openai",
  "supported_providers": ["mock", "vertex", "openai", "replicate", "comfy"],
  "queue_mode": "inline"
}
```

## Artifact and Asset Behavior

- Provider outputs are validated before persistence.
- Normalized response includes:
  - `provider`
  - `generation_time_ms`
  - `images[]` items with `url`, `asset_key`, `width`, `height`, `size_bytes`, `provider`
- `assets[]` remains present for existing archive/case-study/proof-pack flows.

## Safety Notes

- Queue mode does not change route contract (`POST /api/vertex/imagen/generate`).
- Inline fallback remains available by setting `IMAGE_QUEUE=inline`.
- Proof pack semantics and server-side permission enforcement are unchanged.
