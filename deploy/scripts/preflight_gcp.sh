#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

SCOPE="deploy"
if [[ "${1:-}" == "--scope" ]]; then
  SCOPE="${2:-deploy}"
fi

RESULTS=()

record_pass() {
  RESULTS+=("PASS | $1")
}

check_wrapper() {
  local label="$1"
  shift
  "$@"
  record_pass "$label"
}

check_tooling() {
  require_cmd gcloud "$(sdk_install_requirement)"
  require_cmd bq "$(sdk_install_requirement)"
  require_cmd curl
  require_cmd python3
}

check_env_contract() {
  require_all_envs \
    GCP_PROJECT_ID \
    GCP_REGION \
    VERTEX_IMAGEN_MODEL \
    GCS_BUCKET_ASSETS \
    GCS_BUCKET_ARCHIVE \
    GCS_BUCKET_RECEIPTS \
    BQ_DATASET_STUDIO \
    IMAGE_URI
}

check_naming_sanity() {
  validate_bucket_name GCS_BUCKET_ASSETS
  validate_bucket_name GCS_BUCKET_ARCHIVE
  validate_bucket_name GCS_BUCKET_RECEIPTS
  validate_dataset_name BQ_DATASET_STUDIO
}

main() {
  step "Preflight scope: ${SCOPE}"
  check_wrapper "tool presence" check_tooling
  check_wrapper "env contract" check_env_contract
  check_wrapper "auth" check_gcloud_auth
  check_wrapper "project access" check_project_access
  check_wrapper "naming sanity" check_naming_sanity

  echo "[studio-deploy] Preflight summary"
  printf '%s\n' "${RESULTS[@]}"
  echo "PREFLIGHT: PASS"
}

main "$@"
