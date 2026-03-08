import assert from "node:assert/strict";
import { deriveQueueLatency } from "../server/queueLatency.mjs";

function run() {
  const derived = deriveQueueLatency({
    latency: {
      sample_count: 3,
      queue_wait_avg_ms: 101.4,
      processing_avg_ms: 202.6,
      end_to_end_avg_ms: 304.1,
      last_queue_wait_ms: 110.2,
      last_processing_ms: 210.8,
      last_end_to_end_ms: 321.0,
    },
  });
  assert.equal(derived.sample_count, 3);
  assert.equal(derived.queue_wait_avg_ms, 101);
  assert.equal(derived.processing_avg_ms, 203);
  assert.equal(derived.end_to_end_avg_ms, 304);
  assert.equal(derived.last_queue_wait_ms, 110);
  assert.equal(derived.last_processing_ms, 211);
  assert.equal(derived.last_end_to_end_ms, 321);

  const missing = deriveQueueLatency({
    latency: {
      sample_count: 0,
      queue_wait_avg_ms: null,
      processing_avg_ms: undefined,
      end_to_end_avg_ms: "bad",
      last_queue_wait_ms: null,
      last_processing_ms: null,
      last_end_to_end_ms: null,
    },
  });
  assert.equal(missing.sample_count, 0);
  assert.equal(missing.queue_wait_avg_ms, null);
  assert.equal(missing.processing_avg_ms, null);
  assert.equal(missing.end_to_end_avg_ms, null);
  assert.equal(missing.last_queue_wait_ms, null);
  assert.equal(missing.last_processing_ms, null);
  assert.equal(missing.last_end_to_end_ms, null);

  console.log("Queue latency derivation tests passed");
}

run();
