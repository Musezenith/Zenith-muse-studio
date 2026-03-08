import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AUDIT_ACTIONS, appendAuditLog } from "./auditStore.mjs";
import { buildCaseStudyDraft } from "./caseStudyStore.mjs";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { getJobById } from "./jobsStore.mjs";

const TESTIMONIAL_STATUSES = new Set(["draft", "captured", "approved", "published"]);
const COMPLETED_JOB_STATUSES = new Set(["final selected", "exported", "archived"]);

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function toText(value, max = 6000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isTestimonialAllowed(job) {
  if (!job) return false;
  if (!COMPLETED_JOB_STATUSES.has(String(job.status || "").toLowerCase())) return false;
  if (!job.is_pilot) return true;
  return Boolean(job.testimonial_permission);
}

function normalizeTestimonial(row, job) {
  if (!row || !job) return null;
  const canView = row.visibility !== "restricted";
  let sourceSnapshot = {};
  try {
    sourceSnapshot = row.source_snapshot_json ? JSON.parse(row.source_snapshot_json) : {};
  } catch (_) {
    sourceSnapshot = {};
  }
  return {
    id: row.id,
    job_id: row.job_id,
    prompt: canView ? row.prompt : "",
    draft: canView ? row.draft : "",
    status: row.status,
    visibility: row.visibility,
    eligible: isTestimonialAllowed(job),
    permissions: {
      is_pilot: Boolean(job.is_pilot),
      testimonial_permission: Boolean(job.testimonial_permission),
    },
    source_snapshot: sourceSnapshot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getRowByJob(db, jobId) {
  return db
    .prepare(
      `
      SELECT
        id, job_id, prompt, draft, status, visibility, source_snapshot_json, created_at, updated_at
      FROM testimonials
      WHERE job_id = ?
      LIMIT 1
    `
    )
    .get(jobId);
}

function ensureWritable(job) {
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }
  if (!isTestimonialAllowed(job)) {
    const error = new Error("Job is not eligible for testimonial capture");
    error.status = 400;
    error.body = {
      errors: {
        eligibility:
          "Testimonials require completed status (final selected/exported/archived) and testimonial permission for pilot jobs.",
      },
    };
    throw error;
  }
}

export function getTestimonialByJob(jobId, { dbPath } = {}) {
  const job = getJobById(jobId, { dbPath });
  if (!job) return null;
  const db = openDb(dbPath);
  try {
    const row = getRowByJob(db, jobId);
    if (!row) {
      return {
        id: null,
        job_id: jobId,
        prompt: "",
        draft: "",
        status: "draft",
        visibility: isTestimonialAllowed(job) ? "visible" : "restricted",
        eligible: isTestimonialAllowed(job),
        permissions: {
          is_pilot: Boolean(job.is_pilot),
          testimonial_permission: Boolean(job.testimonial_permission),
        },
        source_snapshot: {},
        created_at: null,
        updated_at: null,
      };
    }
    return normalizeTestimonial(row, job);
  } finally {
    db.close();
  }
}

export async function generateTestimonialDraft(jobId, { actor = "operator" } = {}, { dbPath } = {}) {
  const job = getJobById(jobId, { dbPath });
  ensureWritable(job);

  const caseStudy = await buildCaseStudyDraft(jobId, { dbPath });
  const prompt = [
    `Write a concise first-person client testimonial for ${job.brand}.`,
    `Use case: ${job.use_case}.`,
    `Tone: credible, specific, no hype.`,
    `SLA status: ${job?.sla?.status || "unknown"}.`,
  ].join(" ");
  const draft = [
    `Working with the studio on ${job.brand} helped us move from brief to usable outputs quickly.`,
    `${caseStudy?.creative_approach || ""}`.trim(),
    `${caseStudy?.turnaround || ""}`.trim(),
    `${caseStudy?.results_notes || ""}`.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const snapshot = {
    job_id: job.id,
    case_study_title: caseStudy?.title || null,
    sla_status: job?.sla?.status || "unknown",
    final_delivered_at: job?.final_delivered_at || null,
    generated_at: new Date().toISOString(),
  };

  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    const existing = getRowByJob(db, jobId);
    if (existing) {
      db.prepare(
        `
        UPDATE testimonials
        SET prompt = ?, draft = ?, status = ?, visibility = ?, source_snapshot_json = ?, updated_at = ?
        WHERE job_id = ?
      `
      ).run(
        prompt,
        draft,
        "draft",
        "visible",
        JSON.stringify(snapshot),
        now,
        jobId
      );
    } else {
      db.prepare(
        `
        INSERT INTO testimonials (
          id, job_id, prompt, draft, status, visibility, source_snapshot_json, created_at, updated_at
        ) VALUES (
          @id, @job_id, @prompt, @draft, @status, @visibility, @source_snapshot_json, @created_at, @updated_at
        )
      `
      ).run({
        id: randomUUID(),
        job_id: jobId,
        prompt,
        draft,
        status: "draft",
        visibility: "visible",
        source_snapshot_json: JSON.stringify(snapshot),
        created_at: now,
        updated_at: now,
      });
    }
  } finally {
    db.close();
  }

  appendAuditLog(
    {
      entity_type: "job",
      entity_id: jobId,
      action_type: AUDIT_ACTIONS.TESTIMONIAL_GENERATED,
      actor,
      metadata: {
        status: "draft",
      },
    },
    { dbPath }
  );

  return getTestimonialByJob(jobId, { dbPath });
}

export function updateTestimonial(
  jobId,
  { prompt, draft, status, actor = "operator" } = {},
  { dbPath } = {}
) {
  const job = getJobById(jobId, { dbPath });
  ensureWritable(job);

  const nextPrompt = prompt === undefined ? undefined : toText(prompt, 4000);
  const nextDraft = draft === undefined ? undefined : toText(draft, 12000);
  const nextStatus =
    status === undefined ? undefined : toText(status, 60).toLowerCase();
  if (nextStatus !== undefined && !TESTIMONIAL_STATUSES.has(nextStatus)) {
    const error = new Error("Invalid testimonial status");
    error.status = 400;
    error.body = {
      errors: {
        status: `status must be one of: ${Array.from(TESTIMONIAL_STATUSES).join(", ")}`,
      },
    };
    throw error;
  }

  const db = openDb(dbPath);
  try {
    const existing = getRowByJob(db, jobId);
    const now = new Date().toISOString();
    if (!existing) {
      db.prepare(
        `
        INSERT INTO testimonials (
          id, job_id, prompt, draft, status, visibility, source_snapshot_json, created_at, updated_at
        ) VALUES (
          @id, @job_id, @prompt, @draft, @status, @visibility, @source_snapshot_json, @created_at, @updated_at
        )
      `
      ).run({
        id: randomUUID(),
        job_id: jobId,
        prompt: nextPrompt || "",
        draft: nextDraft || "",
        status: nextStatus || "draft",
        visibility: "visible",
        source_snapshot_json: JSON.stringify({ job_id: jobId, created_by: actor }),
        created_at: now,
        updated_at: now,
      });
    } else {
      db.prepare(
        `
        UPDATE testimonials
        SET prompt = ?, draft = ?, status = ?, updated_at = ?
        WHERE job_id = ?
      `
      ).run(
        nextPrompt !== undefined ? nextPrompt : existing.prompt,
        nextDraft !== undefined ? nextDraft : existing.draft,
        nextStatus !== undefined ? nextStatus : existing.status,
        now,
        jobId
      );
    }
  } finally {
    db.close();
  }

  appendAuditLog(
    {
      entity_type: "job",
      entity_id: jobId,
      action_type: AUDIT_ACTIONS.TESTIMONIAL_UPDATED,
      actor,
      metadata: {
        status: nextStatus || undefined,
      },
    },
    { dbPath }
  );

  return getTestimonialByJob(jobId, { dbPath });
}
