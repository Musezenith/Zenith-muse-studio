function metricNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metricDuration(value) {
  if (value === null || value === undefined || value === "") return -1;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : -1;
}

export function renderGenerationMetrics(snapshot = {}, _now = Date.now()) {
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const durations =
    snapshot?.durations && typeof snapshot.durations === "object" ? snapshot.durations : {};

  const lines = [
    "# HELP imagen_generation_total Total generation requests tracked",
    "# TYPE imagen_generation_total gauge",
    `imagen_generation_total ${metricNumber(counts.total, 0)}`,
    "",
    "# HELP imagen_generation_succeeded Total succeeded generation requests",
    "# TYPE imagen_generation_succeeded gauge",
    `imagen_generation_succeeded ${metricNumber(counts.succeeded, 0)}`,
    "",
    "# HELP imagen_generation_failed Total failed generation requests",
    "# TYPE imagen_generation_failed gauge",
    `imagen_generation_failed ${metricNumber(counts.failed, 0)}`,
    "",
    "# HELP imagen_generation_in_flight Total in-flight generation requests",
    "# TYPE imagen_generation_in_flight gauge",
    `imagen_generation_in_flight ${metricNumber(counts.in_flight, 0)}`,
    "",
    "# HELP imagen_generation_request_to_queue_avg_ms Average duration from request receipt to queueing",
    "# TYPE imagen_generation_request_to_queue_avg_ms gauge",
    `imagen_generation_request_to_queue_avg_ms ${metricDuration(durations.request_to_queue_avg_ms)}`,
    "",
    "# HELP imagen_generation_queue_to_worker_start_avg_ms Average duration from queued to worker start",
    "# TYPE imagen_generation_queue_to_worker_start_avg_ms gauge",
    `imagen_generation_queue_to_worker_start_avg_ms ${metricDuration(durations.queue_to_worker_start_avg_ms)}`,
    "",
    "# HELP imagen_generation_worker_to_provider_start_avg_ms Average duration from worker start to provider start",
    "# TYPE imagen_generation_worker_to_provider_start_avg_ms gauge",
    `imagen_generation_worker_to_provider_start_avg_ms ${metricDuration(durations.worker_to_provider_start_avg_ms)}`,
    "",
    "# HELP imagen_generation_provider_execution_avg_ms Average provider execution duration",
    "# TYPE imagen_generation_provider_execution_avg_ms gauge",
    `imagen_generation_provider_execution_avg_ms ${metricDuration(durations.provider_execution_avg_ms)}`,
    "",
    "# HELP imagen_generation_post_processing_avg_ms Average post-processing duration",
    "# TYPE imagen_generation_post_processing_avg_ms gauge",
    `imagen_generation_post_processing_avg_ms ${metricDuration(durations.post_processing_avg_ms)}`,
    "",
    "# HELP imagen_generation_end_to_end_avg_ms Average end-to-end duration",
    "# TYPE imagen_generation_end_to_end_avg_ms gauge",
    `imagen_generation_end_to_end_avg_ms ${metricDuration(durations.end_to_end_avg_ms)}`,
    "",
    "# HELP imagen_generation_request_to_queue_last_ms Last request duration from receipt to queueing",
    "# TYPE imagen_generation_request_to_queue_last_ms gauge",
    `imagen_generation_request_to_queue_last_ms ${metricDuration(durations.request_to_queue_last_ms)}`,
    "",
    "# HELP imagen_generation_queue_to_worker_start_last_ms Last request duration from queued to worker start",
    "# TYPE imagen_generation_queue_to_worker_start_last_ms gauge",
    `imagen_generation_queue_to_worker_start_last_ms ${metricDuration(durations.queue_to_worker_start_last_ms)}`,
    "",
    "# HELP imagen_generation_worker_to_provider_start_last_ms Last request duration from worker start to provider start",
    "# TYPE imagen_generation_worker_to_provider_start_last_ms gauge",
    `imagen_generation_worker_to_provider_start_last_ms ${metricDuration(durations.worker_to_provider_start_last_ms)}`,
    "",
    "# HELP imagen_generation_provider_execution_last_ms Last provider execution duration",
    "# TYPE imagen_generation_provider_execution_last_ms gauge",
    `imagen_generation_provider_execution_last_ms ${metricDuration(durations.provider_execution_last_ms)}`,
    "",
    "# HELP imagen_generation_post_processing_last_ms Last post-processing duration",
    "# TYPE imagen_generation_post_processing_last_ms gauge",
    `imagen_generation_post_processing_last_ms ${metricDuration(durations.post_processing_last_ms)}`,
    "",
    "# HELP imagen_generation_end_to_end_last_ms Last end-to-end duration",
    "# TYPE imagen_generation_end_to_end_last_ms gauge",
    `imagen_generation_end_to_end_last_ms ${metricDuration(durations.end_to_end_last_ms)}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
