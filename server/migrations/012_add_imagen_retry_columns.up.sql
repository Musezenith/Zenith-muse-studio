ALTER TABLE imagen_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE imagen_jobs ADD COLUMN next_run_at TEXT;
ALTER TABLE imagen_jobs ADD COLUMN last_error_code TEXT;

UPDATE imagen_jobs
SET max_attempts = COALESCE(max_attempts, 1),
    next_run_at = COALESCE(next_run_at, created_at);
