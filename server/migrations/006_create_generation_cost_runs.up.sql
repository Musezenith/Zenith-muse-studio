CREATE TABLE IF NOT EXISTS generation_cost_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  number_of_outputs INTEGER NOT NULL DEFAULT 1,
  rerun_count INTEGER NOT NULL DEFAULT 0,
  actual_cost REAL,
  estimated_cost REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_cost_runs_job_id ON generation_cost_runs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_cost_runs_created_at ON generation_cost_runs(created_at DESC);
