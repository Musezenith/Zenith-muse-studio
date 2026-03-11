#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

run_preflight_or_fail verify

API_BASE="$(resolve_api_base)"
step "Checking /api/imagen/providers"
IMAGEN_JSON="$(curl --fail --silent "${API_BASE}/api/imagen/providers")"
step "Checking /api/studio/providers/status"
STATUS_JSON="$(curl --fail --silent "${API_BASE}/api/studio/providers/status")"

python3 - "${IMAGEN_JSON}" "${STATUS_JSON}" <<'PY'
import json, sys
imagen = json.loads(sys.argv[1])
status = json.loads(sys.argv[2])
active = imagen.get("active_provider")
if active != "imagen":
    raise SystemExit(f"Expected active_provider=imagen, received {active!r}")
provider = (((status or {}).get("item") or {}).get("imagen") or {}).get("active_provider")
if provider != "imagen":
    raise SystemExit(f"Expected studio provider status imagen.active_provider=imagen, received {provider!r}")
print("PROVIDER_STATUS: PASS")
PY
