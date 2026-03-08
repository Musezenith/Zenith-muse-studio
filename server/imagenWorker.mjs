import {
  claimNextQueuedImagenJob,
  getImagenQueueSweeperConfig,
  getImagenQueueRetryConfig,
  getImageQueueMode,
  initializeImagenQueueStore,
  markImagenJobFailed,
  markImagenJobSucceeded,
  recoverStaleProcessingImagenJobs,
  rescheduleImagenJobRetry,
  setImagenRuntimeState,
} from "./imagenQueueStore.mjs";
import { generateViaVertexImagen, getTimeoutMs } from "./imagenService.mjs";
import { initializeDocumentsStore } from "./documentsStore.mjs";
import { initializeJobsStore } from "./jobsStore.mjs";
import { initializeQuotesStore } from "./quotesStore.mjs";
import { initializeAuditStore } from "./auditStore.mjs";
import { initializeGenerationCostStore } from "./generationCostStore.mjs";
import { applyGenerationResultSideEffects } from "./imagenRuntimeHooks.mjs";
import { recordGenerationTelemetry } from "./generationTelemetryStore.mjs";

const workerId = process.env.IMAGEN_WORKER_ID || `imagen-worker-${process.pid}`;
const pollIntervalMs = Math.max(100, Number(process.env.IMAGEN_WORKER_POLL_MS || 500));
const queueMode = getImageQueueMode();
const retryConfig = getImagenQueueRetryConfig();
const sweeperConfig = getImagenQueueSweeperConfig();
const sweeperEnabled = sweeperConfig.enabled;
const sweepIntervalMs = sweeperConfig.sweepIntervalMs;
const staleMs = sweeperConfig.staleMs;
let nextSweepAtMs = 0;
let nextHeartbeatAtMs = 0;

function recordGenerationTelemetrySafe(requestId, values) {
  try {
    recordGenerationTelemetry(requestId, values);
  } catch (_) {
    // non-blocking telemetry write
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSerializableError(error) {
  return {
    status:
      Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
        ? error.status
        : 500,
    message: error?.message || "Generation failed",
    details: error?.body || null,
    code:
      Number.isInteger(error?.status) && error.status === 504
        ? "TIMEOUT"
        : Number.isInteger(error?.status) && error.status === 400
        ? "BAD_REQUEST"
        : "UPSTREAM_ERROR",
  };
}

function isRetryableError(err) {
  if (String(err?.code || "") === "TIMEOUT") return true;
  const status = Number(err?.status || 0);
  return status >= 500 && status <= 599;
}

function computeRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Number(attemptCount || 1) - 1);
  return Math.min(retryConfig.maxMs, retryConfig.baseMs * 2 ** exponent);
}

