#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail verify

declare -a TABLES=(
  "generation_jobs"
  "prompt_receipts"
  "review_scores"
  "canon_classifications"
  "provider_usage"
)

for table in "${TABLES[@]}"; do
  step "Verifying table ${BQ_DATASET_STUDIO}.${table}"
  bq --project_id="${GCP_PROJECT_ID}" show "${BQ_DATASET_STUDIO}.${table}" >/dev/null
done

echo "BIGQUERY_VERIFY: PASS"
