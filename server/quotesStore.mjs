import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AUDIT_ACTIONS, appendAuditLog } from "./auditStore.mjs";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { getJobById } from "./jobsStore.mjs";
import { calculateQuoteDraft } from "./quotePricing.mjs";
import { migrateQuotes } from "./quotesMigrations.mjs";

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function toStringValue(value, maxLength = 3000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function toPositiveInt(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.floor(num));
}

function parseBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeQuote(row) {
  if (!row) return null;
  return {
    id: row.id,
    job_id: row.job_id,
    package_type: row.package_type,
    number_of_final_images: row.number_of_final_images,
    number_of_directions: row.number_of_directions,
    revision_rounds: row.revision_rounds,
    deadline_urgency: row.deadline_urgency,
    usage_scope: row.usage_scope,
    price: row.price,
    scope_summary: row.scope_summary,
    revision_limit: row.revision_limit,
    delivery_timeline: row.delivery_timeline,
    assumptions: row.assumptions,
    status: row.status,
    is_pilot: Boolean(row.is_pilot),
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateQuoteInput(input = {}) {
  const errors = {};
  const jobId = toStringValue(input.job_id, 120);
  const packageType = toStringValue(input.package_type, 30).toLowerCase() || "starter";
  const numberOfFinalImages = toPositiveInt(input.number_of_final_images, 4);
  const numberOfDirections = toPositiveInt(input.number_of_directions, 1);
  const revisionRounds = Math.max(0, Number(input.revision_rounds ?? 1) | 0);
  const deadlineUrgency =
    toStringValue(input.deadline_urgency, 20).toLowerCase() || "standard";
  const usageScope = toStringValue(input.usage_scope, 20).toLowerCase() || "internal";
  const status = toStringValue(input.status, 30).toLowerCase() || "draft";
  const isPilot =
    input.is_pilot === undefined || input.is_pilot === null ? null : parseBool(input.is_pilot);
  const manual = input.manual || {};

  if (!jobId) errors.job_id = "job_id is required.";
  if (!["starter", "growth", "campaign"].includes(packageType)) {
    errors.package_type = "package_type must be starter, growth, or campaign.";
  }
  if (!["standard", "rush", "urgent"].includes(deadlineUrgency)) {
    errors.deadline_urgency = "deadline_urgency must be standard, rush, or urgent.";
  }
  if (!["internal", "digital", "omni"].includes(usageScope)) {
    errors.usage_scope = "usage_scope must be internal, digital, or omni.";
  }
  if (!["draft", "sent", "approved", "rejected"].includes(status)) {
    errors.status = "status must be draft, sent, approved, or rejected.";
  }

  const manualPrice =
    manual.price !== undefined && manual.price !== null ? Number(manual.price) : null;
  if (manualPrice !== null && (!Number.isFinite(manualPrice) || manualPrice < 0)) {
    errors.manual_price = "manual.price must be a positive number.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      job_id: jobId,
      package_type: packageType,
      number_of_final_images: numberOfFinalImages,
      number_of_directions: numberOfDirections,
      revision_rounds: revisionRounds,
      deadline_urgency: deadlineUrgency,
      usage_scope: usageScope,
      status,
      is_pilot: isPilot,
      manual: {
        price: manualPrice,
        scope_summary: toStringValue(manual.scope_summary || "", 5000),
        delivery_timeline: toStringValue(manual.delivery_timeline || "", 500),
        assumptions: toStringValue(manual.assumptions || "", 5000),
        revision_limit:
          manual.revision_limit === undefined || manual.revision_limit === null
            ? null
            : Math.max(0, Number(manual.revision_limit) | 0),
        is_pilot:
          manual.is_pilot === undefined || manual.is_pilot === null
            ? null
            : parseBool(manual.is_pilot),
      },
    },
  };
}

function applyManualOverride(draft, manual) {
  return {
    ...draft,
    price: manual.price !== null ? Math.round(manual.price) : draft.price,
    scope_summary: manual.scope_summary || draft.scope_summary,
    delivery_timeline: manual.delivery_timeline || draft.delivery_timeline,
    assumptions: manual.assumptions || draft.assumptions,
    revision_limit:
      manual.revision_limit !== null && manual.revision_limit !== undefined
        ? manual.revision_limit
        : draft.revision_limit,
    is_pilot: manual.is_pilot !== null ? manual.is_pilot : draft.is_pilot,
  };
}

function nextQuoteVersion(db, jobId) {
  const row = db
    .prepare("SELECT MAX(version) AS max_version FROM quotes WHERE job_id = ?")
    .get(jobId);
  return (row?.max_version || 0) + 1;
}

export async function initializeQuotesStore({ dbPath } = {}) {
  await migrateQuotes({ dbPath });
}

export function buildQuoteDraft(input, { dbPath } = {}) {
  const validated = validateQuoteInput(input);
  if (!validated.ok) {
    const error = new Error("Invalid quote payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }
  const job = getJobById(validated.value.job_id, { dbPath });
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }
  const draft = calculateQuoteDraft(
    {
      ...validated.value,
      is_pilot: validated.value.is_pilot === null ? job.is_pilot : validated.value.is_pilot,
    },
    job
  );
  return applyManualOverride(draft, validated.value.manual);
}

export function createQuoteVersion(rawInput, { dbPath } = {}) {
  const validated = validateQuoteInput(rawInput);
  if (!validated.ok) {
    const error = new Error("Invalid quote payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }

  const job = getJobById(validated.value.job_id, { dbPath });
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const draft = calculateQuoteDraft(
    {
      ...validated.value,
      is_pilot: validated.value.is_pilot === null ? job.is_pilot : validated.value.is_pilot,
    },
    job
  );
  const quote = applyManualOverride(draft, validated.value.manual);

  const db = openDb(dbPath);
  try {
    const version = nextQuoteVersion(db, validated.value.job_id);
    const now = new Date().toISOString();
    const id = randomUUID();

    db.prepare(
      `
      INSERT INTO quotes (
        id, job_id, package_type, number_of_final_images, number_of_directions, revision_rounds,
        deadline_urgency, usage_scope, price, scope_summary, revision_limit, delivery_timeline,
        assumptions, status, is_pilot, version, created_at, updated_at
      ) VALUES (
        @id, @job_id, @package_type, @number_of_final_images, @number_of_directions, @revision_rounds,
        @deadline_urgency, @usage_scope, @price, @scope_summary, @revision_limit, @delivery_timeline,
        @assumptions, @status, @is_pilot, @version, @created_at, @updated_at
      )
      `
    ).run({
      id,
      job_id: validated.value.job_id,
      package_type: validated.value.package_type,
      number_of_final_images: validated.value.number_of_final_images,
      number_of_directions: validated.value.number_of_directions,
      revision_rounds: validated.value.revision_rounds,
      deadline_urgency: validated.value.deadline_urgency,
      usage_scope: validated.value.usage_scope,
      price: quote.price,
      scope_summary: quote.scope_summary,
      revision_limit: quote.revision_limit,
      delivery_timeline: quote.delivery_timeline,
      assumptions: quote.assumptions,
      status: validated.value.status,
      is_pilot: quote.is_pilot ? 1 : 0,
      version,
      created_at: now,
      updated_at: now,
    });

    const created = getQuoteById(id, { dbPath });
    appendAuditLog(
      {
        entity_type: "job",
        entity_id: validated.value.job_id,
        action_type: AUDIT_ACTIONS.QUOTE_CHANGED,
        actor: "operator",
        metadata: {
          quote_id: id,
          version,
          package_type: validated.value.package_type,
          price: created?.price || quote.price,
          status: validated.value.status,
          is_pilot: Boolean(quote.is_pilot),
        },
      },
      { dbPath }
    );
    return created;
  } finally {
    db.close();
  }
}

export function listQuotesByJob(jobId, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare(
        `
        SELECT
          id, job_id, package_type, number_of_final_images, number_of_directions, revision_rounds,
          deadline_urgency, usage_scope, price, scope_summary, revision_limit, delivery_timeline,
          assumptions, status, is_pilot, version, created_at, updated_at
        FROM quotes
        WHERE job_id = ?
        ORDER BY version DESC, created_at DESC
      `
      )
      .all(jobId);
    return rows.map(normalizeQuote);
  } finally {
    db.close();
  }
}

export function getQuoteById(quoteId, { dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `
        SELECT
          id, job_id, package_type, number_of_final_images, number_of_directions, revision_rounds,
          deadline_urgency, usage_scope, price, scope_summary, revision_limit, delivery_timeline,
          assumptions, status, is_pilot, version, created_at, updated_at
        FROM quotes
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(quoteId);
    return normalizeQuote(row);
  } finally {
    db.close();
  }
}
