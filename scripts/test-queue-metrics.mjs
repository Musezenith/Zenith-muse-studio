import assert from "node:assert/strict";
import { renderQueueMetrics } from "../server/queueMetrics.mjs";

function getMetricValue(text, metricName) {
  const line = text
    .split("\n")
    .find((entry) => entry.startsWith(`${metricName} `));
  if (!line) return null;
  return Number(line.split(" ")[1]);
}

function run() {
  const metrics = renderQueueMetrics({
    counts: {
      queued: 3,
      processing: 2,
      failed: 1,
      retry_eligible_queued: 4,
      stale_processing: 1,
    },
    worker: {
      observable: true,
      running: false,
      sweeper_enabled: true,
    },
    summary: {
      has_backlog: true,
      has_failures: true,
      has_retries: true,
      has_stale_work: true,
      is_worker_live: false,
    },
    timing: {
      worker_heartbeat_age_ms: null,
      last_activity_age_ms: 1500,
      last_sweep_age_ms: undefined,
    },
    latency: {
      sample_count: 2,
      queue_wait_avg_ms: 100,
      processing_avg_ms: 300,
      end_to_end_avg_ms: null,
      last_queue_wait_ms: 120,
      last_processing_ms: null,
      last_end_to_end_ms: 430,
    },
    status: "down",
    policy: {
      alert_state: "critical",
      thresholds: {
        queue_wait_warn_ms: 100,
        queue_wait_critical_ms: 200,
        processing_warn_ms: 300,
        processing_critical_ms: 400,
        end_to_end_warn_ms: 500,
        end_to_end_critical_ms: 600,
        backlog_warn_count: 7,
        backlog_critical_count: 9,
      },
    },
  });

  const requiredMetrics = [
    "imagen_queue_queued",
    "imagen_queue_processing",
    "imagen_queue_failed",
    "imagen_queue_retry_eligible_queued",
    "imagen_queue_stale_processing",
    "imagen_worker_observable",
    "imagen_worker_running",
    "imagen_worker_sweeper_enabled",
    "imagen_worker_heartbeat_age_ms",
    "imagen_worker_last_activity_age_ms",
    "imagen_worker_last_sweep_age_ms",
    "imagen_queue_has_backlog",
    "imagen_queue_has_failures",
    "imagen_queue_has_retries",
    "imagen_queue_has_stale_work",
    "imagen_queue_status",
    "imagen_queue_alert_state",
    "imagen_queue_latency_samples",
    "imagen_queue_queue_wait_avg_ms",
    "imagen_queue_processing_avg_ms",
    "imagen_queue_end_to_end_avg_ms",
    "imagen_queue_last_queue_wait_ms",
    "imagen_queue_last_processing_ms",
    "imagen_queue_last_end_to_end_ms",
    "imagen_queue_threshold_queue_wait_warn_ms",
    "imagen_queue_threshold_queue_wait_critical_ms",
    "imagen_queue_threshold_processing_warn_ms",
    "imagen_queue_threshold_processing_critical_ms",
    "imagen_queue_threshold_end_to_end_warn_ms",
    "imagen_queue_threshold_end_to_end_critical_ms",
    "imagen_queue_threshold_backlog_warn_count",
    "imagen_queue_threshold_backlog_critical_count",
  ];

  for (const metricName of requiredMetrics) {
    assert.notEqual(getMetricValue(metrics, metricName), null, `${metricName} missing`);
  }

  assert.equal(getMetricValue(metrics, "imagen_worker_observable"), 1);
  assert.equal(getMetricValue(metrics, "imagen_worker_running"), 0);
  assert.equal(getMetricValue(metrics, "imagen_worker_sweeper_enabled"), 1);
  assert.equal(getMetricValue(metrics, "imagen_queue_has_backlog"), 1);
  assert.equal(getMetricValue(metrics, "imagen_queue_has_failures"), 1);
  assert.equal(getMetricValue(metrics, "imagen_queue_has_retries"), 1);
  assert.equal(getMetricValue(metrics, "imagen_queue_has_stale_work"), 1);
  assert.equal(getMetricValue(metrics, "imagen_queue_alert_state"), 2);

  assert.equal(getMetricValue(metrics, "imagen_worker_heartbeat_age_ms"), -1);
  assert.equal(getMetricValue(metrics, "imagen_worker_last_activity_age_ms"), 1500);
  assert.equal(getMetricValue(metrics, "imagen_worker_last_sweep_age_ms"), -1);
  assert.equal(getMetricValue(metrics, "imagen_queue_latency_samples"), 2);
  assert.equal(getMetricValue(metrics, "imagen_queue_queue_wait_avg_ms"), 100);
  assert.equal(getMetricValue(metrics, "imagen_queue_processing_avg_ms"), 300);
  assert.equal(getMetricValue(metrics, "imagen_queue_end_to_end_avg_ms"), -1);
  assert.equal(getMetricValue(metrics, "imagen_queue_last_queue_wait_ms"), 120);
  assert.equal(getMetricValue(metrics, "imagen_queue_last_processing_ms"), -1);
  assert.equal(getMetricValue(metrics, "imagen_queue_last_end_to_end_ms"), 430);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_queue_wait_warn_ms"), 100);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_queue_wait_critical_ms"), 200);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_processing_warn_ms"), 300);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_processing_critical_ms"), 400);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_end_to_end_warn_ms"), 500);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_end_to_end_critical_ms"), 600);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_backlog_warn_count"), 7);
  assert.equal(getMetricValue(metrics, "imagen_queue_threshold_backlog_critical_count"), 9);

  assert.equal(getMetricValue(renderQueueMetrics({ status: "healthy" }), "imagen_queue_status"), 0);
  assert.equal(getMetricValue(renderQueueMetrics({ status: "degraded" }), "imagen_queue_status"), 1);
  assert.equal(getMetricValue(renderQueueMetrics({ status: "stalled" }), "imagen_queue_status"), 2);
  assert.equal(getMetricValue(renderQueueMetrics({ status: "down" }), "imagen_queue_status"), 3);
  assert.equal(getMetricValue(renderQueueMetrics({ policy: { alert_state: "ok" } }), "imagen_queue_alert_state"), 0);
  assert.equal(getMetricValue(renderQueueMetrics({ policy: { alert_state: "warn" } }), "imagen_queue_alert_state"), 1);
  assert.equal(getMetricValue(renderQueueMetrics({ policy: { alert_state: "critical" } }), "imagen_queue_alert_state"), 2);

  console.log("Queue metrics rendering tests passed");
}

run();
