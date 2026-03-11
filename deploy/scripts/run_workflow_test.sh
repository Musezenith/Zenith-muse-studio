#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail verify

WORKFLOW_NAME="${WORKFLOW_NAME:-studio_pipeline}"
API_BASE="$(resolve_api_base)"

step "Creating Mikage job for workflow test"
JOB_JSON="$(curl --fail --silent -H "content-type: application/json" --data @"${ROOT_DIR}/tests/fixtures/mikageBrief.json" "${API_BASE}/api/mikage/jobs")"
JOB_ID="$(python3 - "${JOB_JSON}" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
print(payload["item"]["job"]["id"])
PY
)"

INPUT_JSON="$(mktemp)"
trap 'rm -f "${INPUT_JSON}"' EXIT
cat > "${INPUT_JSON}" <<EOF
{
  "project_id": "${GCP_PROJECT_ID}",
  "region": "${GCP_REGION}",
  "api_base": "${API_BASE}",
  "compile_payload": {
    "project_title": "Workflow test compile",
    "client_name": "MIKAGE ZENITH",
    "campaign_name": "workflow-test",
    "creative_direction": "Porcelain mysticism",
    "environment": "studio",
    "creative_brief": "Workflow compile step for Mikage deploy verification.",
    "preset": "mikage-porcelain-canon",
    "archetype": "the-porcelain-muse",
    "restrictions": ["no watermark", "no anatomy drift"],
    "canon_seed": 229901
  },
  "generate_payload": {
    "job_id": "${JOB_ID}",
    "batch_size": 1,
    "canon_seed": 229901
  },
  "review_payload": {
    "soul_fidelity": 8,
    "visual_attraction": 8,
    "luxury_editorial": 8,
    "usable_asset_strength": 8,
    "canon_potential": 8,
    "reviewer": "workflow-script"
  },
  "canon_payload": {
    "selected_mode": "canon_core",
    "approved_by": "workflow-script"
  },
  "archive_payload": {
    "objective": "workflow archive verification",
    "classification": "canon_candidate"
  }
}
EOF

step "Running workflow ${WORKFLOW_NAME}"
WORKFLOW_OUTPUT="$(gcloud workflows run "${WORKFLOW_NAME}" --location="${GCP_REGION}" --project="${GCP_PROJECT_ID}" --data="$(cat "${INPUT_JSON}")")"
printf '%s\n' "${WORKFLOW_OUTPUT}" >/dev/null

echo "WORKFLOW_RUN: PASS"
