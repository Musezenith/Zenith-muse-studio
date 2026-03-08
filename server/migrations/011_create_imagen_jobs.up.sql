CREATE TABLE IF NOT EXISTS imagen_jobs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result_json TEXT,
  error_json TEXT,
  worker_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_imagen_jobs_status_created_at
  ON imagen_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_imagen_jobs_request_id
  ON imagen_jobs(request_id);
