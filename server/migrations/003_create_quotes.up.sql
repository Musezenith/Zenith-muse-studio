CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  package_type TEXT NOT NULL,
  number_of_final_images INTEGER NOT NULL,
  number_of_directions INTEGER NOT NULL,
  revision_rounds INTEGER NOT NULL,
  deadline_urgency TEXT NOT NULL,
  usage_scope TEXT NOT NULL,
  price INTEGER NOT NULL,
  scope_summary TEXT NOT NULL,
  revision_limit INTEGER NOT NULL,
  delivery_timeline TEXT NOT NULL,
  assumptions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_pilot INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_job_id ON quotes(job_id);
CREATE INDEX IF NOT EXISTS idx_quotes_version ON quotes(job_id, version);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
