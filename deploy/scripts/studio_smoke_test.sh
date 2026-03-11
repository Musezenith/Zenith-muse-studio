#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail verify

API_BASE="$(resolve_api_base)"

step "Compile"
COMPILE_JSON="$(curl --fail --silent -H "content-type: application/json" -d '{"project_title":"Smoke Compile","client_name":"MIKAGE ZENITH","campaign_name":"smoke-campaign","creative_direction":"Porcelain couture","environment":"studio","creative_brief":"Smoke compile for deploy verification.","preset":"mikage-porcelain-canon","archetype":"the-porcelain-muse","restrictions":["no watermark","no anatomy drift"],"canon_seed":230101}' "${API_BASE}/api/studio/prompt-compiler/compile")"

step "Create job"
JOB_JSON="$(curl --fail --silent -H "content-type: application/json" --data @"${ROOT_DIR}/tests/fixtures/mikageBrief.json" "${API_BASE}/api/mikage/jobs")"
JOB_ID="$(python3 - "${JOB_JSON}" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
print(payload["item"]["job"]["id"])
PY
)"

step "Run three modes"
RUN_JSON="$(curl --fail --silent -H "content-type: application/json" -d "{\"job_id\":\"${JOB_ID}\",\"batch_size\":1,\"canon_seed\":230101}" "${API_BASE}/api/mikage/run-three-modes")"
RUN_ID="$(python3 - "${RUN_JSON}" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
item = payload["item"]
provider = item.get("provider_used") or ((item.get("generation_runtime") or {}).get("provider_used"))
if provider != "imagen":
    raise SystemExit(f"Expected Imagen provider, got {provider!r}")
print(item["id"])
PY
)"

step "Review"
curl --fail --silent -H "content-type: application/json" -d '{"soul_fidelity":8,"visual_attraction":8,"luxury_editorial":8,"usable_asset_strength":8,"canon_potential":8,"reviewer":"smoke-script"}' "${API_BASE}/api/mikage/runs/${RUN_ID}/review-score" >/dev/null

step "Canon"
curl --fail --silent -H "content-type: application/json" -d '{"selected_mode":"canon_core","approved_by":"smoke-script"}' "${API_BASE}/api/mikage/runs/${RUN_ID}/canon-gate" >/dev/null

step "Archive"
ARCHIVE_JSON="$(curl --fail --silent -H "content-type: application/json" -d '{"objective":"smoke archive","classification":"canon_candidate"}' "${API_BASE}/api/mikage/runs/${RUN_ID}/archive")"

python3 - "${COMPILE_JSON}" "${RUN_JSON}" "${ARCHIVE_JSON}" <<'PY'
import json, sys
compile_payload = json.loads(sys.argv[1])
run_payload = json.loads(sys.argv[2])
archive_payload = json.loads(sys.argv[3])
receipts = ((compile_payload.get("item") or {}).get("prompt_receipts") or [])
if not receipts:
    raise SystemExit("No prompt receipts returned from compile")
archive_item = archive_payload.get("item") or {}
if not (archive_item.get("asset") or {}).get("id"):
    raise SystemExit("Archive asset was not created")
print("SMOKE_APP_FLOW: PASS")
PY

step "Verify receipts and archive manifests in GCS"
gcloud storage ls "gs://${GCS_BUCKET_RECEIPTS}/prompt-receipts/" >/dev/null
gcloud storage ls "gs://${GCS_BUCKET_ASSETS}/generation-assets/" >/dev/null
gcloud storage ls "gs://${GCS_BUCKET_ARCHIVE}/archive-lineage/" >/dev/null

step "Verify BigQuery lineage rows"
bq --project_id="${GCP_PROJECT_ID}" query --nouse_legacy_sql --format=json "SELECT COUNT(1) AS count FROM \`${GCP_PROJECT_ID}.${BQ_DATASET_STUDIO}.prompt_receipts\`" >/dev/null
bq --project_id="${GCP_PROJECT_ID}" query --nouse_legacy_sql --format=json "SELECT COUNT(1) AS count FROM \`${GCP_PROJECT_ID}.${BQ_DATASET_STUDIO}.generation_jobs\`" >/dev/null

echo "SMOKE_TEST: PASS"
