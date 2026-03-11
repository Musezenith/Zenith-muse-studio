# Studio OS Cloud Storage Buckets

## Required buckets
- `studio-assets`
  - Generated image assets and provider-delivered files.
- `studio-archive`
  - Canon-approved assets, archive lineage exports, proof payloads.
- `studio-receipts`
  - Prompt receipt JSON, generation receipt JSON, canon/archive lineage JSON.

## Suggested creation
```bash
gcloud storage buckets create gs://studio-assets --location=REGION
gcloud storage buckets create gs://studio-archive --location=REGION
gcloud storage buckets create gs://studio-receipts --location=REGION
```

## Runtime mapping
- `GCS_BUCKET_ASSETS=studio-assets`
- `GCS_BUCKET_ARCHIVE=studio-archive`
- `GCS_BUCKET_RECEIPTS=studio-receipts`

## Notes
- Receipt objects are written under `prompt-receipts/YYYY-MM-DD/<prompt_receipt_id>.json`.
- Assets and archive payloads should use service-account writes from Cloud Run.
- Public access is not required; prefer signed or backend-served delivery.
