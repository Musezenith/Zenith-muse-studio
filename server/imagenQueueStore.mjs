import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { migrateImagenQueue } from "./imagenQueueMigrations.mjs";

const QUEUE_MODES = new Set(["inline", "worker"]);
const STALE_RECOVERED_CODE = "STALE_PROCESSING_RECOVERED";
const STALE_EXHAUSTED_CODE = "STALE_PROCESSING_EXHAUSTED";

function ensurePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return number;
}

function getRetryConfig() {
  const maxAttempts = ensurePositiveInteger(process.env.IMAGE_QUEUE_MAX_ATTEMPTS, 1);
  const baseMs = Math.max(100, ensurePositiveInteger(process.env.IMAGE_QUEUE_RETRY_BASE_MS, 500));
  const maxMs = Math.max(baseMs, ensurePositiveInteger(process.env.IMAGE_QUEUE_RETRY_MAX_MS, 10000));
  return {
    maxAttempts,
    baseMs,
    maxMs,
  };
}

function getSweeperConfig() {
  const enabled = process.env.IMAGE_QUEUE_SWEEPER_ENABLED !== "0";
  const sweepIntervalMs = Math.max(
    200,
    ensurePositiveInteger(process.env.IMAGE_QUEUE_SWEEP_INTERVAL_MS, 1000)
  );
  const staleMs = Math.max(
    1000,
    ensurePositiveInteger(process.env.IMAGE_QUEUE_STALE_MS, 120000)
  );
  const workerHeartbeatTtlMs = Math.max(
    1000,
    ensurePositiveInteger(
      process.env.IMAGE_QUEUE_WORKER_HEARTBEAT_TTL_MS,
      Math.max(staleMs, sweepIntervalMs * 3)
    )
  );
  return {
    enabled,
    sweepIntervalMs,
    staleMs,
    workerHeartbeatTtlMs,
  };
}

function computeRetryDelayMs(attemptCount, retryConfig) {
  const exponent = Math.max(0, Number(attemptCount || 1) - 1);
  return Math.min(retryConfig.maxMs, retryConfig.baseMs * 2 ** exponent);
}

function openDb(dbPath) {
  const db = new DatabaseSync(getDocumentsDbPath(dbPath));
  db.exec("PRAGMA busy_timeout = 2000;");
  return db;
}

