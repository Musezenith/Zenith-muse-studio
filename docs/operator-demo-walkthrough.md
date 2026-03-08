# Operator Demo Walkthrough

This walkthrough demonstrates the current end-to-end studio flow using local mock generation.

## 1) Start Local Runtime

From repo root:

```bash
# API (mock image mode)
MOCK_IMAGEN=1 npm run dev:api

# Frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open: `http://127.0.0.1:5173`

## 2) Dashboard (`/dashboard`)
- Review workload summary by status.
- Open recent jobs to inspect SLA, quote, and artifact context.

## 3) Intake New (`/intake/new`)
- Create a new client brief with deliverables/deadline.
- Optional: mark pilot mode and permission flags.
- Submit to create a new job record.

## 4) Job Detail (`/jobs/:id`)
- Confirm job context, references, SLA panel, audit timeline.
- From here you can navigate to quote creation and generation-related modules.

## 5) Quote New (`/jobs/:id/quotes/new`)
- Generate a quote draft from package inputs.
- Use override fields if needed.
- Save to create immutable quote version.

## 6) Quote Detail (`/quotes/:id`)
- Validate scope/timeline/assumptions.
- Use print-friendly view if needed.

## 7) Prompt Lab (`/prompt-lab`)
- Enter brief and select generation params.
- Click **Generate Prompt + Images**.
- Result includes prompt package + generated image assets.

## 8) Image Factory (`/image-factory`)
- Current release shows module landing/presentation.
- Operational generation interaction remains centered in Prompt Lab + Archive.

## 9) Docs Hub (`/docs`) and Doc Detail (`/docs/:slug`)
- Browse internal operations docs.
- Use category/status/tag filters and keyword search in hub.
- Read full SOP details in document page.

## 10) Archive (`/archive`)
- Review stored runs, compare variants, rerun payloads.
- Mark final runs/images and export run bundles.

## Notes on Output
- With `MOCK_IMAGEN=1`, generation output is deterministic mock image assets.
- Asset records still flow through storage + archive + downstream case-study/proof-pack composition.
- To move to real providers, configure `IMAGE_PROVIDER` and provider credentials per integration plan.
