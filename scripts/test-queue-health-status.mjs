import assert from "node:assert/strict";
import { deriveQueueHealthStatus } from "../server/queueHealthStatus.mjs";

function baseSnapshot() {
  return {
    queue_mode: "worker",
    worker: {
      observable: true,
      running: true,
      last_activity_at: new Date().toISOString(),
    },
    counts: {
      queued: 0,
      processing: 0,
      failed: 0,
      retry_eligible_queued: 0,
      stale_processing: 0,
    },
    config: {
      stale_ms: 120000,
      worker_heartbeat_ttl_ms: 120000,
    },
  };
}

function run() {
  const healthy = deriveQueueHealthStatus(baseSnapshot());
  assert.equal(healthy.status, "healthy");
  assert.deepEqual(healthy.status_reasons, []);

  const down = deriveQueueHealthStatus({
    ...baseSnapshot(),
    worker: {
      observable: true,
      running: false,
      last_activity_at: new Date().toISOString(),
    },
  });
  assert.equal(down.status, "down");
  assert.ok(down.status_reasons.includes("WORKER_NOT_RUNNING"));

  const stalled = deriveQueueHealthStatus({
    ...baseSnapshot(),
    counts: {
      ...baseSnapshot().counts,
      stale_processing: 1,
    },
  });
  assert.equal(stalled.status, "stalled");
  assert.ok(stalled.status_reasons.includes("STALE_PROCESSING_JOBS"));

  const degraded = deriveQueueHealthStatus({
    ...baseSnapshot(),
    counts: {
      ...baseSnapshot().counts,
      failed: 2,
    },
  });
  assert.equal(degraded.status, "degraded");
  assert.ok(degraded.status_reasons.includes("FAILED_JOBS_PRESENT"));

  const priorityDown = deriveQueueHealthStatus({
    ...baseSnapshot(),
    worker: {
      observable: true,
      running: false,
      last_activity_at: new Date().toISOString(),
    },
    counts: {
      ...baseSnapshot().counts,
      stale_processing: 1,
      failed: 1,
    },
  });
  assert.equal(priorityDown.status, "down");

  const priorityStalled = deriveQueueHealthStatus({
    ...baseSnapshot(),
    counts: {
      ...baseSnapshot().counts,
      stale_processing: 1,
      failed: 2,
    },
  });
  assert.equal(priorityStalled.status, "stalled");

  console.log("Queue health status derivation tests passed");
}

run();
