# AGENTS

## Repo mission
- Muse Studio app repository.
- Contains frontend, server, scripts, and docs.
- Prefer small, safe, verifiable changes.

## Hard rules
- Do not change finalized 4.3 semantics:
  - `proof_asset_packs` is a persisted snapshot artifact, not a live computed view.
  - Regenerate is required to refresh.
  - No auto-sync from upstream entities.
  - Backend permission enforcement must remain in place.
  - Audit events must remain:
    - `proof_pack_generated`
    - `proof_pack_updated`
- Never commit secrets, credentials, local runtime data, or generated junk.
- Never add these paths to git:
  - `data/`
  - `muse-fix/`
  - `gen-lang-client-0905885162-15b395aaa816.json`
- No large refactors unless explicitly requested.
- Prefer minimal diffs.

## Working conventions
- Before changes: check `git status` and confirm scope.
- UI-only requests must not change business logic or backend behavior.
- Extract reusable UI components when clearly beneficial.
- Review staged diff before commit.
- If a secret-like tracked file is detected, stop and report.

## Verification commands
- `npm run build`
- `npm run test:proof-pack`
- `npm run test:testimonial`
- `npm run test:case-study`

## Commit conventions
- Use conventional commits.
- Keep commit message short and scope-accurate.
- Do not bundle unrelated changes in one commit.

## Release reference
- Current tagged release: `v0.4.3-proof-pack-ui-vi`
