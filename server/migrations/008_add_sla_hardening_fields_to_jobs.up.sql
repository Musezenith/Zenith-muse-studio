ALTER TABLE jobs ADD COLUMN brief_received_at TEXT;
ALTER TABLE jobs ADD COLUMN first_output_due_at TEXT;
ALTER TABLE jobs ADD COLUMN final_due_at TEXT;
ALTER TABLE jobs ADD COLUMN sla_first_output_status TEXT;
ALTER TABLE jobs ADD COLUMN sla_final_status TEXT;
ALTER TABLE jobs ADD COLUMN sla_policy_snapshot_json TEXT;
ALTER TABLE jobs ADD COLUMN breach_reason_code TEXT;
ALTER TABLE jobs ADD COLUMN breach_note TEXT;
