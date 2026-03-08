import { AUDIT_ACTIONS, appendAuditLog } from "./auditStore.mjs";
import { createGenerationCostRun } from "./generationCostStore.mjs";
import { updateJobSlaMilestones } from "./jobsStore.mjs";

export function applyGenerationResultSideEffects({ payload, result }, { dbPath } = {}) {
  const jobId = typeof payload?.job_id === "string" ? payload.job_id.trim() : "";
  if (!jobId) return;
  try {
    appendAuditLog(
      {
        entity_type: "job",
        entity_id: jobId,
        action_type:
          Number(payload?.generation?.rerun_count || 0) > 0
            ? AUDIT_ACTIONS.RERUN_TRIGGERED
            : AUDIT_ACTIONS.PROMPT_GENERATED,
        actor: "system",
        metadata: {
          model: payload?.generation?.model || result?.model || "imagen-3.0-generate-002",
          variants: Number(payload?.generation?.variants || 1),
        },
      },
      { dbPath }
    );
    const costRun = createGenerationCostRun(
      {
        job_id: jobId,
        provider: result?.provider || result?.meta?.provider || "unknown",
        model: result?.model || payload?.generation?.model || "imagen-3.0-generate-002",
        number_of_outputs: Array.isArray(result?.assets)
          ? result.assets.length
          : Array.isArray(result?.images)
          ? result.images.length
          : Number(payload?.generation?.variants || 1),
        rerun_count: Number(payload?.generation?.rerun_count || 0),
      },
      { dbPath }
    );
    updateJobSlaMilestones(
      jobId,
      {
        first_output_at: costRun?.created_at || new Date().toISOString(),
        actor: "system",
        audit_action_type: AUDIT_ACTIONS.FIRST_OUTPUT_CREATED,
      },
      { dbPath }
    );
  } catch (_) {
    // non-blocking side effects
  }
}
