import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 9000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: "GET" });
      return;
    } catch (_) {
      await wait(120);
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function futureDate(days = 2) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function startServer(port) {
  const dbPath = `data/case-study-test-${port}.db`;
  const storageDir = `data/object-assets-case-study-test-${port}`;
  await rm(path.resolve(process.cwd(), dbPath), { force: true });
  await rm(path.resolve(process.cwd(), storageDir), { recursive: true, force: true });

  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DOCUMENTS_DB_PATH: dbPath,
      STORAGE_PROVIDER: "filesystem",
      STORAGE_LOCAL_DIR: storageDir,
      MOCK_IMAGEN: "1",
    },
    stdio: "pipe",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitForServer(`http://${HOST}:${port}/api/jobs/overview`);
  return { child, dbPath, storageDir };
}

async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill("SIGTERM");
  await new Promise((resolve) => {
    server.child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  await rm(path.resolve(process.cwd(), server.dbPath), { force: true });
  await rm(path.resolve(process.cwd(), server.storageDir), { recursive: true, force: true });
}

async function createJob(port, { pilot = false, caseStudyPermission = false } = {}) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Case Study Client",
      brand: pilot ? "Pilot Brand" : "Core Brand",
      contact_info: "case-study@example.com",
      use_case: "Launch campaign",
      mood_style: "clean editorial",
      deliverables: "8 final images",
      deadline: futureDate(5),
      references: "https://example.com/reference-board",
      notes: "Need social + ecommerce angle",
      is_pilot: pilot,
      case_study_permission: caseStudyPermission,
      testimonial_permission: false,
      reference_uploads: [
        {
          fileName: "ref.png",
          mimeType: "image/png",
          dataUri:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+L7sQAAAAASUVORK5CYII=",
        },
      ],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function createQuote(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      package_type: "growth",
      number_of_final_images: 8,
      number_of_directions: 2,
      revision_rounds: 2,
      deadline_urgency: "standard",
      usage_scope: "digital",
    }),
  });
  assert.equal(response.status, 201);
}

async function setStatus(port, jobId, status) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, actor: "operator" }),
  });
  assert.equal(response.status, 200);
}

async function addCostRun(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/generation-cost-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      model: "imagen-3.0-generate-002",
      provider: "vertex-imagen",
      number_of_outputs: 4,
      rerun_count: 1,
    }),
  });
  assert.equal(response.status, 201);
}

async function getCaseStudyDraft(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/case-study/draft`);
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const port = 8803;
  const server = await startServer(port);
  try {
    const eligibleJob = await createJob(port, { pilot: false, caseStudyPermission: false });
    await createQuote(port, eligibleJob.id);
    await addCostRun(port, eligibleJob.id);
    await setStatus(port, eligibleJob.id, "exported");

    const eligibleDraftRes = await getCaseStudyDraft(port, eligibleJob.id);
    assert.equal(eligibleDraftRes.status, 200);
    const eligibleDraft = eligibleDraftRes.body.item;
    assert.equal(typeof eligibleDraft.title, "string");
    assert.equal(typeof eligibleDraft.client_brand_summary, "string");
    assert.equal(typeof eligibleDraft.challenge, "string");
    assert.equal(typeof eligibleDraft.creative_approach, "string");
    assert.equal(typeof eligibleDraft.execution, "string");
    assert.equal(typeof eligibleDraft.turnaround, "string");
    assert.equal(typeof eligibleDraft.deliverables, "string");
    assert.equal(typeof eligibleDraft.results_notes, "string");
    assert.equal(eligibleDraft.publish_eligibility.eligible, true);
    assert.equal(Array.isArray(eligibleDraft.final_asset_metadata), true);
    assert.equal(eligibleDraft.final_asset_metadata.length > 0, true);
    assert.equal(eligibleDraft.quote_snapshot.version >= 1, true);

    const pilotNoPermission = await createJob(port, { pilot: true, caseStudyPermission: false });
    await createQuote(port, pilotNoPermission.id);
    await setStatus(port, pilotNoPermission.id, "exported");
    const notEligibleRes = await getCaseStudyDraft(port, pilotNoPermission.id);
    assert.equal(notEligibleRes.status, 200);
    assert.equal(notEligibleRes.body.item.publish_eligibility.eligible, false);
    assert.equal(
      notEligibleRes.body.item.publish_eligibility.reasons.includes(
        "case study permission is not granted"
      ),
      true
    );

    const missingRes = await getCaseStudyDraft(port, "missing-job");
    assert.equal(missingRes.status, 404);

    console.log("Case study endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
