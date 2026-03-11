# GCP Deploy

## Required Environment
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `VERTEX_IMAGEN_MODEL`
- `GCS_BUCKET_ASSETS`
- `GCS_BUCKET_ARCHIVE`
- `GCS_BUCKET_RECEIPTS`
- `BQ_DATASET_STUDIO`
- `IMAGE_URI`

Optional:
- `SERVICE_NAME` default: `muse-studio-api`
- `SERVICE_ACCOUNT_NAME` default: `studio-os-runtime`
- `WORKFLOW_NAME` default: `studio_pipeline`
- `STUDIO_API_BASE_URL`
- `ALLOW_UNAUTHENTICATED` default: `true`

## External Prerequisites
- Google Cloud SDK installed and on `PATH`
- `gcloud --version` works
- `bq version` works
- Auth available via one of:
  - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
  - active `gcloud auth` session plus project access

Install reference:
- https://cloud.google.com/sdk/docs/install

## Runtime Service Account
Bootstrap creates:
- `studio-os-runtime@PROJECT_ID.iam.gserviceaccount.com`

Roles granted:
- `roles/aiplatform.user`
- `roles/storage.objectAdmin`
- `roles/bigquery.dataEditor`
- `roles/bigquery.jobUser`
- `roles/workflows.invoker`
- `roles/secretmanager.secretAccessor`

## Deploy Order
1. `deploy/scripts/preflight_gcp.sh`
2. `deploy/scripts/bootstrap_gcp.sh`
3. `deploy/scripts/setup_storage.sh`
4. `deploy/scripts/setup_bigquery.sh`
5. `deploy/scripts/deploy_cloudrun.sh`
6. `deploy/scripts/deploy_workflow.sh`
7. `deploy/scripts/verify_bigquery.sh`
8. `deploy/scripts/check_providers.sh`
9. `deploy/scripts/run_workflow_test.sh`
10. `deploy/scripts/studio_smoke_test.sh`

## Preflight
```bash
./deploy/scripts/preflight_gcp.sh
```

Preflight checks:
- tool presence
- auth
- env contract
- project access
- bucket and dataset naming sanity

## Example
```bash
export GCP_PROJECT_ID="your-project"
export GCP_REGION="us-central1"
export VERTEX_IMAGEN_MODEL="imagen-3.0-generate-002"
export GCS_BUCKET_ASSETS="your-project-studio-assets"
export GCS_BUCKET_ARCHIVE="your-project-studio-archive"
export GCS_BUCKET_RECEIPTS="your-project-studio-receipts"
export BQ_DATASET_STUDIO="studio_os"
export IMAGE_URI="us-central1-docker.pkg.dev/your-project/muse-studio/muse-studio-api:latest"

./deploy/scripts/preflight_gcp.sh
./deploy/scripts/bootstrap_gcp.sh
./deploy/scripts/setup_storage.sh
./deploy/scripts/setup_bigquery.sh
./deploy/scripts/deploy_cloudrun.sh
./deploy/scripts/deploy_workflow.sh
```

## Provider Verification
```bash
./deploy/scripts/check_providers.sh
```

Expected:
- `/api/imagen/providers` returns `active_provider=imagen`
- `/api/studio/providers/status` returns `item.imagen.active_provider=imagen`

## Smoke Test
```bash
./deploy/scripts/run_workflow_test.sh
./deploy/scripts/studio_smoke_test.sh
```

Smoke test verifies:
- compile succeeds
- `run-three-modes` uses Imagen
- prompt receipts are written to `gs://$GCS_BUCKET_RECEIPTS`
- asset manifests are written to `gs://$GCS_BUCKET_ASSETS`
- archive lineage manifests are written to `gs://$GCS_BUCKET_ARCHIVE`
- BigQuery rows exist in `prompt_receipts` and `generation_jobs`
