async function readJson(response) {
  return response.json().catch(() => ({}));
}

function toError(body, fallback) {
  const error = new Error(body?.error?.message || fallback);
  error.details = body?.error?.details || null;
  return error;
}

export async function getMikageOverview() {
  const response = await fetch("/api/mikage/overview");
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage overview.");
  return body;
}

export async function getMikageControlRoom(params = {}) {
  const query = new URLSearchParams();
  if (params?.project_id) query.set("project_id", String(params.project_id));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/control-room${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load control room.");
  return body.item || null;
}

export async function listMikageJobs() {
  const response = await fetch("/api/mikage/jobs");
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage jobs.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function createMikageJob(payload) {
  const response = await fetch("/api/mikage/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create Mikage job.");
  return body.item;
}

export async function compileMikagePackageAndRun(payload) {
  const response = await fetch("/api/mikage/compile-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to compile and run Mikage package.");
  return body;
}

export async function listMikageRuns(params = {}) {
  const query = new URLSearchParams();
  if (params?.job_id) query.set("job_id", String(params.job_id));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/runs${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage runs queue.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function listMikageJobPlans(params = {}) {
  const query = new URLSearchParams();
  if (params?.project_id) query.set("project_id", String(params.project_id));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/job-plans${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage job plans.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function createMikageJobPlan(payload) {
  const response = await fetch("/api/mikage/job-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create Mikage job plan.");
  return body.item;
}

export async function compileMikagePrompts(payload) {
  const response = await fetch("/api/mikage/compiled-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to compile Mikage prompts.");
  return body.item;
}

export async function listMikageCompiledPrompts(params = {}) {
  const query = new URLSearchParams();
  if (params?.job_plan_id) query.set("job_plan_id", String(params.job_plan_id));
  if (params?.run_id) query.set("run_id", String(params.run_id));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/compiled-prompts${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load compiled prompts.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function runMikageThreeModes(payload) {
  const response = await fetch("/api/mikage/run-three-modes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to run Mikage three modes.");
  return body.item;
}

export async function runMikageBatch(jobId, payload = {}) {
  const response = await fetch(`/api/mikage/jobs/${encodeURIComponent(jobId)}/run-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to run job batch.");
  return body.item;
}

export async function listMikageRunsByJob(jobId) {
  const response = await fetch(`/api/mikage/jobs/${encodeURIComponent(jobId)}/runs`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage runs.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function getMikageRun(runId) {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}`);
  if (response.status === 404) return null;
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load Mikage run.");
  return body.item || null;
}

export async function rerunMikageMode(runId, mode, actor = "operator") {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/rerun-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, actor }),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to rerun mode.");
  return body.item;
}

export async function rerunMikagePipeline(runId, actor = "operator") {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/rerun-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor }),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to rerun pipeline.");
  return body.item;
}

export async function updateMikageReview(runId, payload) {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/review`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to update review.");
  return body.item;
}

export async function updateMikageReviewScore(runId, payload) {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/review-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to update review score.");
  return body.item;
}

export async function decideMikageCanonGate(runId, payload) {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/canon-gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to submit canon gate decision.");
  return body.item;
}

export async function archiveMikageRun(runId, payload) {
  const response = await fetch(`/api/mikage/runs/${encodeURIComponent(runId)}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to archive run.");
  return body.item;
}

export async function listMikageArchive(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "all") continue;
    query.set(key, trimmed);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/archive${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load archive assets.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function listMikageCanonAssets(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const next = String(value).trim();
    if (!next || next === "all") continue;
    query.set(key, next);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/canon-assets${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load canon assets.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function updateMikageCanonAsset(assetId, payload = {}) {
  const response = await fetch(`/api/mikage/canon-assets/${encodeURIComponent(assetId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to update canon asset.");
  return body.item;
}

export async function listMikageReferences(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") continue;
    const next = value.trim();
    if (!next || next === "all") continue;
    query.set(key, next);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/mikage/references${suffix}`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load references.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function upsertMikageReference(payload = {}) {
  const response = await fetch("/api/mikage/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to save reference.");
  return body.item;
}

export async function createMikagePresetFromReference(referenceId, payload = {}) {
  const response = await fetch(`/api/mikage/references/${encodeURIComponent(referenceId)}/preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create preset from reference.");
  return body.item;
}

export async function createMikageReferenceStyle(payload = {}) {
  const response = await fetch("/api/mikage/reference-styles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to save reference style.");
  return body.item;
}

export async function addMikageReferenceStyleBlocks(styleId, payload = {}) {
  const response = await fetch(`/api/mikage/reference-styles/${encodeURIComponent(styleId)}/blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to add reference blocks.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function getMikageReferenceStyle(styleId) {
  const response = await fetch(`/api/mikage/reference-styles/${encodeURIComponent(styleId)}`);
  if (response.status === 404) return null;
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load reference style.");
  return body.item || null;
}

export async function listMikagePresets() {
  const response = await fetch("/api/mikage/presets");
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load presets.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function createMikagePresetFromStyle(payload = {}) {
  const response = await fetch("/api/mikage/presets/from-reference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create preset from reference style.");
  return body.item;
}

export async function compileMikagePrompt(payload = {}) {
  const response = await fetch("/api/mikage/compile-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to compile prompt.");
  return body.item;
}

export async function listMikageProofSets() {
  const response = await fetch("/api/mikage/proof-sets");
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load proof sets.");
  return Array.isArray(body.items) ? body.items : [];
}

export async function createMikageProofSet(payload) {
  const response = await fetch("/api/mikage/proof-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create proof set.");
  return body.item;
}
