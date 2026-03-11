#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail deploy

ensure_bucket() {
  local bucket="$1"
  step "Ensuring bucket exists: gs://${bucket}"
  if gcloud storage buckets describe "gs://${bucket}" >/dev/null 2>&1; then
    return
  fi
  gcloud storage buckets create "gs://${bucket}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCP_REGION}" \
    --uniform-bucket-level-access
}

step "Setting active project"
gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
ensure_bucket "${GCS_BUCKET_ASSETS}"
ensure_bucket "${GCS_BUCKET_ARCHIVE}"
ensure_bucket "${GCS_BUCKET_RECEIPTS}"

echo "STORAGE: PASS"
