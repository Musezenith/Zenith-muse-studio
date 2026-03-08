# Proof Pack Verification Report

## Flow Verified
`PromptLab/Image generation` -> `Archive run assets` + `Job references` -> `CaseStudy draft` -> `Proof Asset Pack snapshot`.

## Evidence in Code
- Generate endpoint: `server/index.mjs` -> `/api/vertex/imagen/generate`.
- Case-study data composition: `server/caseStudyStore.mjs` (`collectFinalAssetMetadata`).
- Proof-pack generation/update: `server/proofAssetPackStore.mjs`.
- API endpoints:
  - `POST /api/jobs/:id/proof-pack/generate`
  - `GET /api/jobs/:id/proof-pack`
  - `PUT /api/jobs/:id/proof-pack`

## Semantics Check (4.3)
- Persisted snapshot artifact: YES
  - proof pack stored in table `proof_asset_packs`.
- Regenerate required to refresh: YES
  - refresh happens only when `/proof-pack/generate` is called.
- No auto-sync from upstream: YES
  - upstream changes (quote/audit/archive) do not auto-update stored proof pack.
- Server-side permission enforcement: YES
  - `ensureWritable()` + eligibility checks in server store.
- Audit events preserved: YES
  - `proof_pack_generated`
  - `proof_pack_updated`

## Snapshot Immutability Clarification
- Current model is **single persisted record per job** (`job_id UNIQUE`).
- Regenerate/update replaces current record content (same job row), not versioned history rows.
- This still preserves 4.3 approved semantics (persisted snapshot + explicit regenerate), but does not keep multiple historical proof-pack versions.
