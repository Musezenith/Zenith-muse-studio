function toNonNegativeInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function toNonNegativeDuration(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function maxLatency(...values) {
  let max = null;
  for (const value of values) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) continue;
    max = max === null ? number : Math.max(max, number);
  }
  return max;
}

function derivePolicyThresholds(snapshot = {}) {
  const config = snapshot?.config && typeof snapshot.config === "object" ? snapshot.config : {};
  const existingThresholds =
    snapshot?.thresholds && typeof snapshot.thresholds === "object" ? snapshot.thresholds : {};
  const backlogWarn = Math.max(
    1,
    toNonNegativeInt(
      existingThresholds.backlog_warn_count,
      Math.max(1, toNonNegativeInt(config.retry_max_attempts, 1) * 2)
    )
  );
  const backlogCritical = Math.max(
    backlogWarn + 1,
    toNonNegativeInt(existingThresholds.backlog_critical_count, backlogWarn * 3)
  );
  return {
    queue_wait_warn_ms: Math.max(1, toNonNegativeDuration(config.queue_wait_warn_ms, 10000)),
    queue_wait_critical_ms: Math.max(
      1,
      toNonNegativeDuration(config.queue_wait_critical_ms, 30000)
    ),
    processing_warn_ms: Math.max(
      1,
      toNonNegativeDuration(config.processing_warn_ms, 30000)
    ),
    processing_critical_ms: Math.max(
      1,
      toNonNegativeDuration(config.processing_critical_ms, 90000)
    ),
    end_to_end_warn_ms: Math.max(
      1,
      toNonNegativeDuration(config.end_to_end_warn_ms, 45000)
    ),
    end_to_end_critical_ms: Math.max(
      1,
      toNonNegativeDuration(config.end_to_end_critical_ms, 120000)
    ),
    backlog_warn_count: backlogWarn,
    backlog_critical_count: backlogCritical,
  };
}

export function deriveQueueAlertPolicy(snapshot = {}) {
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const worker = snapshot?.worker && typeof snapshot.worker === "object" ? snapshot.worker : {};
  const summary = snapshot?.summary && typeof snapshot.summary === "object" ? snapshot.summary : {};
  const latency = snapshot?.latency && typeof snapshot.latency === "object" ? snapshot.latency : {};
  const thresholds = derivePolicyThresholds(snapshot);

  const queued = toNonNegativeInt(counts.queued, 0);
  const staleProcessing = toNonNegativeInt(counts.stale_processing, 0);
  const workerRunning = worker.running === true;
  const hasBacklog = summary.has_backlog === true || queued > 0;
  const hasFailures = summary.has_failures === true;
  const hasRetries = summary.has_retries === true;
  const queueWaitWorst = maxLatency(latency.queue_wait_avg_ms, latency.last_queue_wait_ms);
  const processingWorst = maxLatency(latency.processing_avg_ms, latency.last_processing_ms);
  const endToEndWorst = maxLatency(latency.end_to_end_avg_ms, latency.last_end_to_end_ms);

  const criticalReasons = [];
  const warnReasons = [];

  if (!workerRunning && hasBacklog) {
    criticalReasons.push("WORKER_DOWN_WITH_BACKLOG");
  }
  if (staleProcessing > 0 || summary.has_stale_work === true) {
    criticalReasons.push("STALE_WORK_PRESENT");
  }
  if (queued >= thresholds.backlog_critical_count) {
    criticalReasons.push("BACKLOG_CRITICAL");
  } else if (queued >= thresholds.backlog_warn_count) {
    warnReasons.push("BACKLOG_WARN");
  }
  if (endToEndWorst !== null && endToEndWorst >= thresholds.end_to_end_critical_ms) {
    criticalReasons.push("LATENCY_END_TO_END_CRITICAL");
  } else if (endToEndWorst !== null && endToEndWorst >= thresholds.end_to_end_warn_ms) {
    warnReasons.push("LATENCY_END_TO_END_WARN");
  }
  if (queueWaitWorst !== null && queueWaitWorst >= thresholds.queue_wait_critical_ms) {
    criticalReasons.push("LATENCY_QUEUE_WAIT_CRITICAL");
  } else if (queueWaitWorst !== null && queueWaitWorst >= thresholds.queue_wait_warn_ms) {
    warnReasons.push("LATENCY_QUEUE_WAIT_WARN");
  }
  if (processingWorst !== null && processingWorst >= thresholds.processing_critical_ms) {
    criticalReasons.push("LATENCY_PROCESSING_CRITICAL");
  } else if (processingWorst !== null && processingWorst >= thresholds.processing_warn_ms) {
    warnReasons.push("LATENCY_PROCESSING_WARN");
  }
  if (hasFailures) {
    warnReasons.push("FAILURE_PRESSURE");
  }
  if (hasRetries) {
    warnReasons.push("RETRY_PRESSURE");
  }

  if (criticalReasons.length > 0) {
    return {
      alert_state: "critical",
      alert_reasons: [...new Set([...criticalReasons, ...warnReasons])],
      thresholds,
    };
  }
  if (warnReasons.length > 0) {
    return {
      alert_state: "warn",
      alert_reasons: [...new Set(warnReasons)],
      thresholds,
    };
  }
  return {
    alert_state: "ok",
    alert_reasons: [],
    thresholds,
  };
}
