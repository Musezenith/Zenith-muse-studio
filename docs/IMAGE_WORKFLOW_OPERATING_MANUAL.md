# Musezenith Studio - Image Workflow Operating Manual

## 1) Purpose and audience
This document is the source of truth for how the generated-image workflow works today in Musezenith Studio.

Audience:
- Internal operators
- QA/testers
- Sales/demo owners
- Support and onboarding teams
- Future customers (adapted excerpts)

Primary goals:
- Reduce onboarding time
- Reduce support ambiguity
- Standardize testing and demos
- Keep product behavior aligned across PromptLab, Archive, Compare, Final selection, Re-run, and Export

## 2) Scope
In scope:
- Prompt creation and generation in PromptLab
- Generation lifecycle states and recovery actions
- Asset model and delivery behavior
- Archive storage and retrieval
- Compare flow
- Final selection flow
- Re-run flow
- Export bundle flow
- Failure/fallback/missing-asset behavior

Out of scope:
- Non-image modules/pages outside current image workflow
- Internal model-quality tuning logic beyond visible controls

## 3) Product-level workflow summary
End-to-end flow:
1. User enters brief and generation settings in PromptLab.
2. App builds structured payload (`prompt + quality + generation`).
3. App calls backend `POST /api/vertex/imagen/generate`.
4. Backend generates assets and returns normalized `assets` (with legacy `images` alias).
5. PromptLab previews generated images.
6. Run is persisted into Archive.
7. User can:
   - Search/filter/sort runs
   - Open run detail drawer
   - Compare left/right
   - Mark run/image final
   - Re-run archived payload
   - Export run bundle

## 4) Screen-by-screen guide
### 4.1 PromptLab
Purpose:
- Create prompt package and request image generation.

Inputs:
- Brief (textarea)
- Preset
- Seed policy (`locked`, `incremental`, `random`)
- Variants (1-8)
- Base seed
- Model

Primary actions:
- `Generate Prompt + Images`
- `Retry` (uses last structured payload)
- `Cancel` (aborts in-flight request)

Outputs:
- Tabbed prompt package view: Positive / Negative / Params / QC / JSON / Score
- Generated image grid (from normalized assets)
- Run state indicator
- Toast feedback

Generation run states:
- `idle`
- `building`
- `generating`
- `success`
- `error`
- `cancelled`

Expected operator behavior:
- Use `Retry` for transient backend/provider failures.
- Use `Cancel` when generation is in progress and user intent changes.
- Use JSON tab to inspect/export exact payload used.

### 4.2 Archive (list view)
Purpose:
- Maintain historical runs and provide retrieval/operations.

Available controls:
- Search by brief/model/state/preset/type text
- Filter by run state
- Sort (newest/oldest/score)
- Compare Left / Compare Right (at run level)
- Mark run final / unmark
- Open detail
- Re-run
- Clear archive

List card elements:
- Type, timestamp, run state, model, score
- Final markers (run final, count of final images)
- Image preview grid
- Generation error banner (if failed)

### 4.3 Compare panel (side-by-side)
Purpose:
- Visual comparison between two targets.

Selection options:
- Run-level select to L/R
- Image-level select to L/R from detail drawer

Behavior:
- Each side keeps one target (`entryId`, optional `imageId`).
- Empty side shows guidance placeholder.
- Clear action resets one side only.

### 4.4 Archive detail drawer
Purpose:
- Deep review and decisioning for a single run.

Sections:
- Metadata: created, type, state, model, score, final summary
- Prompt: brief, positive, negative
- Result: variants, seed policy, aspect ratio, image gallery
- Raw JSON

Actions:
- Export bundle
- Mark/unmark run final
- Mark/unmark image final (multi-select)
- Compare selected image to left/right

Final selection visibility:
- Visible in list cards and detail drawer.

## 5) Data model (product-level)
### 5.1 Run record (high level)
A run record includes:
- Run identity: `id`, `type`, `createdAt`, `runState`
- Prompt payload snapshot
- Generation result
- Error (if any)
- Final selection:
  - `runFinal: boolean`
  - `imageIds: string[]`

### 5.2 Asset model (primary contract)
`assets` is the primary image contract across backend/frontend.

Normalized fields:
- `id`
- `kind` (`image`)
- `storage.mode` (`remote` or `inline`)
- `storage.provider` (e.g. `filesystem`, `s3`, `inline`)
- `storage.key` (object key if remote)
- `storage.url` (delivery URL if remote)
- `url` (primary render URL when available)
- `dataUri` (fallback)
- `base64` (fallback)
- `mimeType`
- `size`
- `createdAt`
- `status` (`ready`, `fallback-inline`, `missing`, etc.)

