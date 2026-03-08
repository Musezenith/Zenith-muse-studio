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
  const dbPath = `data/proof-pack-test-${port}.db`;
  const storageDir = `data/object-assets-proof-pack-test-${port}`;
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

async function createJob(port, { isPilot = false, caseStudyPermission = false } = {}) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Proof Client",
      brand: isPilot ? "Pilot Proof Brand" : "Proof Brand",
      contact_info: "proof@example.com",
      use_case: "Proof workflow",
      mood_style: "editorial",
      deliverables: "5 hero images",
      deadline: futureDate(5),
      references: "https://example.com/refs",
      notes: "Proof notes",
      is_pilot: isPilot,
      case_study_permission: caseStudyPermission,
      testimonial_permission: false,
      reference_uploads: [
        {
          fileName: "proof-ref.png",
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

async function setStatus(port, jobId, status) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, actor: "operator" }),
  });
  assert.equal(response.status, 200);
}

async function generateTestimonial(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/testimonial/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "operator" }),
  });
  assert.equal(response.status, 200);
}

async function generateProofPack(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "operator" }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getProofPack(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack`);
  const body = await response.json();
  return { status: response.status, body };
}

async function updateProofPack(port, jobId, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/proof-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const port = 8805;
  const server = await startServer(port);
  try {
    const job = await createJob(port);
    const baseGet = await getProofPack(port, job.id);
    assert.equal(baseGet.status, 200);
    assert.equal(baseGet.body.item.eligible, false);
    assert.equal(baseGet.body.item.visibility, "restricted");

    const beforeEligible = await generateProofPack(port, job.id);
    assert.equal(beforeEligible.status, 400);

    await setStatus(port, job.id, "exported");
    await generateTestimonial(port, job.id);
    const generated = await generateProofPack(port, job.id);
    assert.equal(generated.status, 200);
    assert.equal(generated.body.item.eligible, true);
    assert.equal(generated.body.item.visibility, "visible");
    assert.equal(typeof generated.body.item.hero_proof_summary, "string");
    assert.equal(typeof generated.body.item.snippets.landing_page, "string");
    assert.equal(typeof generated.body.item.snippets.sales_deck, "string");
    assert.equal(typeof generated.body.item.snippets.outreach, "string");
    assert.equal(typeof generated.body.item.snippets.social, "string");
    assert.equal(typeof generated.body.item.turnaround_proof, "string");
    assert.equal(typeof generated.body.item.testimonial_snippet, "string");

    const updated = await updateProofPack(port, job.id, {
      hero_proof_summary: "Operator hero proof",
      snippets: {
        landing_page: "LP proof",
        sales_deck: "Deck proof",
        outreach: "Outreach proof",
        social: "Social proof",
      },
      turnaround_proof: "Turnaround proof updated",
      testimonial_snippet: "Testimonial snippet updated",
      status: "approved",
      actor: "operator",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.item.status, "approved");
    assert.equal(updated.body.item.hero_proof_summary, "Operator hero proof");
    assert.equal(updated.body.item.snippets.landing_page, "LP proof");

    const restrictedPilot = await createJob(port, {
      isPilot: true,
      caseStudyPermission: false,
    });
    await setStatus(port, restrictedPilot.id, "exported");
    const restrictedGenerate = await generateProofPack(port, restrictedPilot.id);
    assert.equal(restrictedGenerate.status, 400);
    const restrictedGet = await getProofPack(port, restrictedPilot.id);
    assert.equal(restrictedGet.status, 200);
    assert.equal(restrictedGet.body.item.eligible, false);
    assert.equal(restrictedGet.body.item.permissions.case_study_permission, false);

    console.log("Proof pack endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
