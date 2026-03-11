#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail deploy

SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-studio-os-runtime}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

step "Setting active project"
gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

step "Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  workflows.googleapis.com \
  secretmanager.googleapis.com

step "Ensuring runtime service account exists"
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" --display-name="Studio OS Runtime"
fi

step "Binding runtime IAM roles"
declare -a ROLES=(
  "roles/aiplatform.user"
  "roles/storage.objectAdmin"
  "roles/bigquery.dataEditor"
  "roles/bigquery.jobUser"
  "roles/workflows.invoker"
  "roles/secretmanager.secretAccessor"
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="${role}" \
    >/dev/null
done

echo "BOOTSTRAP: PASS"
