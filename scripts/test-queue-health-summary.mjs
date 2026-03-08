import assert from "node:assert/strict";
import { deriveQueueHealthSummary } from "../server/queueHealthSummary.mjs";

function makeSnapshot(overrides = {}) {
  return {
    worker: {
      running: true,
      last_seen_at: "2026-03-09T10:00:00.000Z",
      last_activity_at: "2026-03-09T10:00:10.000Z",
      last_sweep_at: "2026-03-09T10:00:20.000Z",
      ...(overrides.worker || {}),
    },
    counts: {
      queued: 3,
      failed: 1,
      retry_eligible_queued: 2,
      stale_processing: 0,
      ...(overrides.counts || {}),
    },
    config: {
      stale_ms: 120000,
      sweep_interval_ms: 1000,
      worker_heartbeat_ttl_ms: 120000,
      retry_max_attempts: 4,
      ...(overrides.config || {}),
    },
  };
}

function run() {
  const now = Date.parse("2026-03-09T10:01:00.000Z");
  const withTimes = deriveQueueHealthSummary(makeSnapshot(), now);
  assert.equal(withTimes.timing.worker_heartbeat_age_ms, 60000);
  assert.equal(withTimes.timing.last_activity_age_ms, 50000);
  assert.equal(withTimes.timing.last_sweep_age_ms, 40000);
  assert.equal(withTimes.summary.has_backlog, true);
  assert.equal(withTimes.summary.has_failures, true);
  assert.equal(withTimes.summary.has_retries, true);
  assert.equal(withTimes.summary.has_stale_work, false);
  assert.equal(withTimes.summary.is_worker_live, true);

  const missingTimes = deriveQueueHealthSummary(
    makeSnapshot({
      worker: {
        last_seen_at: null,
        last_activity_at: "",
        last_sweep_at: undefined,
      },
    }),
    now
  );
  assert.equal(missingTimes.timing.worker_heartbeat_age_ms, null);
  assert.equal(missingTimes.timing.last_activity_age_ms, null);
  assert.equal(missingTimes.timing.last_sweep_age_ms, null);

  const flags = deriveQueueHealthSummary(
    makeSnapshot({
      worker: { running: false },
      counts: {
        queued: 0,
        failed: 0,
        retry_eligible_queued: 0,
        stale_processing: 1,
      },
    }),
    now
  );
  assert.equal(flags.summary.has_backlog, false);
  assert.equal(flags.summary.has_failures, false);
  assert.equal(flags.summary.has_retries, false);
  assert.equal(flags.summary.has_stale_work, true);
  assert.equal(flags.summary.is_worker_live, false);

  console.log("Queue health summary derivation tests passed");
}

run();
