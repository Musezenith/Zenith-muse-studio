import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";
import { migrateGenerationCosts } from "./generationCostMigrations.mjs";

const modelRates = {
  "imagen-3.0-generate-002": 0.05,
  default: 0.04,
};

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

function toStringValue(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Number(num.toFixed(4));
}

function estimateCost({ model, number_of_outputs, rerun_count }) {
  const perOutput = modelRates[model] || modelRates.default;
  const rerunFactor = 1 + Math.max(0, rerun_count) * 0.15;
  return Number((perOutput * Math.max(1, number_of_outputs) * rerunFactor).toFixed(4));
}

function normalizeCostRun(row) {
  const actual = row.actual_cost === null ? null : Number(row.actual_cost);
  const estimated = row.estimated_cost === null ? null : Number(row.estimated_cost);
  return {
    id: row.id,
    job_id: row.job_id || null,
    model: row.model,
    provider: row.provider,
    number_of_outputs: Number(row.number_of_outputs || 0),
    rerun_count: Number(row.rerun_count || 0),
    actual_cost: actual,
    estimated_cost: estimated,
    resolved_cost: actual !== null ? actual : estimated,
    cost_source: actual !== null ? "actual" : "estimated",
    created_at: row.created_at,
  };
}

function summarizeRuns(rows = []) {
  let total = 0;
  let actualTotal = 0;
  let estimatedTotal = 0;
  let actualRuns = 0;
  let estimatedRuns = 0;
  for (const row of rows) {
    const run = normalizeCostRun(row);
    if (run.resolved_cost !== null) total += run.resolved_cost;
    if (run.actual_cost !== null) {
      actualTotal += run.actual_cost;
      actualRuns += 1;
    } else {
      estimatedTotal += run.estimated_cost || 0;
      estimatedRuns += 1;
    }
  }
  return {
    run_count: rows.length,
    actual_runs: actualRuns,
    estimated_runs: estimatedRuns,
    total_cost: Number(total.toFixed(4)),
    actual_cost_total: Number(actualTotal.toFixed(4)),
    estimated_cost_total: Number(estimatedTotal.toFixed(4)),
  };
}

export async function initializeGenerationCostStore({ dbPath } = {}) {
  await migrateGenerationCosts({ dbPath });
}

export function createGenerationCostRun(rawInput, { dbPath } = {}) {
  const model = toStringValue(rawInput?.model, "imagen-3.0-generate-002");
  const provider = toStringValue(rawInput?.provider, "vertex-imagen");
  const numberOfOutputs = Math.max(1, toInt(rawInput?.number_of_outputs, 1));
  const rerunCount = toInt(rawInput?.rerun_count, 0);
  const jobId = toStringValue(rawInput?.job_id, "") || null;
  const actualCost = toNumberOrNull(rawInput?.actual_cost);
  const estimatedCostInput = toNumberOrNull(rawInput?.estimated_cost);
  const estimatedCost =
    estimatedCostInput !== null
      ? estimatedCostInput
      : estimateCost({
          model,
          number_of_outputs: numberOfOutputs,
          rerun_count: rerunCount,
        });

  const db = openDb(dbPath);
  try {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO generation_cost_runs (
        id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
      ) VALUES (
        @id, @job_id, @model, @provider, @number_of_outputs, @rerun_count, @actual_cost, @estimated_cost, @created_at
      )
      `
    ).run({
      id,
      job_id: jobId,
      model,
      provider,
      number_of_outputs: numberOfOutputs,
      rerun_count: rerunCount,
      actual_cost: actualCost,
      estimated_cost: estimatedCost,
      created_at: createdAt,
    });

    const row = db
      .prepare(
        `
        SELECT
          id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
        FROM generation_cost_runs
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(id);
    return normalizeCostRun(row);
  } finally {
    db.close();
  }
}

export function getJobGenerationCostSummary(jobId, { dbPath } = {}) {
  const id = toStringValue(jobId, "");
  if (!id) {
    return summarizeRuns([]);
  }
  const db = openDb(dbPath);
  try {
    const rows = db
      .prepare(
        `
        SELECT
          id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
        FROM generation_cost_runs
        WHERE job_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(id);
    return summarizeRuns(rows);
  } finally {
    db.close();
  }
}

export function getGenerationCostSummary({ dbPath } = {}) {
  const db = openDb(dbPath);
  try {
    const allRows = db
      .prepare(
        `
        SELECT
          id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
        FROM generation_cost_runs
      `
      )
      .all();

    const weeklyRows = db
      .prepare(
        `
        SELECT
          id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
        FROM generation_cost_runs
        WHERE created_at >= datetime('now', '-7 days')
      `
      )
      .all();

    const monthlyRows = db
      .prepare(
        `
        SELECT
          id, job_id, model, provider, number_of_outputs, rerun_count, actual_cost, estimated_cost, created_at
        FROM generation_cost_runs
        WHERE created_at >= datetime('now', '-30 days')
      `
      )
      .all();

    return {
      total: summarizeRuns(allRows),
      weekly: summarizeRuns(weeklyRows),
      monthly: summarizeRuns(monthlyRows),
    };
  } finally {
    db.close();
  }
}
