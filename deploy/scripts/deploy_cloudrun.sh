#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail deploy

SERVICE_NAME="${SERVICE_NAME:-muse-studio-api}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-studio-os-runtime}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"

step "Rendering Cloud Run manifest"
TMP_YAML="$(mktemp)"
trap 'rm -f "${TMP_YAML}"' EXIT
sed \
  -e "s|__IMAGE_URI__|${IMAGE_URI}|g" \
  -e "s|__GCP_PROJECT_ID__|${GCP_PROJECT_ID}|g" \
  -e "s|__GCP_REGION__|${GCP_REGION}|g" \
  -e "s|__VERTEX_IMAGEN_MODEL__|${VERTEX_IMAGEN_MODEL}|g" \
  -e "s|__GCS_BUCKET_ASSETS__|${GCS_BUCKET_ASSETS}|g" \
  -e "s|__GCS_BUCKET_ARCHIVE__|${GCS_BUCKET_ARCHIVE}|g" \
  -e "s|__GCS_BUCKET_RECEIPTS__|${GCS_BUCKET_RECEIPTS}|g" \
  -e "s|__BQ_DATASET_STUDIO__|${BQ_DATASET_STUDIO}|g" \
  -e "s|name: muse-studio-api|name: ${SERVICE_NAME}|g" \
  -e "s|serviceAccountName: studio-os-runtime|serviceAccountName: ${SERVICE_ACCOUNT_NAME}|g" \
  "${ROOT_DIR}/deploy/cloudrun/service.yaml" > "${TMP_YAML}"

step "Deploying Cloud Run service"
gcloud run services replace "${TMP_YAML}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}"

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  step "Binding unauthenticated invoker role"
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region="${GCP_REGION}" \
    --project="${GCP_PROJECT_ID}" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    >/dev/null
fi

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}" --format='value(status.url)')"
step "Cloud Run URL: ${SERVICE_URL}"
step "Runtime service account: ${SERVICE_ACCOUNT_EMAIL}"

echo "CLOUD_RUN_DEPLOY: PASS"
