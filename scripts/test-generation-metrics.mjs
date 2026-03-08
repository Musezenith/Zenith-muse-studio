import assert from "node:assert/strict";
import { renderGenerationMetrics } from "../server/generationMetrics.mjs";

function metricValue(text, name) {
  const line = text.split("\n").find((entry) => entry.startsWith(`${name} `));
  if (!line) return null;
  return Number(line.split(" ")[1]);
}

function run() {
  const metrics = renderGenerationMetrics({
    counts: {
      total: 5,
      succeeded: 3,
      failed: 1,
      in_flight: 1,
    },
    durations: {
      request_to_queue_avg_ms: 12,
      queue_to_worker_start_avg_ms: null,
      worker_to_provider_start_avg_ms: 4,
      provider_execution_avg_ms: 130,
      post_processing_avg_ms: 18,
      end_to_end_avg_ms: 200,
      request_to_queue_last_ms: 10,
      queue_to_worker_start_last_ms: null,
      worker_to_provider_start_last_ms: 5,
      provider_execution_last_ms: 140,
      post_processing_last_ms: 20,
      end_to_end_last_ms: 210,
    },
  });

  assert.equal(metricValue(metrics, "imagen_generation_total"), 5);
  assert.equal(metricValue(metrics, "imagen_generation_in_flight"), 1);
  assert.equal(metricValue(metrics, "imagen_generation_request_to_queue_avg_ms"), 12);
  assert.equal(metricValue(metrics, "imagen_generation_queue_to_worker_start_avg_ms"), -1);
  assert.equal(metricValue(metrics, "imagen_generation_end_to_end_last_ms"), 210);

  console.log("Generation metrics rendering tests passed");
}

run();
