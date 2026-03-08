function metricBool(value) {
  return value === true ? 1 : 0;
}

function metricNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metricAge(value) {
  if (value === null || value === undefined || value === "") return -1;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : -1;
}

function metricStatus(status) {
  if (status === "degraded") return 1;
  if (status === "stalled") return 2;
  if (status === "down") return 3;
  return 0;
}

function metricAlertState(alertState) {
  if (alertState === "warn") return 1;
  if (alertState === "critical") return 2;
  return 0;
}

export function renderQueueMetrics(snapshot = {}, _now = Date.now()) {
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const worker = snapshot?.worker && typeof snapshot.worker === "object" ? snapshot.worker : {};
  const summary = snapshot?.summary && typeof snapshot.summary === "object" ? snapshot.summary : {};
  const timing = snapshot?.timing && typeof snapshot.timing === "object" ? snapshot.timing : {};
  const latency = snapshot?.latency && typeof snapshot.latency === "object" ? snapshot.latency : {};
  const policy = snapshot?.policy && typeof snapshot.policy === "object" ? snapshot.policy : {};
  const policyThresholds =
    policy?.thresholds && typeof policy.thresholds === "object" ? policy.thresholds : {};
  const status = String(snapshot?.status || "healthy");

  const lines = [
    "# HELP imagen_queue_queued Number of queued jobs",
    "# TYPE imagen_queue_queued gauge",
    `imagen_queue_queued ${metricNumber(counts.queued, 0)}`,
    "",
    "# HELP imagen_queue_processing Number of processing jobs",
    "# TYPE imagen_queue_processing gauge",
    `imagen_queue_processing ${metricNumber(counts.processing, 0)}`,
    "",
    "# HELP imagen_queue_failed Number of failed jobs",
    "# TYPE imagen_queue_failed gauge",
    `imagen_queue_failed ${metricNumber(counts.failed, 0)}`,
    "",
    "# HELP imagen_queue_retry_eligible_queued Number of retry-eligible queued jobs",
    "# TYPE imagen_queue_retry_eligible_queued gauge",
    `imagen_queue_retry_eligible_queued ${metricNumber(counts.retry_eligible_queued, 0)}`,
    "",
    "# HELP imagen_queue_stale_processing Number of stale processing jobs",
    "# TYPE imagen_queue_stale_processing gauge",
    `imagen_queue_stale_processing ${metricNumber(counts.stale_processing, 0)}`,
    "",
    "# HELP imagen_worker_observable Whether worker observability is available",
    "# TYPE imagen_worker_observable gauge",
    `imagen_worker_observable ${metricBool(worker.observable)}`,
    "",
    "# HELP imagen_worker_running Whether the worker heartbeat is live",
    "# TYPE imagen_worker_running gauge",
    `imagen_worker_running ${metricBool(worker.running)}`,
    "",
    "# HELP imagen_worker_sweeper_enabled Whether stale-job sweeper is enabled",
    "# TYPE imagen_worker_sweeper_enabled gauge",
    `imagen_worker_sweeper_enabled ${metricBool(worker.sweeper_enabled)}`,
    "",
    "# HELP imagen_worker_heartbeat_age_ms Worker heartbeat age in milliseconds (-1 when unknown)",
    "# TYPE imagen_worker_heartbeat_age_ms gauge",
    `imagen_worker_heartbeat_age_ms ${metricAge(timing.worker_heartbeat_age_ms)}`,
    "",
    "# HELP imagen_worker_last_activity_age_ms Worker last activity age in milliseconds (-1 when unknown)",
    "# TYPE imagen_worker_last_activity_age_ms gauge",
    `imagen_worker_last_activity_age_ms ${metricAge(timing.last_activity_age_ms)}`,
    "",
    "# HELP imagen_worker_last_sweep_age_ms Worker last sweep age in milliseconds (-1 when unknown)",
    "# TYPE imagen_worker_last_sweep_age_ms gauge",
    `imagen_worker_last_sweep_age_ms ${metricAge(timing.last_sweep_age_ms)}`,
    "",
    "# HELP imagen_queue_has_backlog Whether queue has backlog",
    "# TYPE imagen_queue_has_backlog gauge",
    `imagen_queue_has_backlog ${metricBool(summary.has_backlog)}`,
    "",
    "# HELP imagen_queue_has_failures Whether queue has failed jobs",
    "# TYPE imagen_queue_has_failures gauge",
    `imagen_queue_has_failures ${metricBool(summary.has_failures)}`,
    "",
    "# HELP imagen_queue_has_retries Whether queue has retry-eligible jobs",
    "# TYPE imagen_queue_has_retries gauge",
    `imagen_queue_has_retries ${metricBool(summary.has_retries)}`,
    "",
    "# HELP imagen_queue_has_stale_work Whether queue has stale processing work",
    "# TYPE imagen_queue_has_stale_work gauge",
    `imagen_queue_has_stale_work ${metricBool(summary.has_stale_work)}`,
    "",
    "# HELP imagen_queue_status Queue health status severity (healthy=0,degraded=1,stalled=2,down=3)",
    "# TYPE imagen_queue_status gauge",
    `imagen_queue_status ${metricStatus(status)}`,
    "",
    "# HELP imagen_queue_alert_state Queue alert policy state (ok=0,warn=1,critical=2)",
    "# TYPE imagen_queue_alert_state gauge",
    `imagen_queue_alert_state ${metricAlertState(policy.alert_state)}`,
    "",
    "# HELP imagen_queue_latency_samples Number of jobs included in latency aggregates",
    "# TYPE imagen_queue_latency_samples gauge",
    `imagen_queue_latency_samples ${metricNumber(latency.sample_count, 0)}`,
    "",
    "# HELP imagen_queue_queue_wait_avg_ms Average queue wait latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_queue_wait_avg_ms gauge",
    `imagen_queue_queue_wait_avg_ms ${metricAge(latency.queue_wait_avg_ms)}`,
    "",
    "# HELP imagen_queue_processing_avg_ms Average processing latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_processing_avg_ms gauge",
    `imagen_queue_processing_avg_ms ${metricAge(latency.processing_avg_ms)}`,
    "",
    "# HELP imagen_queue_end_to_end_avg_ms Average end-to-end latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_end_to_end_avg_ms gauge",
    `imagen_queue_end_to_end_avg_ms ${metricAge(latency.end_to_end_avg_ms)}`,
    "",
    "# HELP imagen_queue_last_queue_wait_ms Last completed job queue wait latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_last_queue_wait_ms gauge",
    `imagen_queue_last_queue_wait_ms ${metricAge(latency.last_queue_wait_ms)}`,
    "",
    "# HELP imagen_queue_last_processing_ms Last completed job processing latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_last_processing_ms gauge",
    `imagen_queue_last_processing_ms ${metricAge(latency.last_processing_ms)}`,
    "",
    "# HELP imagen_queue_last_end_to_end_ms Last completed job end-to-end latency in milliseconds (-1 when unknown)",
    "# TYPE imagen_queue_last_end_to_end_ms gauge",
    `imagen_queue_last_end_to_end_ms ${metricAge(latency.last_end_to_end_ms)}`,
    "",
    "# HELP imagen_queue_threshold_queue_wait_warn_ms Queue wait warning threshold in milliseconds",
    "# TYPE imagen_queue_threshold_queue_wait_warn_ms gauge",
    `imagen_queue_threshold_queue_wait_warn_ms ${metricNumber(policyThresholds.queue_wait_warn_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_queue_wait_critical_ms Queue wait critical threshold in milliseconds",
    "# TYPE imagen_queue_threshold_queue_wait_critical_ms gauge",
    `imagen_queue_threshold_queue_wait_critical_ms ${metricNumber(policyThresholds.queue_wait_critical_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_processing_warn_ms Processing warning threshold in milliseconds",
    "# TYPE imagen_queue_threshold_processing_warn_ms gauge",
    `imagen_queue_threshold_processing_warn_ms ${metricNumber(policyThresholds.processing_warn_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_processing_critical_ms Processing critical threshold in milliseconds",
    "# TYPE imagen_queue_threshold_processing_critical_ms gauge",
    `imagen_queue_threshold_processing_critical_ms ${metricNumber(policyThresholds.processing_critical_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_end_to_end_warn_ms End-to-end warning threshold in milliseconds",
    "# TYPE imagen_queue_threshold_end_to_end_warn_ms gauge",
    `imagen_queue_threshold_end_to_end_warn_ms ${metricNumber(policyThresholds.end_to_end_warn_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_end_to_end_critical_ms End-to-end critical threshold in milliseconds",
    "# TYPE imagen_queue_threshold_end_to_end_critical_ms gauge",
    `imagen_queue_threshold_end_to_end_critical_ms ${metricNumber(policyThresholds.end_to_end_critical_ms, 0)}`,
    "",
    "# HELP imagen_queue_threshold_backlog_warn_count Queue backlog warning threshold",
    "# TYPE imagen_queue_threshold_backlog_warn_count gauge",
    `imagen_queue_threshold_backlog_warn_count ${metricNumber(policyThresholds.backlog_warn_count, 0)}`,
    "",
    "# HELP imagen_queue_threshold_backlog_critical_count Queue backlog critical threshold",
    "# TYPE imagen_queue_threshold_backlog_critical_count gauge",
    `imagen_queue_threshold_backlog_critical_count ${metricNumber(policyThresholds.backlog_critical_count, 0)}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