async function processOneJob() {
  writeWorkerRuntimeState({
    worker_last_activity_at: new Date().toISOString(),
    worker_last_activity_kind: "claim",
  });
  const job = claimNextQueuedImagenJob({ workerId });
  if (!job) return false;
  recordGenerationTelemetrySafe(job.request_id, {
    queue_mode: queueMode,
    status: "processing",
    worker_started_at: job?.started_at || new Date().toISOString(),
  });

  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    recordGenerationTelemetrySafe(job.request_id, {
      provider_started_at: new Date().toISOString(),
      status: "processing",
    });
    const result = await generateViaVertexImagen({
      payload: job.payload,
      requestId: job.request_id,
      signal: controller.signal,
    });
    recordGenerationTelemetrySafe(job.request_id, {
      provider_finished_at: new Date().toISOString(),
      post_processing_started_at: new Date().toISOString(),
      status: "post_processing",
    });
    applyGenerationResultSideEffects({
      payload: job.payload,
      result,
    });
    markImagenJobSucceeded(job.id, result);
    const completedAt = new Date().toISOString();
    recordGenerationTelemetrySafe(job.request_id, {
      post_processing_finished_at: completedAt,
      completed_at: completedAt,
      status: "succeeded",
      error_code: null,
    });
    writeWorkerRuntimeState({
      worker_last_activity_at: new Date().toISOString(),
      worker_last_activity_kind: "success",
      worker_last_request_id: job.request_id,
    });
    console.log(`[imagen-worker] completed ${job.request_id}`);
  } catch (error) {
    if (error?.name === "AbortError") {
      error.status = 504;
      error.message = `Imagen request timed out after ${timeoutMs}ms`;
    }
    const err = toSerializableError(error);
    const maxAttempts = Math.max(1, Number(job?.max_attempts || retryConfig.maxAttempts));
    const attemptCount = Math.max(1, Number(job?.attempt_count || 1));
    if (isRetryableError(err) && attemptCount < maxAttempts) {
      const delayMs = computeRetryDelayMs(attemptCount);
      rescheduleImagenJobRetry(job.id, err, { delayMs });
      recordGenerationTelemetrySafe(job.request_id, {
        provider_finished_at: new Date().toISOString(),
        status: "queued",
        error_code: err.code || "UPSTREAM_ERROR",
      });
      writeWorkerRuntimeState({
        worker_last_activity_at: new Date().toISOString(),
        worker_last_activity_kind: "retry-scheduled",
        worker_last_request_id: job.request_id,
      });
      console.warn(
        `[imagen-worker] retrying ${job.request_id} attempt=${attemptCount}/${maxAttempts} delay_ms=${delayMs}`
      );
    } else {
      markImagenJobFailed(job.id, err);
      recordGenerationTelemetrySafe(job.request_id, {
        provider_finished_at: new Date().toISOString(),
        failed_at: new Date().toISOString(),
        status: "failed",
        error_code: err.code || "UPSTREAM_ERROR",
      });
      writeWorkerRuntimeState({
        worker_last_activity_at: new Date().toISOString(),
        worker_last_activity_kind: "failed",
        worker_last_request_id: job.request_id,
      });
      console.error(`[imagen-worker] failed ${job.request_id}: ${err.message}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
  return true;
}

function writeWorkerRuntimeState(values) {
  try {
    setImagenRuntimeState(
      {
        worker_id: workerId,
        worker_queue_mode: queueMode,
        worker_last_seen_at: new Date().toISOString(),
        ...values,
      }
    );
  } catch (_) {
    // non-blocking runtime telemetry
  }
}

function maybeWriteHeartbeat() {
  const nowMs = Date.now();
  if (nowMs < nextHeartbeatAtMs) return;
  nextHeartbeatAtMs = nowMs + Math.min(5000, Math.max(250, pollIntervalMs));
  writeWorkerRuntimeState({});
}

function maybeRunStaleSweeper() {
  if (!sweeperEnabled || queueMode !== "worker") return;
  const nowMs = Date.now();
  if (nowMs < nextSweepAtMs) return;
  nextSweepAtMs = nowMs + sweepIntervalMs;
  try {
    const summary = recoverStaleProcessingImagenJobs({ staleMs });
    if (summary?.recovered || summary?.failed) {
      writeWorkerRuntimeState({
        worker_last_sweep_at: new Date().toISOString(),
        worker_last_sweep_recovered: String(summary.recovered || 0),
        worker_last_sweep_failed: String(summary.failed || 0),
      });
      console.warn(
        `[imagen-worker] stale-recovery recovered=${summary.recovered} failed=${summary.failed} scanned=${summary.scanned}`
      );
    } else {
      writeWorkerRuntimeState({
        worker_last_sweep_at: new Date().toISOString(),
        worker_last_sweep_recovered: "0",
        worker_last_sweep_failed: "0",
      });
    }
  } catch (error) {
    console.error("[imagen-worker] stale sweeper failed", error);
  }
}

async function startWorker() {
  await initializeDocumentsStore();
  await initializeJobsStore();
  await initializeQuotesStore();
  await initializeAuditStore();
  await initializeGenerationCostStore();
  await initializeImagenQueueStore();
  writeWorkerRuntimeState({
    worker_started_at: new Date().toISOString(),
    worker_sweeper_enabled: String(sweeperEnabled),
    worker_sweep_interval_ms: String(sweepIntervalMs),
    worker_stale_ms: String(staleMs),
    worker_retry_max_attempts: String(retryConfig.maxAttempts),
    worker_retry_base_ms: String(retryConfig.baseMs),
    worker_retry_max_ms: String(retryConfig.maxMs),
  });
  console.log(
    `[imagen-worker] started mode=${queueMode} id=${workerId} poll_ms=${pollIntervalMs}`
  );
  if (queueMode !== "worker") {
    console.log("[imagen-worker] IMAGE_QUEUE is not 'worker'; waiting idle.");
  }
  while (true) {
    if (queueMode !== "worker") {
      await sleep(Math.max(1000, pollIntervalMs));
      continue;
    }
    maybeWriteHeartbeat();
    maybeRunStaleSweeper();
    const worked = await processOneJob();
    if (!worked) {
      await sleep(pollIntervalMs);
    }
  }
}

startWorker().catch((error) => {
  console.error("[imagen-worker] fatal error", error);
  process.exit(1);
});