Compatibility rule:
- `images` remains as legacy alias derived from `assets`.
- All new UI logic should read `assets` first, then fallback to `images`.

### 5.3 Delivery mode rules
Primary mode:
- Remote URL asset delivery.

Fallback mode:
- Inline (`dataUri` / `base64`) per asset if remote persistence/upload fails.

Missing asset behavior:
- If remote object is missing later, backend sanitization marks asset missing and clears broken URL.
- UI degrades to inline fallback if present; otherwise image is unavailable but workflow remains functional.

## 6) Generation + persistence behavior
### 6.1 Normal generation
1. PromptLab builds payload.
2. Backend generates and normalizes assets.
3. Storage adapter attempts remote persistence.
4. Response returns normalized assets and legacy images alias.
5. Run is saved to Archive.

### 6.2 Upload failure fallback
- If provider upload fails for a given asset:
  - Asset remains inline
  - `status` indicates fallback behavior
  - UI still renders from fallback data

### 6.3 Cancel and retry
- Cancel:
  - Aborts in-flight generation request.
  - State becomes `cancelled`.
- Retry:
  - Reuses last structured payload.
  - Creates a new archived run entry.

## 7) Archive lifecycle and cleanup rules
When archive data changes:
- Replace/update run:
  - Dropped remote asset keys are cleaned up.
- Delete one run:
  - Run-linked remote objects are cleaned up.
- Clear archive:
  - Referenced remote objects are cleaned up.

Goal:
- Avoid orphaned objects and stale references.

## 8) Re-run behavior
What re-run does:
- Uses archived payload as input.
- Calls same generate endpoint.
- Stores result as a new archive entry (`prompt-lab-rerun`).

What re-run does not do:
- It does not mutate historical source run content (except explicit final selection updates by user action).

## 9) Final-selection rules
Run-level final:
- Toggle independently from image-level final picks.

Image-level final:
- Multi-select per run by image `id`.
- Independent of compare selection.

Persistence:
- Final selection is stored on the run record and survives reload.

## 10) Export bundle behavior
Export entry point:
- Archive detail drawer -> `Export bundle`.

Bundle contains:
- Run metadata
- Prompt package
- Quality/result metadata
- Generation config
- Normalized assets list
- Image references (URL/data-uri/base64 as available)

Export and missing assets:
- Bundle still exports even if some remote assets are missing.
- Missing assets are represented by current normalized status/reference data.

## 11) Edge cases and recovery paths
### Generation fails (provider/backend)
Symptoms:
- Error toast + error banner
- Run state `error`

Recovery:
- Retry in PromptLab
- Verify backend/provider credentials, timeout, and endpoint configs

### User cancels generation
Symptoms:
- State `cancelled`
- Request aborted

Recovery:
- Regenerate with same settings or adjust prompt/options

### Remote asset missing after archival
Symptoms:
- Asset URL not resolvable
- Asset marked `missing` or fallback status

Recovery:
- If inline fallback exists: UI still renders
- If no fallback: use Re-run to regenerate

### Archive backend unavailable
Symptoms:
- Save/load errors

Recovery:
- Local fallback path continues when configured
- Restore backend and refresh

## 12) Troubleshooting and FAQ
Q: Why do I see `images` and `assets`?
A: `assets` is primary contract. `images` is a legacy compatibility alias.

Q: Why is a run successful but one image is fallback-inline?
A: Upload can fail per asset. Fallback preserves usability without blocking whole run.

Q: Why does a remote image disappear later?
A: Object may have been removed externally or lifecycle-cleaned. If inline fallback exists, UI uses it. Otherwise re-run.

Q: Does marking final affect generation?
A: No. Final markers are curation metadata only.

Q: Does compare affect final selection?
A: No. Compare selection and final selection are independent.

Q: Can exported bundles be used for support/debug?
A: Yes. They include prompt/result/metadata and asset references.

## 13) Operational test checklist (pre-demo / pre-release)
1. Generate a run in PromptLab with 2+ variants.
2. Confirm run appears in Archive.
3. Open detail and verify prompt/result metadata.
4. Compare left/right from run and from image.
5. Mark run final and at least one image final.
6. Re-run and verify new entry is created.
7. Export bundle and inspect JSON for normalized assets.
8. Simulate provider/storage failure and confirm fallback-inline rendering.
9. Validate search/filter/sort in Archive.
10. Confirm missing-asset degradation path is non-breaking.

## 14) Reuse guidance
Use this manual as source for:
- Onboarding docs (operator-focused)
- Demo script (happy path + failure recovery)
- Landing-page copy (workflow and reliability claims)
- Customer support responses (FAQ/error handling)

When product behavior changes:
- Update this file first.
- Then update README snippets and demo/support scripts derived from it.
