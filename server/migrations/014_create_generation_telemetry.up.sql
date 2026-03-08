CREATE TABLE IF NOT EXISTS generation_telemetry (
  request_id TEXT PRIMARY KEY,
  queue_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_code TEXT,
  request_received_at TEXT,
  queued_at TEXT,
  worker_started_at TEXT,
  provider_started_at TEXT,
  provider_finished_at TEXT,
  post_processing_started_at TEXT,
  post_processing_finished_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_telemetry_status_updated_at
  ON generation_telemetry(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_generation_telemetry_completed_at
  ON generation_telemetry(completed_at);
