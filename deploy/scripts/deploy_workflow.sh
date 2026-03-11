#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail deploy

WORKFLOW_NAME="${WORKFLOW_NAME:-studio_pipeline}"
SERVICE_NAME="${SERVICE_NAME:-muse-studio-api}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-studio-os-runtime}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
STUDIO_API_BASE_URL="$(resolve_api_base)"

step "Deploying workflow ${WORKFLOW_NAME}"
gcloud workflows deploy "${WORKFLOW_NAME}" \
  --location="${GCP_REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --source="${ROOT_DIR}/deploy/workflows/studio_pipeline.yaml" \
  --service-account="${SERVICE_ACCOUNT_EMAIL}" \
  --set-env-vars="STUDIO_API_BASE_URL=${STUDIO_API_BASE_URL},GCP_REGION=${GCP_REGION},GOOGLE_CLOUD_PROJECT=${GCP_PROJECT_ID}"

echo "WORKFLOW_DEPLOY: PASS"
