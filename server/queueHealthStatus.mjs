function toInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function toBool(value) {
  return value === true;
}

export function deriveQueueHealthStatus(snapshot = {}) {
  const queueMode = String(snapshot.queue_mode || "inline");
  const worker = snapshot.worker && typeof snapshot.worker === "object" ? snapshot.worker : {};
  const counts = snapshot.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const config = snapshot.config && typeof snapshot.config === "object" ? snapshot.config : {};

  const running = toBool(worker.running);
  const observable = toBool(worker.observable);
  const lastActivityAt = typeof worker.last_activity_at === "string" ? worker.last_activity_at : null;
  const staleMs = Math.max(1000, toInt(config.stale_ms, 120000));
  const heartbeatTtlMs = Math.max(1000, toInt(config.worker_heartbeat_ttl_ms, staleMs));

  const staleProcessing = Math.max(0, toInt(counts.stale_processing, 0));
  const failed = Math.max(0, toInt(counts.failed, 0));
  const processing = Math.max(0, toInt(counts.processing, 0));
  const queued = Math.max(0, toInt(counts.queued, 0));
  const retryEligibleQueued = Math.max(0, toInt(counts.retry_eligible_queued, 0));

  const reasons = [];
  const nowMs = Date.now();
  const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : NaN;
  const activityWindowMs = Math.max(staleMs, heartbeatTtlMs);

  if (queueMode === "worker" && observable && !running) {
    reasons.push("WORKER_NOT_RUNNING");
  }
  if (staleProcessing > 0) {
    reasons.push("STALE_PROCESSING_JOBS");
  }
  if (
    queueMode === "worker" &&
    running &&
    processing > 0 &&
    Number.isFinite(lastActivityMs) &&
    nowMs - lastActivityMs > activityWindowMs
  ) {
    reasons.push("WORKER_ACTIVITY_STALE");
  }
  if (failed > 0) {
    reasons.push("FAILED_JOBS_PRESENT");
  }
  if (queued > 0 && processing === 0 && retryEligibleQueued === 0) {
    reasons.push("QUEUE_NOT_PROGRESSING");
  }

  if (reasons.includes("WORKER_NOT_RUNNING")) {
    return { status: "down", status_reasons: reasons };
  }
  if (
    reasons.includes("STALE_PROCESSING_JOBS") ||
    reasons.includes("WORKER_ACTIVITY_STALE")
  ) {
    return { status: "stalled", status_reasons: reasons };
  }
  if (
    reasons.includes("FAILED_JOBS_PRESENT") ||
    reasons.includes("QUEUE_NOT_PROGRESSING")
  ) {
    return { status: "degraded", status_reasons: reasons };
  }
  return { status: "healthy", status_reasons: [] };
}
