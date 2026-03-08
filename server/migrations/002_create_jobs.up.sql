CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  use_case TEXT NOT NULL,
  mood_style TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL,
  deadline TEXT NOT NULL,
  references_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
