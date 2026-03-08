import assert from "node:assert/strict";
import { deriveQueueAlertPolicy } from "../server/queueAlertPolicy.mjs";

function baseSnapshot() {
  return {
    worker: {
      running: true,
    },
    counts: {
      queued: 0,
      failed: 0,
      retry_eligible_queued: 0,
      stale_processing: 0,
    },
    summary: {
      has_backlog: false,
      has_failures: false,
      has_retries: false,
      has_stale_work: false,
      is_worker_live: true,
    },
    thresholds: {
      backlog_warn_count: 5,
      backlog_critical_count: 10,
    },
    latency: {
      queue_wait_avg_ms: null,
      processing_avg_ms: null,
      end_to_end_avg_ms: null,
      last_queue_wait_ms: null,
      last_processing_ms: null,
      last_end_to_end_ms: null,
    },
    config: {
      queue_wait_warn_ms: 1000,
      queue_wait_critical_ms: 5000,
      processing_warn_ms: 2000,
      processing_critical_ms: 6000,
      end_to_end_warn_ms: 3000,
      end_to_end_critical_ms: 7000,
    },
  };
}

function run() {
  const ok = deriveQueueAlertPolicy(baseSnapshot());
  assert.equal(ok.alert_state, "ok");
  assert.deepEqual(ok.alert_reasons, []);

  const warn = deriveQueueAlertPolicy({
    ...baseSnapshot(),
    counts: {
      ...baseSnapshot().counts,
      failed: 1,
    },
    summary: {
      ...baseSnapshot().summary,
      has_failures: true,
    },
  });
  assert.equal(warn.alert_state, "warn");
  assert.ok(warn.alert_reasons.includes("FAILURE_PRESSURE"));

  const critical = deriveQueueAlertPolicy({
    ...baseSnapshot(),
    worker: { running: false },
    counts: {
      ...baseSnapshot().counts,
      queued: 4,
    },
    summary: {
      ...baseSnapshot().summary,
      has_backlog: true,
      is_worker_live: false,
    },
  });
  assert.equal(critical.alert_state, "critical");
  assert.ok(critical.alert_reasons.includes("WORKER_DOWN_WITH_BACKLOG"));

  const priority = deriveQueueAlertPolicy({
    ...baseSnapshot(),
    worker: { running: false },
    counts: {
      ...baseSnapshot().counts,
      queued: 6,
      failed: 1,
    },
    summary: {
      ...baseSnapshot().summary,
      has_backlog: true,
      has_failures: true,
      is_worker_live: false,
    },
  });
  assert.equal(priority.alert_state, "critical");
  assert.ok(priority.alert_reasons.includes("WORKER_DOWN_WITH_BACKLOG"));
  assert.ok(priority.alert_reasons.includes("FAILURE_PRESSURE"));

  console.log("Queue alert policy derivation tests passed");
}

run();
