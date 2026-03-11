#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail deploy

step "Setting active project"
gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

step "Ensuring BigQuery dataset exists"
if ! bq --project_id="${GCP_PROJECT_ID}" show --dataset "${BQ_DATASET_STUDIO}" >/dev/null 2>&1; then
  bq --location="${GCP_REGION}" --project_id="${GCP_PROJECT_ID}" mk --dataset "${BQ_DATASET_STUDIO}"
fi

step "Applying BigQuery schema"
TMP_SQL="$(mktemp)"
trap 'rm -f "${TMP_SQL}"' EXIT
sed \
  -e "s/PROJECT_ID/${GCP_PROJECT_ID}/g" \
  -e "s/BQ_DATASET_STUDIO/${BQ_DATASET_STUDIO}/g" \
  "${ROOT_DIR}/deploy/bigquery/schema.sql" > "${TMP_SQL}"

bq --location="${GCP_REGION}" --project_id="${GCP_PROJECT_ID}" query --nouse_legacy_sql < "${TMP_SQL}"

echo "BIGQUERY_SETUP: PASS"
