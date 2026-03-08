import { listArchiveRuns } from "./archiveFileStore.mjs";
import { listAuditLogsForEntity } from "./auditStore.mjs";
import { getJobById } from "./jobsStore.mjs";
import { listQuotesByJob } from "./quotesStore.mjs";

const COMPLETED_JOB_STATUSES = new Set(["final selected", "exported", "archived"]);

function toReadableDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

function summarizeSla(sla = {}) {
  const first = sla?.brief_to_first_output || {};
  const final = sla?.feedback_to_final_delivery || {};
  const firstHours =
    first?.hours === null || first?.hours === undefined ? "n/a" : `${Number(first.hours).toFixed(1)}h`;
  const finalHours =
    final?.hours === null || final?.hours === undefined ? "n/a" : `${Number(final.hours).toFixed(1)}h`;
  return `SLA: ${sla?.status || "unknown"} | brief->first: ${firstHours} (${first?.status || "unknown"}) | feedback->final: ${finalHours} (${final?.status || "unknown"})`;
}

function summarizeCost(generationCost = {}) {
  const runCount = Number(generationCost?.run_count || 0);
  const total = Number(generationCost?.total_cost || 0).toFixed(2);
  const estimatedRuns = Number(generationCost?.estimated_runs || 0);
  return `Generation runs: ${runCount}, total cost: $${total}${estimatedRuns > 0 ? ` (includes ${estimatedRuns} estimated)` : ""}`;
}

function normalizeAssetMeta(asset = {}) {
  const storage =
    typeof asset.storage === "object"
      ? {
          mode: asset.storage.mode || "unknown",
          provider: asset.storage.provider || "unknown",
          key: asset.storage.key || null,
        }
      : { mode: "unknown", provider: "unknown", key: null };

  return {
    id: asset.id || null,
    mime_type: asset.mimeType || null,
    status: asset.status || null,
    storage,
    created_at: asset.createdAt || null,
  };
}

function pickLatestQuote(quotes = []) {
  if (!Array.isArray(quotes) || quotes.length === 0) return null;
  return [...quotes].sort((a, b) => {
    const byVersion = Number(b.version || 0) - Number(a.version || 0);
    if (byVersion !== 0) return byVersion;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  })[0];
}

function summarizeAudit(audit = []) {
  const list = Array.isArray(audit) ? audit.slice(0, 8) : [];
  if (list.length === 0) return "No workflow activity logged.";
  return list
    .map((entry) => `${toReadableDate(entry.created_at)} ${entry.action_type}`)
    .join("; ");
}

function summarizeQuote(quote) {
  if (!quote) return "No quote snapshot available.";
  return `Quote v${quote.version} (${quote.package_type}) priced at $${quote.price} with timeline "${quote.delivery_timeline}".`;
}

function getPublishEligibility(job, finalAssetCount) {
  const reasons = [];
  const completed = COMPLETED_JOB_STATUSES.has(String(job?.status || "").toLowerCase());
  const hasPermission = Boolean(job?.case_study_permission) || !Boolean(job?.is_pilot);
  if (!completed) reasons.push("job status not in final selected/exported/archived");
  if (!hasPermission) reasons.push("case study permission is not granted");
  if (finalAssetCount === 0) reasons.push("no final asset metadata found");
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function collectFinalAssetMetadata(job, archiveRuns) {
  const fromReferences = Array.isArray(job?.references?.uploads)
    ? job.references.uploads.map(normalizeAssetMeta)
    : [];

  const fromArchive = (Array.isArray(archiveRuns) ? archiveRuns : [])
    .filter((item) => String(item?.job_id || "") === String(job.id))
    .flatMap((item) =>
      Array.isArray(item?.generation?.assets) ? item.generation.assets.map(normalizeAssetMeta) : []
    );

  return [...fromReferences, ...fromArchive];
}

export async function buildCaseStudyDraft(jobId, { dbPath } = {}) {
  const job = getJobById(jobId, { dbPath });
  if (!job) return null;

  const [archiveRuns, quotes, audit] = await Promise.all([
    listArchiveRuns(),
    Promise.resolve(listQuotesByJob(jobId, { dbPath })),
    Promise.resolve(
      listAuditLogsForEntity(
        {
          entity_type: "job",
          entity_id: jobId,
          limit: 50,
        },
        { dbPath }
      )
    ),
  ]);

  const latestQuote = pickLatestQuote(quotes);
  const finalAssetMetadata = collectFinalAssetMetadata(job, archiveRuns);
  const publish = getPublishEligibility(job, finalAssetMetadata.length);

  return {
    title: `${job.brand} - ${job.use_case}`.slice(0, 120),
    client_brand_summary: `${job.client_name} (${job.brand}) | Use case: ${job.use_case} | Deadline: ${job.deadline}`,
    challenge: job.notes || "Client required fast-turn creative output with clear production constraints.",
    creative_approach: [
      `Mood/style direction: ${job.mood_style || "not specified"}`,
      summarizeQuote(latestQuote),
      `Pilot mode: ${job.is_pilot ? "yes" : "no"}`,
    ].join(" "),
    execution: summarizeAudit(audit),
    turnaround: summarizeSla(job.sla),
    deliverables: job.deliverables,
    results_notes: summarizeCost(job.generation_cost),
    publish_eligibility: {
      ...publish,
      permissions: {
        is_pilot: Boolean(job.is_pilot),
        case_study_permission: Boolean(job.case_study_permission),
        testimonial_permission: Boolean(job.testimonial_permission),
      },
    },
    quote_snapshot: latestQuote
      ? {
          id: latestQuote.id,
          version: latestQuote.version,
          package_type: latestQuote.package_type,
          price: latestQuote.price,
          scope_summary: latestQuote.scope_summary,
          delivery_timeline: latestQuote.delivery_timeline,
        }
      : null,
    sla_summary: job.sla || null,
    cost_summary: job.generation_cost || null,
    audit_timeline: audit.map((entry) => ({
      action_type: entry.action_type,
      actor: entry.actor,
      created_at: entry.created_at,
      metadata: entry.metadata || {},
    })),
    final_asset_metadata: finalAssetMetadata,
  };
}
