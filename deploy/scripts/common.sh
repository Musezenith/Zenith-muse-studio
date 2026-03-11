#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

step() {
  echo "[studio-deploy] $*"
}

fail() {
  local category="$1"
  shift
  echo "[${category}] $*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  local install_hint="${2:-}"
  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -n "$install_hint" ]]; then
    fail "infra" "Missing command: ${cmd}. ${install_hint}"
  fi
  fail "infra" "Missing command: ${cmd}"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "config" "Missing required env: ${name}"
  fi
}

require_all_envs() {
  local missing=()
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("${name}")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    fail "config" "Missing required env vars: ${missing[*]}"
  fi
}

sdk_install_requirement() {
  cat <<'EOF'
Install Google Cloud SDK with gcloud and bq CLI available on PATH.
Reference package: https://cloud.google.com/sdk/docs/install
Required commands after install:
  gcloud --version
  bq version
EOF
}

check_gcloud_auth() {
  if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    [[ -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]] || fail "auth" "GOOGLE_APPLICATION_CREDENTIALS is set but file does not exist: ${GOOGLE_APPLICATION_CREDENTIALS}"
    return 0
  fi

  local account
  account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
  [[ -n "$account" ]] || fail "auth" "No Google Cloud auth found. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth login / gcloud auth application-default login."
}

check_project_access() {
  require_env GCP_PROJECT_ID
  gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)' >/dev/null 2>&1 || fail "access" "Unable to access GCP project: ${GCP_PROJECT_ID}"
}

validate_bucket_name() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] || fail "config" "Invalid bucket name in ${name}: ${value}"
}

validate_dataset_name() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]{0,1023}$ ]] || fail "config" "Invalid BigQuery dataset name in ${name}: ${value}"
}

resolve_api_base() {
  if [[ -n "${STUDIO_API_BASE_URL:-}" ]]; then
    printf '%s\n' "${STUDIO_API_BASE_URL}"
    return
  fi
  require_all_envs GCP_PROJECT_ID GCP_REGION
  gcloud run services describe "${SERVICE_NAME:-muse-studio-api}" \
    --region="${GCP_REGION}" \
    --project="${GCP_PROJECT_ID}" \
    --format='value(status.url)' || fail "access" "Unable to resolve Cloud Run URL for service ${SERVICE_NAME:-muse-studio-api}"
}

run_preflight_or_fail() {
  local scope="${1:-deploy}"
  "${ROOT_DIR}/deploy/scripts/preflight_gcp.sh" --scope "$scope"
}