function parseJsonObject(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function toDurationOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function durationBetweenIso(fromIso, toIso) {
  if (typeof fromIso !== "string" || typeof toIso !== "string") return null;
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (toMs < fromMs) return null;
  return toDurationOrNull(toMs - fromMs);
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: row.request_id,
    payload: parseJsonObject(row.payload_json),
    status: row.status,
    result: parseJsonObject(row.result_json),
    error: parseJsonObject(row.error_json),
    worker_id: row.worker_id || null,
    attempt_count: Number(row.attempt_count || 0),
    max_attempts: Number(row.max_attempts || 1),
    next_run_at: row.next_run_at || null,
    last_error_code: row.last_error_code || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

export async function initializeImagenQueueStore({ dbPath } = {}) {
  await migrateImagenQueue({ dbPath });
}

export function getImageQueueMode() {
  const raw = String(process.env.IMAGE_QUEUE || "inline")
    .trim()
    .toLowerCase();
  return QUEUE_MODES.has(raw) ? raw : "inline";
}

export function enqueueImagenJob({ requestId, payload }, { dbPath } = {}) {
  const retryConfig = getRetryConfig();
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    request_id: String(requestId || randomUUID()),
    payload_json: JSON.stringify(payload || {}),
    status: "queued",
    result_json: null,
    error_json: null,
    worker_id: null,
    attempt_count: 0,
    max_attempts: retryConfig.maxAttempts,
    next_run_at: now,
    last_error_code: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    completed_at: null,
  };
  const db = openDb(dbPath);
  try {
    db.prepare(
      `INSERT INTO imagen_jobs (
        id, request_id, payload_json, status, result_json, error_json, worker_id,
        attempt_count, max_attempts, next_run_at, last_error_code,
        created_at, updated_at, started_at, completed_at
      ) VALUES (
        @id, @request_id, @payload_json, @status, @result_json, @error_json, @worker_id,
        @attempt_count, @max_attempts, @next_run_at, @last_error_code,
        @created_at, @updated_at, @started_at, @completed_at
      )`
    ).run(job);
    return normalizeJob(job);
  } finally {
    db.close();
  }
}

export function getImagenJobByRequestId(requestId, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT
          id, request_id, payload_json, status, result_json, error_json, worker_id,
          attempt_count, max_attempts, next_run_at, last_error_code,
          created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE request_id = ?
         LIMIT 1`
      )
      .get(String(requestId || ""));
    return normalizeJob(row);
  } finally {
    db.close();
  }
}

export function claimNextQueuedImagenJob(
  { workerId = "imagen-worker" } = {},
  { dbPath } = {}
) {
  const db = openDb(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE;");
    const row = db
      .prepare(
        `SELECT
          id, request_id, payload_json, status, result_json, error_json, worker_id,
          attempt_count, max_attempts, next_run_at, last_error_code,
          created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE status = 'queued'
           AND (next_run_at IS NULL OR next_run_at <= ?)
         ORDER BY COALESCE(next_run_at, created_at) ASC, created_at ASC
         LIMIT 1`
      )
      .get(new Date().toISOString());
    if (!row) {
      db.exec("COMMIT;");
      return null;
    }
    const now = new Date().toISOString();
    const update = db
      .prepare(
        `UPDATE imagen_jobs
         SET status = 'processing', worker_id = ?, started_at = ?, updated_at = ?, attempt_count = attempt_count + 1
         WHERE id = ? AND status = 'queued'`
      )
      .run(String(workerId || "imagen-worker"), now, now, row.id);
    if (Number(update.changes || 0) < 1) {
      db.exec("COMMIT;");
      return null;
    }
    const claimed = db
      .prepare(
        `SELECT
          id, request_id, payload_json, status, result_json, error_json, worker_id,
          attempt_count, max_attempts, next_run_at, last_error_code,
          created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE id = ?
         LIMIT 1`
      )
      .get(row.id);
    db.exec("COMMIT;");
    return normalizeJob(claimed);
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch (_) {
      // no-op
    }
    throw error;
  } finally {
    db.close();
  }
}

export function markImagenJobSucceeded(jobId, result, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE imagen_jobs
       SET status = 'succeeded', result_json = ?, error_json = NULL, completed_at = ?, updated_at = ?,
           last_error_code = NULL, next_run_at = NULL
       WHERE id = ?`
    ).run(JSON.stringify(result || {}), now, now, String(jobId || ""));
    return getImagenJobById(jobId, { dbPath });
  } finally {
    db.close();
  }
}

export function markImagenJobFailed(jobId, errorBody, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE imagen_jobs
       SET status = 'failed', error_json = ?, completed_at = ?, updated_at = ?, last_error_code = ?, next_run_at = NULL
       WHERE id = ?`
    ).run(
      JSON.stringify(errorBody || {}),
      now,
      now,
      String(errorBody?.code || ""),
      String(jobId || "")
    );
    return getImagenJobById(jobId, { dbPath });
  } finally {
    db.close();
  }
}

export function rescheduleImagenJobRetry(jobId, errorBody, { delayMs }, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const retryConfig = getRetryConfig();
    const boundedDelay = Math.max(
      0,
      Math.min(Number(delayMs || retryConfig.baseMs), retryConfig.maxMs)
    );
    const nowMs = Date.now();
    const updatedAt = new Date(nowMs).toISOString();
    const nextRunAt = new Date(nowMs + boundedDelay).toISOString();
    db.prepare(
      `UPDATE imagen_jobs
       SET status = 'queued', error_json = ?, updated_at = ?, worker_id = NULL,
           completed_at = NULL, last_error_code = ?, next_run_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(errorBody || {}),
      updatedAt,
      String(errorBody?.code || ""),
      nextRunAt,
      String(jobId || "")
    );
    return getImagenJobById(jobId, { dbPath });
  } finally {
    db.close();
  }
}

export function getImagenQueueRetryConfig() {
  return getRetryConfig();
}

export function getImagenQueueSweeperConfig() {
  return getSweeperConfig();
}

