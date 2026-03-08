import assert from "node:assert/strict";
import { deriveGenerationHealthSummary } from "../server/generationHealthSummary.mjs";

function run() {
  const summary = deriveGenerationHealthSummary({
    counts: {
      total: 3,
      succeeded: 2,
      failed: 1,
      in_flight: 0,
    },
    durations: {
      request_to_queue_avg_ms: 10.3,
      queue_to_worker_start_avg_ms: 20.4,
      worker_to_provider_start_avg_ms: 5.8,
      provider_execution_avg_ms: 120.9,
      post_processing_avg_ms: 14.4,
      end_to_end_avg_ms: 180.2,
      request_to_queue_last_ms: 9.4,
      queue_to_worker_start_last_ms: 19.7,
      worker_to_provider_start_last_ms: 4.6,
      provider_execution_last_ms: 111.1,
      post_processing_last_ms: 13.6,
      end_to_end_last_ms: 170.5,
    },
    last_terminal: {
      status: "succeeded",
      error_code: null,
      at: "2026-03-10T00:00:00.000Z",
    },
  });

  assert.equal(summary.counts.total, 3);
  assert.equal(summary.durations.provider_execution_avg_ms, 121);
  assert.equal(summary.durations.end_to_end_last_ms, 171);
  assert.equal(summary.last_terminal.status, "succeeded");

  const missing = deriveGenerationHealthSummary({
    counts: {},
    durations: {
      request_to_queue_avg_ms: null,
      provider_execution_last_ms: undefined,
    },
    last_terminal: {},
  });
  assert.equal(missing.counts.total, 0);
  assert.equal(missing.durations.request_to_queue_avg_ms, null);
  assert.equal(missing.durations.provider_execution_last_ms, null);
  assert.equal(missing.last_terminal.at, null);

  console.log("Generation health summary derivation tests passed");
}

run();
