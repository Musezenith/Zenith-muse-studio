import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AUDIT_ACTIONS, appendAuditLog } from "./auditStore.mjs";
import { buildCaseStudyDraft } from "./caseStudyStore.mjs";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { getJobById } from "./jobsStore.mjs";
import { getTestimonialByJob } from "./testimonialStore.mjs";

const COMPLETED_JOB_STATUSES = new Set(["final selected", "exported", "archived"]);
const PROOF_STATUSES = new Set(["draft", "ready", "approved", "published"]);

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function toText(value, max = 8000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isProofEligible(job) {
  if (!job) return false;
  if (!COMPLETED_JOB_STATUSES.has(String(job.status || "").toLowerCase())) return false;
  if (!job.is_pilot) return true;
  return Boolean(job.case_study_permission);
}

function parseSourceSnapshot(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizePack(row, job) {
  if (!row || !job) return null;
  const canView = row.visibility !== "restricted";
  return {
    id: row.id,
    job_id: row.job_id,
    hero_proof_summary: canView ? row.hero_proof_summary : "",
    snippets: {
      landing_page: canView ? row.landing_page_snippet : "",
      sales_deck: canView ? row.sales_deck_snippet : "",
      outreach: canView ? row.outreach_snippet : "",
      social: canView ? row.social_snippet : "",
    },
    turnaround_proof: canView ? row.turnaround_proof : "",
    testimonial_snippet: canView ? row.testimonial_snippet : "",
    status: row.status,
    visibility: row.visibility,
    eligible: isProofEligible(job),
    permissions: {
      is_pilot: Boolean(job.is_pilot),
      case_study_permission: Boolean(job.case_study_permission),
      testimonial_permission: Boolean(job.testimonial_permission),
    },
    source_snapshot: parseSourceSnapshot(row.source_snapshot_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getByJob(db, jobId) {
  return db
    .prepare(
      `
      SELECT
        id, job_id, hero_proof_summary, landing_page_snippet, sales_deck_snippet, outreach_snippet,
        social_snippet, turnaround_proof, testimonial_snippet, status, visibility,
        source_snapshot_json, created_at, updated_at
      FROM proof_asset_packs
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
  if (!isProofEligible(job)) {
    const error = new Error("Job is not eligible for proof asset pack");
    error.status = 400;
    error.body = {
      errors: {
        eligibility:
          "Proof packs require completed status (final selected/exported/archived) and case study permission for pilot jobs.",
      },
    };
    throw error;
  }
}

function deriveVisibility(job) {
  return isProofEligible(job) ? "visible" : "restricted";
}

function buildTurnaroundProof(slaSummary = {}, costSummary = {}) {
  const status = slaSummary?.status || "unknown";
  const first = slaSummary?.brief_to_first_output?.hours;
  const final = slaSummary?.feedback_to_final_delivery?.hours;
  const firstText = first === null || first === undefined ? "n/a" : `${Number(first).toFixed(1)}h`;
  const finalText = final === null || final === undefined ? "n/a" : `${Number(final).toFixed(1)}h`;
  const cost = Number(costSummary?.total_cost || 0).toFixed(2);
  return `SLA ${status}; brief->first ${firstText}; feedback->final ${finalText}; generation cost $${cost}.`;
}

export function getProofAssetPackByJob(jobId, { dbPath } = {}) {
  const job = getJobById(jobId, { dbPath });
  if (!job) return null;
  const db = openDb(dbPath);
  try {
    const row = getByJob(db, jobId);
    if (!row) {
      return {
        id: null,
        job_id: jobId,
        hero_proof_summary: "",
        snippets: { landing_page: "", sales_deck: "", outreach: "", social: "" },
        turnaround_proof: "",
        testimonial_snippet: "",
        status: "draft",
        visibility: deriveVisibility(job),
        eligible: isProofEligible(job),
        permissions: {
          is_pilot: Boolean(job.is_pilot),
          case_study_permission: Boolean(job.case_study_permission),
          testimonial_permission: Boolean(job.testimonial_permission),
        },
        source_snapshot: {},
        created_at: null,
        updated_at: null,
      };
    }
    return normalizePack(row, job);
  } finally {
    db.close();
  }
}

export async function generateProofAssetPack(
  jobId,
  { actor = "operator" } = {},
  { dbPath } = {}
) {
  const job = getJobById(jobId, { dbPath });
  ensureWritable(job);

  const caseStudy = await buildCaseStudyDraft(jobId, { dbPath });
  const testimonial = getTestimonialByJob(jobId, { dbPath });
  const testimonialSnippet =
    testimonial?.eligible && testimonial?.draft
      ? testimonial.draft.slice(0, 240)
      : "Testimonial not yet approved for publication.";
  const turnaroundProof = buildTurnaroundProof(caseStudy?.sla_summary, caseStudy?.cost_summary);
  const hero = `${job.brand}: ${caseStudy?.challenge || "Operational challenge"} -> ${caseStudy?.results_notes || "Measured studio outcome"}`;
  const landing = `For ${job.brand}, we delivered ${job.deliverables} with ${turnaroundProof}`;
  const salesDeck = `Creative execution: ${caseStudy?.creative_approach || "n/a"} | Execution: ${caseStudy?.execution || "n/a"}`;
  const outreach = `Proof point for ${job.client_name}: ${hero}`;
  const social = `${job.brand} case proof: ${caseStudy?.turnaround || turnaroundProof}`;
  const snapshot = {
    generated_at: new Date().toISOString(),
    case_study_title: caseStudy?.title || null,
    testimonial_status: testimonial?.status || null,
    sla_status: caseStudy?.sla_summary?.status || "unknown",
    cost_total: caseStudy?.cost_summary?.total_cost || 0,
    final_asset_count: Array.isArray(caseStudy?.final_asset_metadata)
      ? caseStudy.final_asset_metadata.length
      : 0,
  };

  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    const existing = getByJob(db, jobId);
    if (existing) {
      db.prepare(
        `
        UPDATE proof_asset_packs
        SET hero_proof_summary = ?, landing_page_snippet = ?, sales_deck_snippet = ?, outreach_snippet = ?,
            social_snippet = ?, turnaround_proof = ?, testimonial_snippet = ?, status = ?, visibility = ?,
            source_snapshot_json = ?, updated_at = ?
        WHERE job_id = ?
      `
      ).run(
        hero,
        landing,
        salesDeck,
        outreach,
        social,
        turnaroundProof,
        testimonialSnippet,
        "draft",
        "visible",
        JSON.stringify(snapshot),
        now,
        jobId
      );
    } else {
      db.prepare(
        `
        INSERT INTO proof_asset_packs (
          id, job_id, hero_proof_summary, landing_page_snippet, sales_deck_snippet, outreach_snippet,
          social_snippet, turnaround_proof, testimonial_snippet, status, visibility,
          source_snapshot_json, created_at, updated_at
        ) VALUES (
          @id, @job_id, @hero_proof_summary, @landing_page_snippet, @sales_deck_snippet, @outreach_snippet,
          @social_snippet, @turnaround_proof, @testimonial_snippet, @status, @visibility,
          @source_snapshot_json, @created_at, @updated_at
        )
      `
      ).run({
        id: randomUUID(),
        job_id: jobId,
        hero_proof_summary: hero,
        landing_page_snippet: landing,
        sales_deck_snippet: salesDeck,
        outreach_snippet: outreach,
        social_snippet: social,
        turnaround_proof: turnaroundProof,
        testimonial_snippet: testimonialSnippet,
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
      action_type: AUDIT_ACTIONS.PROOF_PACK_GENERATED,
      actor,
      metadata: {
        status: "draft",
      },
    },
    { dbPath }
  );

  return getProofAssetPackByJob(jobId, { dbPath });
}

export function updateProofAssetPack(
  jobId,
  {
    hero_proof_summary,
    snippets,
    turnaround_proof,
    testimonial_snippet,
    status,
    actor = "operator",
  } = {},
  { dbPath } = {}
) {
  const job = getJobById(jobId, { dbPath });
  ensureWritable(job);

  const nextStatus =
    status === undefined ? undefined : toText(status, 40).toLowerCase();
  if (nextStatus !== undefined && !PROOF_STATUSES.has(nextStatus)) {
    const error = new Error("Invalid proof pack status");
    error.status = 400;
    error.body = {
      errors: {
        status: `status must be one of: ${Array.from(PROOF_STATUSES).join(", ")}`,
      },
    };
    throw error;
  }

  const db = openDb(dbPath);
  try {
    const row = getByJob(db, jobId);
    const now = new Date().toISOString();
    const next = {
      hero_proof_summary:
        hero_proof_summary === undefined ? row?.hero_proof_summary || "" : toText(hero_proof_summary, 3000),
      landing_page_snippet:
        snippets?.landing_page === undefined ? row?.landing_page_snippet || "" : toText(snippets.landing_page, 3000),
      sales_deck_snippet:
        snippets?.sales_deck === undefined ? row?.sales_deck_snippet || "" : toText(snippets.sales_deck, 3000),
      outreach_snippet:
        snippets?.outreach === undefined ? row?.outreach_snippet || "" : toText(snippets.outreach, 3000),
      social_snippet:
        snippets?.social === undefined ? row?.social_snippet || "" : toText(snippets.social, 3000),
      turnaround_proof:
        turnaround_proof === undefined ? row?.turnaround_proof || "" : toText(turnaround_proof, 2000),
      testimonial_snippet:
        testimonial_snippet === undefined ? row?.testimonial_snippet || "" : toText(testimonial_snippet, 2000),
      status: nextStatus || row?.status || "draft",
      visibility: "visible",
      source_snapshot_json: row?.source_snapshot_json || JSON.stringify({ job_id: jobId }),
    };

    if (row) {
      db.prepare(
        `
        UPDATE proof_asset_packs
        SET hero_proof_summary = ?, landing_page_snippet = ?, sales_deck_snippet = ?, outreach_snippet = ?,
            social_snippet = ?, turnaround_proof = ?, testimonial_snippet = ?, status = ?, visibility = ?, updated_at = ?
        WHERE job_id = ?
      `
      ).run(
        next.hero_proof_summary,
        next.landing_page_snippet,
        next.sales_deck_snippet,
        next.outreach_snippet,
        next.social_snippet,
        next.turnaround_proof,
        next.testimonial_snippet,
        next.status,
        next.visibility,
        now,
        jobId
      );
    } else {
      db.prepare(
        `
        INSERT INTO proof_asset_packs (
          id, job_id, hero_proof_summary, landing_page_snippet, sales_deck_snippet, outreach_snippet,
          social_snippet, turnaround_proof, testimonial_snippet, status, visibility,
          source_snapshot_json, created_at, updated_at
        ) VALUES (
          @id, @job_id, @hero_proof_summary, @landing_page_snippet, @sales_deck_snippet, @outreach_snippet,
          @social_snippet, @turnaround_proof, @testimonial_snippet, @status, @visibility,
          @source_snapshot_json, @created_at, @updated_at
        )
      `
      ).run({
        id: randomUUID(),
        job_id: jobId,
        ...next,
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
      action_type: AUDIT_ACTIONS.PROOF_PACK_UPDATED,
      actor,
      metadata: {
        status: nextStatus || undefined,
      },
    },
    { dbPath }
  );

  return getProofAssetPackByJob(jobId, { dbPath });
}
