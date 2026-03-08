function toFiniteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function ageFromIso(isoValue, nowMs) {
  if (typeof isoValue !== "string" || !isoValue) return null;
  const parsed = Date.parse(isoValue);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(nowMs - parsed));
}

function deriveThresholds(config = {}) {
  const staleMs = Math.max(1000, toNonNegativeInt(config.stale_ms, 120000));
  const sweepIntervalMs = Math.max(200, toNonNegativeInt(config.sweep_interval_ms, 1000));
  const heartbeatTtlMs = Math.max(
    1000,
    toNonNegativeInt(config.worker_heartbeat_ttl_ms, Math.max(staleMs, sweepIntervalMs * 3))
  );
  const retryMaxAttempts = Math.max(1, toNonNegativeInt(config.retry_max_attempts, 1));
  const backlogWarnCount = Math.max(1, retryMaxAttempts * 2);
  const backlogCriticalCount = Math.max(backlogWarnCount + 1, backlogWarnCount * 3);
  const activityStaleMs = Math.max(staleMs, heartbeatTtlMs);
  const sweepStaleMs = Math.max(staleMs, sweepIntervalMs * 3);
  return {
    backlog_warn_count: backlogWarnCount,
    backlog_critical_count: backlogCriticalCount,
    activity_stale_ms: activityStaleMs,
    sweep_stale_ms: sweepStaleMs,
  };
}

export function deriveQueueHealthSummary(snapshot = {}, now = Date.now()) {
  const nowMs = toFiniteNumber(now, Date.now());
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const worker = snapshot?.worker && typeof snapshot.worker === "object" ? snapshot.worker : {};
  const config = snapshot?.config && typeof snapshot.config === "object" ? snapshot.config : {};
  const thresholds = deriveThresholds(config);
  const queued = toNonNegativeInt(counts.queued, 0);
  const failed = toNonNegativeInt(counts.failed, 0);
  const retryEligibleQueued = toNonNegativeInt(counts.retry_eligible_queued, 0);
  const staleProcessing = toNonNegativeInt(counts.stale_processing, 0);

  const timing = {
    worker_heartbeat_age_ms: ageFromIso(worker.last_seen_at, nowMs),
    last_activity_age_ms: ageFromIso(worker.last_activity_at, nowMs),
    last_sweep_age_ms: ageFromIso(worker.last_sweep_at, nowMs),
  };

  const summary = {
    has_backlog: queued > 0,
    has_failures: failed > 0,
    has_retries: retryEligibleQueued > 0,
    has_stale_work: staleProcessing > 0,
    is_worker_live: worker.running === true,
  };

  return {
    summary,
    timing,
    thresholds,
  };
}
