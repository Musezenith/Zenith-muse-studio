import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";

function openDb(dbPath) {
  const db = new DatabaseSync(getDocumentsDbPath(dbPath));
  db.exec("PRAGMA busy_timeout = 2000;");
  return db;
}

function durationBetweenIso(fromIso, toIso) {
  if (typeof fromIso !== "string" || typeof toIso !== "string") return null;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.round(toMs - fromMs);
}

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0) return null;
  return Math.round(number);
}

function terminalAt(row) {
  return row?.completed_at || row?.failed_at || null;
}

export function recordGenerationTelemetry(requestId, values = {}, { dbPath } = {}) {
  const nowIso = new Date().toISOString();
  const db = openDb(dbPath);
  try {
    db.prepare(
      `INSERT INTO generation_telemetry (
        request_id, queue_mode, status, error_code, request_received_at, queued_at,
        worker_started_at, provider_started_at, provider_finished_at,
        post_processing_started_at, post_processing_finished_at,
        completed_at, failed_at, updated_at
      ) VALUES (
        @request_id, @queue_mode, @status, @error_code, @request_received_at, @queued_at,
        @worker_started_at, @provider_started_at, @provider_finished_at,
        @post_processing_started_at, @post_processing_finished_at,
        @completed_at, @failed_at, @updated_at
      )
      ON CONFLICT(request_id) DO UPDATE SET
        queue_mode = COALESCE(excluded.queue_mode, generation_telemetry.queue_mode),
        status = COALESCE(excluded.status, generation_telemetry.status),
        error_code = COALESCE(excluded.error_code, generation_telemetry.error_code),
        request_received_at = COALESCE(excluded.request_received_at, generation_telemetry.request_received_at),
        queued_at = COALESCE(excluded.queued_at, generation_telemetry.queued_at),
        worker_started_at = COALESCE(excluded.worker_started_at, generation_telemetry.worker_started_at),
        provider_started_at = COALESCE(excluded.provider_started_at, generation_telemetry.provider_started_at),
        provider_finished_at = COALESCE(excluded.provider_finished_at, generation_telemetry.provider_finished_at),
        post_processing_started_at = COALESCE(excluded.post_processing_started_at, generation_telemetry.post_processing_started_at),
        post_processing_finished_at = COALESCE(excluded.post_processing_finished_at, generation_telemetry.post_processing_finished_at),
        completed_at = COALESCE(excluded.completed_at, generation_telemetry.completed_at),
        failed_at = COALESCE(excluded.failed_at, generation_telemetry.failed_at),
        updated_at = excluded.updated_at`
    ).run({
      request_id: String(requestId || ""),
      queue_mode: values?.queue_mode ? String(values.queue_mode) : null,
      status: values?.status ? String(values.status) : null,
      error_code: values?.error_code ? String(values.error_code) : null,
      request_received_at: values?.request_received_at || null,
      queued_at: values?.queued_at || null,
      worker_started_at: values?.worker_started_at || null,
      provider_started_at: values?.provider_started_at || null,
      provider_finished_at: values?.provider_finished_at || null,
      post_processing_started_at: values?.post_processing_started_at || null,
      post_processing_finished_at: values?.post_processing_finished_at || null,
      completed_at: values?.completed_at || null,
      failed_at: values?.failed_at || null,
      updated_at: nowIso,
    });
  } finally {
    db.close();
  }
}

export function getGenerationTelemetryDiagnostics({ dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const counts = db
      .prepare(
        `SELECT
          COUNT(1) AS total,
          SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status NOT IN ('succeeded', 'failed') THEN 1 ELSE 0 END) AS in_flight
         FROM generation_telemetry`
      )
      .get();

    const avgDurations = db
      .prepare(
        `SELECT
          AVG((julianday(queued_at) - julianday(request_received_at)) * 86400000.0) AS request_to_queue_avg_ms,
          AVG((julianday(worker_started_at) - julianday(queued_at)) * 86400000.0) AS queue_to_worker_start_avg_ms,
          AVG((julianday(provider_started_at) - julianday(worker_started_at)) * 86400000.0) AS worker_to_provider_start_avg_ms,
          AVG((julianday(provider_finished_at) - julianday(provider_started_at)) * 86400000.0) AS provider_execution_avg_ms,
          AVG((julianday(post_processing_finished_at) - julianday(post_processing_started_at)) * 86400000.0) AS post_processing_avg_ms,
          AVG((julianday(COALESCE(completed_at, failed_at)) - julianday(request_received_at)) * 86400000.0) AS end_to_end_avg_ms
         FROM generation_telemetry
         WHERE request_received_at IS NOT NULL`
      )
      .get();

    const lastTerminalRow = db
      .prepare(
        `SELECT
          request_received_at, queued_at, worker_started_at, provider_started_at, provider_finished_at,
          post_processing_started_at, post_processing_finished_at, completed_at, failed_at, error_code,
          status
         FROM generation_telemetry
         WHERE completed_at IS NOT NULL OR failed_at IS NOT NULL
         ORDER BY COALESCE(completed_at, failed_at) DESC
         LIMIT 1`
      )
      .get();

    return {
      counts: {
        total: Number(counts?.total || 0),
        succeeded: Number(counts?.succeeded || 0),
        failed: Number(counts?.failed || 0),
        in_flight: Number(counts?.in_flight || 0),
      },
      durations: {
        request_to_queue_avg_ms: asNumberOrNull(avgDurations?.request_to_queue_avg_ms),
        queue_to_worker_start_avg_ms: asNumberOrNull(avgDurations?.queue_to_worker_start_avg_ms),
        worker_to_provider_start_avg_ms: asNumberOrNull(
          avgDurations?.worker_to_provider_start_avg_ms
        ),
        provider_execution_avg_ms: asNumberOrNull(avgDurations?.provider_execution_avg_ms),
        post_processing_avg_ms: asNumberOrNull(avgDurations?.post_processing_avg_ms),
        end_to_end_avg_ms: asNumberOrNull(avgDurations?.end_to_end_avg_ms),
        request_to_queue_last_ms: durationBetweenIso(
          lastTerminalRow?.request_received_at,
          lastTerminalRow?.queued_at
        ),
        queue_to_worker_start_last_ms: durationBetweenIso(
          lastTerminalRow?.queued_at,
          lastTerminalRow?.worker_started_at
        ),
        worker_to_provider_start_last_ms: durationBetweenIso(
          lastTerminalRow?.worker_started_at,
          lastTerminalRow?.provider_started_at
        ),
        provider_execution_last_ms: durationBetweenIso(
          lastTerminalRow?.provider_started_at,
          lastTerminalRow?.provider_finished_at
        ),
        post_processing_last_ms: durationBetweenIso(
          lastTerminalRow?.post_processing_started_at,
          lastTerminalRow?.post_processing_finished_at
        ),
        end_to_end_last_ms: durationBetweenIso(
          lastTerminalRow?.request_received_at,
          terminalAt(lastTerminalRow)
        ),
      },
      last_terminal: {
        status: lastTerminalRow?.status || null,
        error_code: lastTerminalRow?.error_code || null,
        at: terminalAt(lastTerminalRow),
      },
    };
  } finally {
    db.close();
  }
}
