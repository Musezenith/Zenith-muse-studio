import {
  archiveMikageRun,
  compileMikagePrompts,
  createMikageJobPlan,
  createMikageProofSet,
  createMikageJob,
  decideMikageCanonGate,
  executeMikageRunBatch,
  runMikageThreeModes,
  upsertMikageReviewScore,
} from "./mikageWorkflowStore.mjs";

export function createJobController() {
  return {
    async createJob(payload) {
      return createMikageJob(payload);
    },

    async createJobPlan(payload) {
      return createMikageJobPlan(payload);
    },

    async compilePrompts(payload) {
      return compileMikagePrompts(payload);
    },

    async runThreeModes({
      job_id,
      actor = "operator",
      canon_seed,
      batch_size,
      job_plan_id,
    }) {
      return runMikageThreeModes(job_id, {
        actor,
        canon_seed,
        batch_size,
        job_plan_id,
      });
    },

    async runBatch({
      job_id,
      actor = "operator",
      canon_seed,
      batch_size,
      variant_runs = 0,
      rerun_sequences = 0,
    }) {
      return executeMikageRunBatch(job_id, {
        actor,
        canon_seed,
        batch_size,
        variant_runs,
        rerun_sequences,
      });
    },

    async submitReviewScore(runId, payload) {
      return upsertMikageReviewScore(runId, payload);
    },

    async submitCanonDecision(runId, payload) {
      return decideMikageCanonGate(runId, payload);
    },

    async archiveRun(runId, payload) {
      return archiveMikageRun(runId, payload);
    },

    async createProofSet(payload) {
      return createMikageProofSet(payload);
    },
  };
}
