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
  const dbPath = `data/testimonial-test-${port}.db`;
  const storageDir = `data/object-assets-testimonial-test-${port}`;
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

async function createJob(port, { isPilot = false, testimonialPermission = false } = {}) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Testimonial Client",
      brand: isPilot ? "Pilot Testimonial Brand" : "Testimonial Brand",
      contact_info: "testimonial@example.com",
      use_case: "Landing page visuals",
      mood_style: "clean",
      deliverables: "6 images",
      deadline: futureDate(4),
      references: "",
      notes: "",
      is_pilot: isPilot,
      testimonial_permission: testimonialPermission,
      case_study_permission: false,
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

async function generate(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/testimonial/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "operator" }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getTestimonial(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/testimonial`);
  const body = await response.json();
  return { status: response.status, body };
}

async function update(port, jobId, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/testimonial`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const port = 8804;
  const server = await startServer(port);
  try {
    const normalJob = await createJob(port);
    const before = await getTestimonial(port, normalJob.id);
    assert.equal(before.status, 200);
    assert.equal(before.body.item.eligible, false);
    assert.equal(before.body.item.visibility, "restricted");

    const preEligibleGenerate = await generate(port, normalJob.id);
    assert.equal(preEligibleGenerate.status, 400);

    await setStatus(port, normalJob.id, "exported");
    const generated = await generate(port, normalJob.id);
    assert.equal(generated.status, 200);
    assert.equal(generated.body.item.eligible, true);
    assert.equal(generated.body.item.visibility, "visible");
    assert.equal(typeof generated.body.item.prompt, "string");
    assert.equal(generated.body.item.prompt.length > 10, true);
    assert.equal(typeof generated.body.item.draft, "string");
    assert.equal(generated.body.item.status, "draft");

    const updated = await update(port, normalJob.id, {
      draft: "Operator-edited testimonial copy.",
      status: "approved",
      actor: "operator",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.item.status, "approved");
    assert.equal(updated.body.item.draft, "Operator-edited testimonial copy.");

    const pilotJob = await createJob(port, { isPilot: true, testimonialPermission: false });
    await setStatus(port, pilotJob.id, "exported");
    const restrictedGenerate = await generate(port, pilotJob.id);
    assert.equal(restrictedGenerate.status, 400);
    const restrictedGet = await getTestimonial(port, pilotJob.id);
    assert.equal(restrictedGet.status, 200);
    assert.equal(restrictedGet.body.item.eligible, false);
    assert.equal(restrictedGet.body.item.permissions.testimonial_permission, false);

    console.log("Testimonial endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
