function toDurationOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function toCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

export function deriveQueueLatency(snapshot = {}) {
  const source = snapshot?.latency && typeof snapshot.latency === "object" ? snapshot.latency : {};
  return {
    sample_count: toCount(source.sample_count),
    queue_wait_avg_ms: toDurationOrNull(source.queue_wait_avg_ms),
    processing_avg_ms: toDurationOrNull(source.processing_avg_ms),
    end_to_end_avg_ms: toDurationOrNull(source.end_to_end_avg_ms),
    last_queue_wait_ms: toDurationOrNull(source.last_queue_wait_ms),
    last_processing_ms: toDurationOrNull(source.last_processing_ms),
    last_end_to_end_ms: toDurationOrNull(source.last_end_to_end_ms),
  };
}
