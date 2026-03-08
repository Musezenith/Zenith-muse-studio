CREATE TABLE IF NOT EXISTS proof_asset_packs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  hero_proof_summary TEXT NOT NULL DEFAULT '',
  landing_page_snippet TEXT NOT NULL DEFAULT '',
  sales_deck_snippet TEXT NOT NULL DEFAULT '',
  outreach_snippet TEXT NOT NULL DEFAULT '',
  social_snippet TEXT NOT NULL DEFAULT '',
  turnaround_proof TEXT NOT NULL DEFAULT '',
  testimonial_snippet TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'visible',
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proof_asset_packs_job_id ON proof_asset_packs(job_id);
CREATE INDEX IF NOT EXISTS idx_proof_asset_packs_status ON proof_asset_packs(status);
CREATE INDEX IF NOT EXISTS idx_proof_asset_packs_updated_at ON proof_asset_packs(updated_at);