export function setImagenRuntimeState(values = {}, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const entries = Object.entries(values || {}).filter(([key]) => String(key || "").trim());
    if (entries.length < 1) return 0;
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO imagen_runtime_state (key, value_text, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_text = excluded.value_text,
         updated_at = excluded.updated_at`
    );
    for (const [key, value] of entries) {
      stmt.run(String(key), value === null || value === undefined ? "" : String(value), now);
    }
    return entries.length;
  } finally {
    db.close();
  }
}

export function getImagenRuntimeState({ dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare("SELECT key, value_text, updated_at FROM imagen_runtime_state")
      .all();
    const state = {};
    for (const row of rows) {
      state[row.key] = {
        value: row.value_text ?? "",
        updated_at: row.updated_at || null,
      };
    }
    return state;
  } finally {
    db.close();
  }
}

export function getImagenQueueDiagnostics({ dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const sweeperConfig = getSweeperConfig();
    const retryConfig = getRetryConfig();
    const nowIso = new Date().toISOString();
    const staleBeforeIso = new Date(Date.now() - sweeperConfig.staleMs).toISOString();

    const counts = db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM imagen_jobs`
      )
      .get();
    const retryEligible = db
      .prepare(
        `SELECT COUNT(1) AS value
         FROM imagen_jobs
         WHERE status = 'queued'
           AND (next_run_at IS NULL OR next_run_at <= ?)
           AND attempt_count < COALESCE(max_attempts, 1)`
      )
      .get(nowIso);
    const staleProcessing = db
      .prepare(
        `SELECT COUNT(1) AS value
         FROM imagen_jobs
         WHERE status = 'processing'
           AND COALESCE(started_at, updated_at, created_at) <= ?`
      )
      .get(staleBeforeIso);
    const runtimeRows = db
      .prepare("SELECT key, value_text, updated_at FROM imagen_runtime_state")
      .all();
    const runtimeState = {};
    for (const row of runtimeRows) {
      runtimeState[row.key] = {
        value: row.value_text ?? "",
        updated_at: row.updated_at || null,
      };
    }
    const latencyAgg = db
      .prepare(
        `SELECT
          COUNT(1) AS sample_count,
          AVG((julianday(started_at) - julianday(created_at)) * 86400000.0) AS queue_wait_avg_ms,
          AVG((julianday(completed_at) - julianday(started_at)) * 86400000.0) AS processing_avg_ms,
          AVG((julianday(completed_at) - julianday(created_at)) * 86400000.0) AS end_to_end_avg_ms
         FROM imagen_jobs
         WHERE completed_at IS NOT NULL
           AND started_at IS NOT NULL
           AND created_at IS NOT NULL`
      )
      .get();
    const latencyLast = db
      .prepare(
        `SELECT created_at, started_at, completed_at
         FROM imagen_jobs
         WHERE completed_at IS NOT NULL
           AND started_at IS NOT NULL
           AND created_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1`
      )
      .get();
    return {
      queue_mode: getImageQueueMode(),
      counts: {
        queued: Number(counts?.queued || 0),
        processing: Number(counts?.processing || 0),
        failed: Number(counts?.failed || 0),
        retry_eligible_queued: Number(retryEligible?.value || 0),
        stale_processing: Number(staleProcessing?.value || 0),
      },
      config: {
        retry: {
          max_attempts: retryConfig.maxAttempts,
          base_ms: retryConfig.baseMs,
          max_ms: retryConfig.maxMs,
        },
        sweeper: {
          enabled: sweeperConfig.enabled,
          interval_ms: sweeperConfig.sweepIntervalMs,
          stale_ms: sweeperConfig.staleMs,
          worker_heartbeat_ttl_ms: sweeperConfig.workerHeartbeatTtlMs,
        },
      },
      latency: {
        sample_count: Number(latencyAgg?.sample_count || 0),
        queue_wait_avg_ms: toDurationOrNull(latencyAgg?.queue_wait_avg_ms),
        processing_avg_ms: toDurationOrNull(latencyAgg?.processing_avg_ms),
        end_to_end_avg_ms: toDurationOrNull(latencyAgg?.end_to_end_avg_ms),
        last_queue_wait_ms: durationBetweenIso(latencyLast?.created_at, latencyLast?.started_at),
        last_processing_ms: durationBetweenIso(latencyLast?.started_at, latencyLast?.completed_at),
        last_end_to_end_ms: durationBetweenIso(latencyLast?.created_at, latencyLast?.completed_at),
      },
      runtime_state: runtimeState,
    };
  } finally {
    db.close();
  }
}

