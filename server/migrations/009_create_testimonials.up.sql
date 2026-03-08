CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL DEFAULT '',
  draft TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'visible',
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_testimonials_job_id ON testimonials(job_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials(status);
CREATE INDEX IF NOT EXISTS idx_testimonials_updated_at ON testimonials(updated_at);
