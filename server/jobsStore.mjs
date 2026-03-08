import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AUDIT_ACTIONS, appendAuditLog } from "./auditStore.mjs";
import { createInlineImageAsset } from "./assetSchema.mjs";
import { persistAssetsWithFallback } from "./assetStorage.mjs";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { getGenerationCostSummary } from "./generationCostStore.mjs";
import { migrateJobs } from "./jobsMigrations.mjs";
import { createSlaPolicySnapshot, deriveSlaState, parseSlaPolicySnapshot } from "./slaTracking.mjs";

export const JOB_STAGES = [
  "new brief",
  "in production",
  "awaiting feedback",
  "final selected",
  "exported",
  "archived",
];

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function parseJsonObject(value) {
  if (!value) return { links: [], uploads: [] };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : { links: [], uploads: [] };
  } catch (_) {
    return { links: [], uploads: [] };
  }
}

function normalizeJob(row) {
  if (!row) return null;
  const base = {
    id: row.id,
    client_name: row.client_name,
    brand: row.brand,
    contact_info: row.contact_info,
    use_case: row.use_case,
    mood_style: row.mood_style,
    deliverables: row.deliverables,
    deadline: row.deadline,
    references: parseJsonObject(row.references_json),
    notes: row.notes,
    status: normalizeJobStatus(row.status),
    is_pilot: Boolean(row.is_pilot),
    case_study_permission: Boolean(row.case_study_permission),
    testimonial_permission: Boolean(row.testimonial_permission),
    first_output_at: row.first_output_at || null,
    feedback_received_at: row.feedback_received_at || null,
    final_delivered_at: row.final_delivered_at || null,
    brief_received_at: row.brief_received_at || null,
    first_output_due_at: row.first_output_due_at || null,
    final_due_at: row.final_due_at || null,
    sla_first_output_status: row.sla_first_output_status || "unknown",
    sla_final_status: row.sla_final_status || "unknown",
    sla_policy_snapshot_json: row.sla_policy_snapshot_json || null,
    breach_reason_code: row.breach_reason_code || null,
    breach_note: row.breach_note || null,
    generation_cost: {
      run_count: Number(row.cost_run_count || 0),
      actual_runs: Number(row.cost_actual_runs || 0),
      estimated_runs: Number(row.cost_estimated_runs || 0),
      total_cost: Number(row.cost_total || 0),
      actual_cost_total: Number(row.cost_actual_total || 0),
      estimated_cost_total: Number(row.cost_estimated_total || 0),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const derived = deriveSlaState(base);
  return {
    ...base,
    brief_received_at: derived.brief_received_at,
    first_output_due_at: derived.first_output_due_at,
    final_due_at: derived.final_due_at,
    sla_first_output_status: derived.sla_first_output_status,
    sla_final_status: derived.sla_final_status,
    sla_policy_snapshot_json: JSON.stringify(derived.summary.policy_snapshot),
    sla: derived.summary,
  };
}

function normalizeJobStatus(value) {
  const raw = sanitizeText(value || "", 40).toLowerCase();
  if (!raw || raw === "new") return "new brief";
  if (JOB_STAGES.includes(raw)) return raw;
  return raw;
}

function sanitizeText(value, maxLength = 5000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function toDateOnly(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  return trimmed;
}

function todayDateOnly() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeUploads(rawUploads) {
  if (!Array.isArray(rawUploads)) return [];
  return rawUploads
    .map((item) => {
      const fileName = sanitizeText(item?.fileName || "", 200);
      const mimeType = sanitizeText(item?.mimeType || "image/png", 200);
      const dataUri = typeof item?.dataUri === "string" ? item.dataUri : "";
      if (!dataUri.startsWith("data:image/")) return null;
      return { fileName, mimeType, dataUri };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function parseBool(value, fallback = false) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeTimestampInput(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function validateJobInput(input = {}) {
  const errors = {};

  const clientName = sanitizeText(input.client_name, 120);
  const brand = sanitizeText(input.brand, 120);
  const contactInfo = sanitizeText(input.contact_info, 500);
  const useCase = sanitizeText(input.use_case, 600);
  const moodStyle = sanitizeText(input.mood_style, 800);
  const deliverables = sanitizeText(input.deliverables, 1200);
  const deadline = toDateOnly(input.deadline);
  const notes = sanitizeText(input.notes, 4000);
  const referenceLinks = sanitizeText(input.references, 2500);
  const uploads = normalizeUploads(input.reference_uploads);
  const status = normalizeJobStatus(input.status);
  const isPilot = parseBool(input.is_pilot, false);
  const caseStudyPermission = parseBool(input.case_study_permission, false);
  const testimonialPermission = parseBool(input.testimonial_permission, false);
  const firstOutputAt = normalizeTimestampInput(input.first_output_at);
  const feedbackReceivedAt = normalizeTimestampInput(input.feedback_received_at);
  const finalDeliveredAt = normalizeTimestampInput(input.final_delivered_at);
  const briefReceivedAt = normalizeTimestampInput(input.brief_received_at);

  if (!clientName) errors.client_name = "Client name is required.";
  if (!brand) errors.brand = "Brand is required.";
  if (!contactInfo) errors.contact_info = "Contact info is required.";
  if (!useCase) errors.use_case = "Use case is required.";
  if (!deliverables) errors.deliverables = "Deliverables are required.";
  if (!deadline) {
    errors.deadline = "Deadline must be a valid date (YYYY-MM-DD).";
  } else if (deadline < todayDateOnly()) {
    errors.deadline = "Deadline cannot be in the past.";
  }

  if (uploads.length > 0 && uploads.some((item) => item.dataUri.length > 1_200_000)) {
    errors.reference_uploads = "Each uploaded image must be under 1.2MB encoded.";
  }
  if (
    [firstOutputAt, feedbackReceivedAt, finalDeliveredAt, briefReceivedAt].some(
      (value) => value === ""
    )
  ) {
    errors.timestamps = "Provided SLA timestamps must be valid date-time values.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      client_name: clientName,
      brand,
      contact_info: contactInfo,
      use_case: useCase,
      mood_style: moodStyle,
      deliverables,
      deadline,
      references: referenceLinks,
      notes,
      reference_uploads: uploads,
      status,
      is_pilot: isPilot,
      case_study_permission: caseStudyPermission,
      testimonial_permission: testimonialPermission,
      brief_received_at: briefReceivedAt || null,
      first_output_at: firstOutputAt || null,
      feedback_received_at: feedbackReceivedAt || null,
      final_delivered_at: finalDeliveredAt || null,
    },
  };
}

async function persistReferenceUploads(referenceUploads) {
  if (!Array.isArray(referenceUploads) || referenceUploads.length === 0) return [];
  const inlineAssets = referenceUploads.map((upload) =>
    createInlineImageAsset({
      id: randomUUID(),
      dataUri: upload.dataUri,
      mimeType: upload.mimeType || "image/png",
      status: "pending",
    })
  );
  const persisted = await persistAssetsWithFallback(inlineAssets);
  return persisted.map((asset, index) => ({
    id: asset.id,
    fileName: referenceUploads[index]?.fileName || `reference-${index + 1}`,
    ...asset,
  }));
}

export async function initializeJobsStore({ dbPath } = {}) {
  await migrateJobs({ dbPath });
}

export async function createJob(rawInput, { dbPath } = {}) {
  const validated = validateJobInput(rawInput);
  if (!validated.ok) {
    const error = new Error("Invalid job intake payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }

  const payload = validated.value;
  const uploadAssets = await persistReferenceUploads(payload.reference_uploads);
  const references = {
    links: payload.references ? [payload.references] : [],
    uploads: uploadAssets,
  };

  const job = {
    id: randomUUID(),
    client_name: payload.client_name,
    brand: payload.brand,
    contact_info: payload.contact_info,
    use_case: payload.use_case,
    mood_style: payload.mood_style,
    deliverables: payload.deliverables,
    deadline: payload.deadline,
    references,
    notes: payload.notes,
    status: payload.status || "new brief",
    is_pilot: Boolean(payload.is_pilot),
    case_study_permission: Boolean(payload.case_study_permission),
    testimonial_permission: Boolean(payload.testimonial_permission),
    brief_received_at: payload.brief_received_at || null,
    first_output_at: payload.first_output_at || null,
    feedback_received_at: payload.feedback_received_at || null,
    final_delivered_at: payload.final_delivered_at || null,
    first_output_due_at: null,
    final_due_at: null,
    sla_first_output_status: "unknown",
    sla_final_status: "unknown",
    sla_policy_snapshot_json: JSON.stringify(createSlaPolicySnapshot(payload)),
    breach_reason_code: null,
    breach_note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!job.brief_received_at) {
    job.brief_received_at = job.created_at;
  }
  const derived = deriveSlaState(job);
  job.brief_received_at = derived.brief_received_at;
  job.first_output_due_at = derived.first_output_due_at;
  job.final_due_at = derived.final_due_at;
  job.sla_first_output_status = derived.sla_first_output_status;
  job.sla_final_status = derived.sla_final_status;
  job.sla_policy_snapshot_json = JSON.stringify(derived.summary.policy_snapshot);

  const db = openDb(dbPath);
  try {
    db.prepare(
      `
      INSERT INTO jobs (
        id, client_name, brand, contact_info, use_case, mood_style, deliverables, deadline,
        references_json, notes, status, is_pilot, case_study_permission, testimonial_permission,
        brief_received_at, first_output_at, feedback_received_at, final_delivered_at,
        first_output_due_at, final_due_at, sla_first_output_status, sla_final_status,
        sla_policy_snapshot_json, breach_reason_code, breach_note,
        created_at, updated_at
      ) VALUES (
        @id, @client_name, @brand, @contact_info, @use_case, @mood_style, @deliverables, @deadline,
        @references_json, @notes, @status, @is_pilot, @case_study_permission, @testimonial_permission,
        @brief_received_at, @first_output_at, @feedback_received_at, @final_delivered_at,
        @first_output_due_at, @final_due_at, @sla_first_output_status, @sla_final_status,
        @sla_policy_snapshot_json, @breach_reason_code, @breach_note,
        @created_at, @updated_at
      )
      `
    ).run({
      id: job.id,
      client_name: job.client_name,
      brand: job.brand,
      contact_info: job.contact_info,
      use_case: job.use_case,
      mood_style: job.mood_style,
      deliverables: job.deliverables,
      deadline: job.deadline,
      references_json: JSON.stringify(job.references),
      notes: job.notes,
      status: job.status,
      is_pilot: job.is_pilot ? 1 : 0,
      case_study_permission: job.case_study_permission ? 1 : 0,
      testimonial_permission: job.testimonial_permission ? 1 : 0,
      brief_received_at: job.brief_received_at,
      first_output_at: job.first_output_at,
      feedback_received_at: job.feedback_received_at,
      final_delivered_at: job.final_delivered_at,
      first_output_due_at: job.first_output_due_at,
      final_due_at: job.final_due_at,
      sla_first_output_status: job.sla_first_output_status,
      sla_final_status: job.sla_final_status,
      sla_policy_snapshot_json: job.sla_policy_snapshot_json,
      breach_reason_code: job.breach_reason_code,
      breach_note: job.breach_note,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } finally {
    db.close();
  }

  appendAuditLog(
    {
      entity_type: "job",
      entity_id: job.id,
      action_type: AUDIT_ACTIONS.JOB_CREATED,
      actor: "system",
      metadata: {
        brand: job.brand,
        deadline: job.deadline,
        status: job.status,
        is_pilot: Boolean(job.is_pilot),
      },
    },
    { dbPath }
  );

  return job;
}

export function getJobById(jobId, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `
        SELECT
          id, client_name, brand, contact_info, use_case, mood_style, deliverables, deadline,
          references_json, notes, status, is_pilot, case_study_permission, testimonial_permission,
          brief_received_at, first_output_at, feedback_received_at, final_delivered_at,
          first_output_due_at, final_due_at, sla_first_output_status, sla_final_status,
          sla_policy_snapshot_json, breach_reason_code, breach_note,
          (
            SELECT COUNT(*)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id
          ) AS cost_run_count,
          (
            SELECT COUNT(*)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id AND g.actual_cost IS NOT NULL
          ) AS cost_actual_runs,
          (
            SELECT COUNT(*)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id AND g.actual_cost IS NULL
          ) AS cost_estimated_runs,
          (
            SELECT COALESCE(SUM(COALESCE(g.actual_cost, g.estimated_cost)), 0)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id
          ) AS cost_total,
          (
            SELECT COALESCE(SUM(g.actual_cost), 0)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id AND g.actual_cost IS NOT NULL
          ) AS cost_actual_total,
          (
            SELECT COALESCE(SUM(g.estimated_cost), 0)
            FROM generation_cost_runs g
            WHERE g.job_id = jobs.id AND g.actual_cost IS NULL
          ) AS cost_estimated_total,
          created_at, updated_at
        FROM jobs
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(jobId);
    return normalizeJob(row);
  } finally {
    db.close();
  }
}

export function updateJobStatus(
  jobId,
  { status, actor = "operator" } = {},
  { dbPath } = {}
) {
  const nextStatus = normalizeJobStatus(status);
  if (!JOB_STAGES.includes(nextStatus)) {
    const error = new Error("Invalid status");
    error.status = 400;
    error.body = {
      errors: {
        status: `status must be one of: ${JOB_STAGES.join(", ")}`,
      },
    };
    throw error;
  }

  const db = openDb(dbPath);
  let previous = null;
  try {
    previous = db
      .prepare("SELECT id, status FROM jobs WHERE id = ? LIMIT 1")
      .get(jobId);
    if (!previous) return null;
    if (normalizeJobStatus(previous.status) === nextStatus) {
      return getJobById(jobId, { dbPath });
    }
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?"
    ).run(nextStatus, now, jobId);
  } finally {
    db.close();
  }

  appendAuditLog(
    {
      entity_type: "job",
      entity_id: jobId,
      action_type: AUDIT_ACTIONS.STATUS_CHANGED,
      actor,
      metadata: {
        previous_status: normalizeJobStatus(previous.status),
        next_status: nextStatus,
      },
    },
    { dbPath }
  );

  if (nextStatus === "exported") {
    appendAuditLog(
      {
        entity_type: "job",
        entity_id: jobId,
        action_type: AUDIT_ACTIONS.FINAL_EXPORTED,
        actor,
        metadata: {
          status: nextStatus,
        },
      },
      { dbPath }
    );
  }
  if (nextStatus === "archived") {
    appendAuditLog(
      {
        entity_type: "job",
        entity_id: jobId,
        action_type: AUDIT_ACTIONS.ARCHIVED,
        actor,
        metadata: {
          status: nextStatus,
        },
      },
      { dbPath }
    );
  }

  return getJobById(jobId, { dbPath });
}

export function updateJobSlaMilestones(
  jobId,
  {
    brief_received_at,
    first_output_at,
    feedback_received_at,
    final_delivered_at,
    breach_reason_code,
    breach_note,
    actor = "operator",
    allow_clear_breach = false,
    audit_action_type = AUDIT_ACTIONS.ARCHIVE_UPDATED,
  } = {},
  { dbPath } = {}
) {
  const briefReceivedAt = normalizeTimestampInput(brief_received_at);
  const firstOutputAt = normalizeTimestampInput(first_output_at);
  const feedbackReceivedAt = normalizeTimestampInput(feedback_received_at);
  const finalDeliveredAt = normalizeTimestampInput(final_delivered_at);
  const breachReasonCode =
    breach_reason_code === undefined ? undefined : sanitizeText(String(breach_reason_code), 120);
  const breachNote = breach_note === undefined ? undefined : sanitizeText(String(breach_note), 1500);

  if (
    [briefReceivedAt, firstOutputAt, feedbackReceivedAt, finalDeliveredAt].some(
      (value) => value === ""
    )
  ) {
    const error = new Error("Invalid timestamp");
    error.status = 400;
    error.body = {
      errors: {
        timestamp: "Milestone timestamps must be valid date-time values.",
      },
    };
    throw error;
  }

  const db = openDb(dbPath);
  let previous = null;
  try {
    previous = db
      .prepare(
        `
        SELECT
          id,
          is_pilot,
          created_at,
          brief_received_at,
          first_output_at,
          feedback_received_at,
          final_delivered_at,
          first_output_due_at,
          final_due_at,
          sla_first_output_status,
          sla_final_status,
          sla_policy_snapshot_json,
          breach_reason_code,
          breach_note
        FROM jobs
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(jobId);
    if (!previous) return null;

    const policySnapshot = parseSlaPolicySnapshot(previous.sla_policy_snapshot_json, previous);

    const next = {
      brief_received_at:
        briefReceivedAt !== null
          ? briefReceivedAt
          : previous.brief_received_at || previous.created_at || null,
      first_output_at:
        firstOutputAt !== null ? firstOutputAt : previous.first_output_at || null,
      feedback_received_at:
        feedbackReceivedAt !== null ? feedbackReceivedAt : previous.feedback_received_at || null,
      final_delivered_at:
        finalDeliveredAt !== null ? finalDeliveredAt : previous.final_delivered_at || null,
      breach_reason_code:
        breachReasonCode !== undefined
          ? breachReasonCode || null
          : allow_clear_breach
          ? null
          : previous.breach_reason_code || null,
      breach_note:
        breachNote !== undefined
          ? breachNote || null
          : allow_clear_breach
          ? null
          : previous.breach_note || null,
      sla_policy_snapshot_json: JSON.stringify(policySnapshot),
    };

    const derived = deriveSlaState({
      ...previous,
      ...next,
      is_pilot: Boolean(previous.is_pilot),
    });
    next.brief_received_at = derived.brief_received_at;
    next.first_output_due_at = derived.first_output_due_at;
    next.final_due_at = derived.final_due_at;
    next.sla_first_output_status = derived.sla_first_output_status;
    next.sla_final_status = derived.sla_final_status;
    next.sla_policy_snapshot_json = JSON.stringify(derived.summary.policy_snapshot);

    const changed =
      next.brief_received_at !== (previous.brief_received_at || null) ||
      next.first_output_at !== (previous.first_output_at || null) ||
      next.feedback_received_at !== (previous.feedback_received_at || null) ||
      next.final_delivered_at !== (previous.final_delivered_at || null) ||
      next.first_output_due_at !== (previous.first_output_due_at || null) ||
      next.final_due_at !== (previous.final_due_at || null) ||
      next.sla_first_output_status !== (previous.sla_first_output_status || "unknown") ||
      next.sla_final_status !== (previous.sla_final_status || "unknown") ||
      next.sla_policy_snapshot_json !==
        (previous.sla_policy_snapshot_json || JSON.stringify(policySnapshot)) ||
      next.breach_reason_code !== (previous.breach_reason_code || null) ||
      next.breach_note !== (previous.breach_note || null);
    if (!changed) return getJobById(jobId, { dbPath });

    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE jobs
      SET brief_received_at = ?, first_output_at = ?, feedback_received_at = ?, final_delivered_at = ?,
          first_output_due_at = ?, final_due_at = ?, sla_first_output_status = ?, sla_final_status = ?,
          sla_policy_snapshot_json = ?, breach_reason_code = ?, breach_note = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(
      next.brief_received_at,
      next.first_output_at,
      next.feedback_received_at,
      next.final_delivered_at,
      next.first_output_due_at,
      next.final_due_at,
      next.sla_first_output_status,
      next.sla_final_status,
      next.sla_policy_snapshot_json,
      next.breach_reason_code,
      next.breach_note,
      now,
      jobId
    );
  } finally {
    db.close();
  }

  appendAuditLog(
    {
      entity_type: "job",
      entity_id: jobId,
      action_type: audit_action_type,
      actor,
      metadata: {
        brief_received_at: briefReceivedAt || undefined,
        first_output_at: firstOutputAt || undefined,
        feedback_received_at: feedbackReceivedAt || undefined,
        final_delivered_at: finalDeliveredAt || undefined,
        breach_reason_code: breachReasonCode || undefined,
      },
    },
    { dbPath }
  );

  if (finalDeliveredAt) {
    appendAuditLog(
      {
        entity_type: "job",
        entity_id: jobId,
        action_type: AUDIT_ACTIONS.DELIVERED,
        actor,
        metadata: {
          final_delivered_at: finalDeliveredAt,
        },
      },
      { dbPath }
    );
  }

  return getJobById(jobId, { dbPath });
}

export function recomputeJobSla(jobId, { actor = "system" } = {}, { dbPath } = {}) {
  return updateJobSlaMilestones(
    jobId,
    {
      actor,
      audit_action_type: AUDIT_ACTIONS.SLA_RECOMPUTED,
    },
    { dbPath }
  );
}

export function getJobsOverview({ dbPath, limit = 25 } = {}) {
  const db = openDb(dbPath);
  try {
    const summaryRows = db
      .prepare(
        `
        SELECT status, COUNT(*) AS count
        FROM jobs
        GROUP BY status
      `
      )
      .all();

    const summary = {};
    for (const stage of JOB_STAGES) summary[stage] = 0;
    for (const row of summaryRows) {
      const stage = normalizeJobStatus(row.status);
      summary[stage] = (summary[stage] || 0) + Number(row.count || 0);
    }

    const recentRows = db
      .prepare(
        `
        SELECT
          j.id,
          j.client_name,
          j.brand,
          j.deadline,
          j.status,
          j.is_pilot,
          j.brief_received_at,
          j.first_output_at,
          j.feedback_received_at,
          j.final_delivered_at,
          j.first_output_due_at,
          j.final_due_at,
          j.sla_first_output_status,
          j.sla_final_status,
          j.sla_policy_snapshot_json,
          j.breach_reason_code,
          j.breach_note,
          j.created_at,
          j.updated_at,
          (SELECT COUNT(*) FROM quotes q WHERE q.job_id = j.id) AS quote_count,
          (SELECT MAX(q2.version) FROM quotes q2 WHERE q2.job_id = j.id) AS latest_quote_version,
          (
            SELECT COALESCE(SUM(COALESCE(g.actual_cost, g.estimated_cost)), 0)
            FROM generation_cost_runs g
            WHERE g.job_id = j.id
          ) AS generation_cost_total
        FROM jobs j
        ORDER BY j.updated_at DESC, j.created_at DESC
        LIMIT ?
      `
      )
      .all(Math.max(1, Math.min(100, Number(limit) || 25)));

    const recent = recentRows.map((row) => ({
      id: row.id,
      client_name: row.client_name,
      brand: row.brand,
      deadline: row.deadline,
      status: normalizeJobStatus(row.status),
      is_pilot: Boolean(row.is_pilot),
      brief_received_at: row.brief_received_at || null,
      first_output_at: row.first_output_at || null,
      feedback_received_at: row.feedback_received_at || null,
      final_delivered_at: row.final_delivered_at || null,
      first_output_due_at: row.first_output_due_at || null,
      final_due_at: row.final_due_at || null,
      sla_first_output_status: row.sla_first_output_status || "unknown",
      sla_final_status: row.sla_final_status || "unknown",
      sla_policy_snapshot_json: row.sla_policy_snapshot_json || null,
      breach_reason_code: row.breach_reason_code || null,
      breach_note: row.breach_note || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      quote_count: Number(row.quote_count || 0),
      latest_quote_version:
        row.latest_quote_version === null ? null : Number(row.latest_quote_version),
      generation_cost_total: Number(row.generation_cost_total || 0),
    })).map((item) => ({
      ...item,
      sla: deriveSlaState(item).summary,
    }));

    const generation_cost_summary = getGenerationCostSummary({ dbPath });
    return { summary, recent, generation_cost_summary };
  } finally {
    db.close();
  }
}
