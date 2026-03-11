CREATE TABLE IF NOT EXISTS `PROJECT_ID.BQ_DATASET_STUDIO.prompt_receipts` (
  prompt_receipt_id STRING NOT NULL,
  job_id STRING,
  run_id STRING,
  mode STRING,
  compiler_version STRING,
  kb_version STRING,
  source_trace STRING,
  created_at TIMESTAMP,
  output_goal STRING
);

CREATE TABLE IF NOT EXISTS `PROJECT_ID.BQ_DATASET_STUDIO.generation_jobs` (
  generation_job_id STRING NOT NULL,
  prompt_receipt_id STRING,
  job_id STRING,
  run_id STRING,
  mode STRING,
  provider_used STRING,
  adapter_used STRING,
  endpoint_used STRING,
  asset_url STRING,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `PROJECT_ID.BQ_DATASET_STUDIO.review_scores` (
  review_score_id STRING NOT NULL,
  prompt_receipt_id STRING,
  run_id STRING,
  mode STRING,
  review_score FLOAT64,
  classification STRING,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `PROJECT_ID.BQ_DATASET_STUDIO.canon_classifications` (
  canon_classification_id STRING NOT NULL,
  prompt_receipt_id STRING,
  run_id STRING,
  mode STRING,
  classification STRING,
  asset_url STRING,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `PROJECT_ID.BQ_DATASET_STUDIO.provider_usage` (
  provider_usage_id STRING NOT NULL,
  provider_used STRING,
  adapter_used STRING,
  endpoint_used STRING,
  region STRING,
  model STRING,
  created_at TIMESTAMP
);
