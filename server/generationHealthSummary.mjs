function toNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function toDurationOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

export function deriveGenerationHealthSummary(snapshot = {}) {
  const counts = snapshot?.counts && typeof snapshot.counts === "object" ? snapshot.counts : {};
  const durations =
    snapshot?.durations && typeof snapshot.durations === "object" ? snapshot.durations : {};
  const lastTerminal =
    snapshot?.last_terminal && typeof snapshot.last_terminal === "object"
      ? snapshot.last_terminal
      : {};

  return {
    counts: {
      total: toNonNegativeInt(counts.total, 0),
      succeeded: toNonNegativeInt(counts.succeeded, 0),
      failed: toNonNegativeInt(counts.failed, 0),
      in_flight: toNonNegativeInt(counts.in_flight, 0),
    },
    durations: {
      request_to_queue_avg_ms: toDurationOrNull(durations.request_to_queue_avg_ms),
      queue_to_worker_start_avg_ms: toDurationOrNull(durations.queue_to_worker_start_avg_ms),
      worker_to_provider_start_avg_ms: toDurationOrNull(
        durations.worker_to_provider_start_avg_ms
      ),
      provider_execution_avg_ms: toDurationOrNull(durations.provider_execution_avg_ms),
      post_processing_avg_ms: toDurationOrNull(durations.post_processing_avg_ms),
      end_to_end_avg_ms: toDurationOrNull(durations.end_to_end_avg_ms),
      request_to_queue_last_ms: toDurationOrNull(durations.request_to_queue_last_ms),
      queue_to_worker_start_last_ms: toDurationOrNull(durations.queue_to_worker_start_last_ms),
      worker_to_provider_start_last_ms: toDurationOrNull(
        durations.worker_to_provider_start_last_ms
      ),
      provider_execution_last_ms: toDurationOrNull(durations.provider_execution_last_ms),
      post_processing_last_ms: toDurationOrNull(durations.post_processing_last_ms),
      end_to_end_last_ms: toDurationOrNull(durations.end_to_end_last_ms),
    },
    last_terminal: {
      status: lastTerminal?.status || null,
      error_code: lastTerminal?.error_code || null,
      at: lastTerminal?.at || null,
    },
  };
}
