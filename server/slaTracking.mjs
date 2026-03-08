export const DEFAULT_SLA_POLICY = {
  version: "v1",
  pilot_override: false,
  first_output: {
    target_hours: 24,
    at_risk_hours: 18,
  },
  final_delivery: {
    target_hours: 48,
    at_risk_hours: 36,
  },
};

export const PILOT_SLA_POLICY_OVERRIDE = {
  version: "v1-pilot",
  pilot_override: true,
  first_output: {
    target_hours: 36,
    at_risk_hours: 30,
  },
  final_delivery: {
    target_hours: 72,
    at_risk_hours: 60,
  },
};

function parseTs(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function iso(value) {
  const date = parseTs(value);
  return date ? date.toISOString() : null;
}

function addHours(date, hours) {
  if (!date || !Number.isFinite(hours)) return null;
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function hoursBetween(start, end) {
  if (!start || !end) return null;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function phaseStatus(hours, rule) {
  if (hours === null) return "unknown";
  if (hours >= rule.target_hours) return "overdue";
  if (hours >= rule.at_risk_hours) return "at-risk";
  return "on-time";
}

function safePolicy(value, isPilot = false) {
  if (!value || typeof value !== "object") {
    return createSlaPolicySnapshot({ is_pilot: isPilot });
  }
  const firstTarget = Number(value?.first_output?.target_hours);
  const firstRisk = Number(value?.first_output?.at_risk_hours);
  const finalTarget = Number(value?.final_delivery?.target_hours);
  const finalRisk = Number(value?.final_delivery?.at_risk_hours);
  if (
    !Number.isFinite(firstTarget) ||
    !Number.isFinite(firstRisk) ||
    !Number.isFinite(finalTarget) ||
    !Number.isFinite(finalRisk)
  ) {
    return createSlaPolicySnapshot({ is_pilot: isPilot });
  }
  return {
    version: String(value.version || "v1"),
    pilot_override: Boolean(value.pilot_override),
    first_output: {
      target_hours: firstTarget,
      at_risk_hours: firstRisk,
    },
    final_delivery: {
      target_hours: finalTarget,
      at_risk_hours: finalRisk,
    },
    captured_at: iso(value.captured_at) || new Date().toISOString(),
  };
}

export function createSlaPolicySnapshot(job = {}) {
  const isPilot = Boolean(job?.is_pilot);
  const base = isPilot ? PILOT_SLA_POLICY_OVERRIDE : DEFAULT_SLA_POLICY;
  return {
    ...base,
    first_output: { ...base.first_output },
    final_delivery: { ...base.final_delivery },
    captured_at: new Date().toISOString(),
  };
}

export function parseSlaPolicySnapshot(rawSnapshot, job = {}) {
  if (!rawSnapshot) return createSlaPolicySnapshot(job);
  if (typeof rawSnapshot === "string") {
    try {
      return safePolicy(JSON.parse(rawSnapshot), Boolean(job?.is_pilot));
    } catch (_) {
      return createSlaPolicySnapshot(job);
    }
  }
  return safePolicy(rawSnapshot, Boolean(job?.is_pilot));
}

export function deriveSlaState(job = {}, now = new Date()) {
  const policy = parseSlaPolicySnapshot(job.sla_policy_snapshot_json, job);
  const briefReceivedAt = parseTs(job.brief_received_at || job.created_at);
  const firstOutputAt = parseTs(job.first_output_at);
  const feedbackReceivedAt = parseTs(job.feedback_received_at);
  const finalDeliveredAt = parseTs(job.final_delivered_at);

  const firstOutputDueAt =
    parseTs(job.first_output_due_at) || addHours(briefReceivedAt, policy.first_output.target_hours);
  const finalDueAt =
    parseTs(job.final_due_at) ||
    (feedbackReceivedAt ? addHours(feedbackReceivedAt, policy.final_delivery.target_hours) : null);

  const firstHours = hoursBetween(briefReceivedAt, firstOutputAt || now);
  const finalHours = feedbackReceivedAt
    ? hoursBetween(feedbackReceivedAt, finalDeliveredAt || now)
    : null;

  const firstStatus = briefReceivedAt
    ? phaseStatus(firstHours, policy.first_output)
    : "unknown";
  const finalStatus = feedbackReceivedAt
    ? phaseStatus(finalHours, policy.final_delivery)
    : "unknown";

  let overallStatus = "unknown";
  if (feedbackReceivedAt) {
    overallStatus = finalStatus;
  } else if (briefReceivedAt) {
    overallStatus = firstStatus;
  }

  return {
    overall_status: overallStatus,
    sla_first_output_status: firstStatus,
    sla_final_status: finalStatus,
    brief_received_at: iso(briefReceivedAt),
    first_output_due_at: iso(firstOutputDueAt),
    final_due_at: iso(finalDueAt),
    summary: {
      status: overallStatus,
      brief_to_first_output: {
        status: firstStatus,
        hours: firstHours === null ? null : Number(firstHours.toFixed(2)),
        target_hours: policy.first_output.target_hours,
        at_risk_hours: policy.first_output.at_risk_hours,
        start_at: iso(briefReceivedAt),
        end_at: iso(firstOutputAt),
        due_at: iso(firstOutputDueAt),
      },
      feedback_to_final_delivery: {
        status: finalStatus,
        hours: finalHours === null ? null : Number(finalHours.toFixed(2)),
        target_hours: policy.final_delivery.target_hours,
        at_risk_hours: policy.final_delivery.at_risk_hours,
        start_at: iso(feedbackReceivedAt),
        end_at: iso(finalDeliveredAt),
        due_at: iso(finalDueAt),
      },
      breach_reason_code: job.breach_reason_code || null,
      breach_note: job.breach_note || null,
      policy_snapshot: policy,
    },
  };
}