export function recoverStaleProcessingImagenJobs(
  { staleMs = 120000, limit = 50 } = {},
  { dbPath } = {}
) {
  const db = openDb(dbPath);
  try {
    const retryConfig = getRetryConfig();
    const staleThresholdMs = Math.max(1000, Number(staleMs || 120000));
    const maxRows = Math.max(1, Math.min(500, Number(limit || 50)));
    const staleBeforeIso = new Date(Date.now() - staleThresholdMs).toISOString();
    const nowIso = new Date().toISOString();

    db.exec("BEGIN IMMEDIATE;");
    const rows = db
      .prepare(
        `SELECT
          id, request_id, payload_json, status, result_json, error_json, worker_id,
          attempt_count, max_attempts, next_run_at, last_error_code,
          created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE status = 'processing'
           AND COALESCE(started_at, updated_at, created_at) <= ?
         ORDER BY COALESCE(started_at, updated_at, created_at) ASC
         LIMIT ?`
      )
      .all(staleBeforeIso, maxRows);

    let recovered = 0;
    let failed = 0;
    for (const row of rows) {
      const attemptCount = Math.max(0, Number(row.attempt_count || 0));
      const maxAttempts = Math.max(1, Number(row.max_attempts || retryConfig.maxAttempts));
      if (attemptCount < maxAttempts) {
        const delayMs = computeRetryDelayMs(attemptCount, retryConfig);
        const nextRunAt = new Date(Date.now() + delayMs).toISOString();
        const errorBody = {
          status: 500,
          code: STALE_RECOVERED_CODE,
          message: "Recovered stale processing lock and rescheduled job",
          details: {
            stale_ms: staleThresholdMs,
            attempt_count: attemptCount,
            max_attempts: maxAttempts,
            previous_worker_id: row.worker_id || null,
          },
        };
        const update = db
          .prepare(
            `UPDATE imagen_jobs
             SET status = 'queued', error_json = ?, updated_at = ?, worker_id = NULL,
                 completed_at = NULL, started_at = NULL, last_error_code = ?, next_run_at = ?
             WHERE id = ? AND status = 'processing'`
          )
          .run(
            JSON.stringify(errorBody),
            nowIso,
            STALE_RECOVERED_CODE,
            nextRunAt,
            String(row.id || "")
          );
        if (Number(update.changes || 0) > 0) recovered += 1;
      } else {
        const errorBody = {
          status: 500,
          code: STALE_EXHAUSTED_CODE,
          message: "Job failed after stale processing lock exhausted retry budget",
          details: {
            stale_ms: staleThresholdMs,
            attempt_count: attemptCount,
            max_attempts: maxAttempts,
            previous_worker_id: row.worker_id || null,
          },
        };
        const update = db
          .prepare(
            `UPDATE imagen_jobs
             SET status = 'failed', error_json = ?, completed_at = ?, updated_at = ?,
                 worker_id = NULL, started_at = NULL, last_error_code = ?, next_run_at = NULL
             WHERE id = ? AND status = 'processing'`
          )
          .run(
            JSON.stringify(errorBody),
            nowIso,
            nowIso,
            STALE_EXHAUSTED_CODE,
            String(row.id || "")
          );
        if (Number(update.changes || 0) > 0) failed += 1;
      }
    }
    db.exec("COMMIT;");
    return {
      scanned: rows.length,
      recovered,
      failed,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch (_) {
      // no-op
    }
    throw error;
  } finally {
    db.close();
  }
}

export function getImagenJobById(jobId, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT
          id, request_id, payload_json, status, result_json, error_json, worker_id,
          attempt_count, max_attempts, next_run_at, last_error_code,
          created_at, updated_at, started_at, completed_at
         FROM imagen_jobs
         WHERE id = ?
         LIMIT 1`
      )
      .get(String(jobId || ""));
    return normalizeJob(row);
  } finally {
    db.close();
  }
}
