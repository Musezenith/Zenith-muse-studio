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
  const dbPath = `data/pilot-test-${port}.db`;
  const storageDir = `data/object-assets-pilot-test-${port}`;
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
    childExit(server.child, resolve);
  });
  await rm(path.resolve(process.cwd(), server.dbPath), { force: true });
  await rm(path.resolve(process.cwd(), server.storageDir), { recursive: true, force: true });
}

function childExit(child, resolve) {
  child.once("exit", () => resolve());
  setTimeout(resolve, 1000);
}

async function createJob(port, { is_pilot = false, case_study_permission = false, testimonial_permission = false } = {}) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Pilot Client",
      brand: is_pilot ? "Pilot Brand" : "Standard Brand",
      contact_info: "pilot@example.com",
      use_case: "pilot mode test",
      mood_style: "clean",
      deliverables: "4 images",
      deadline: futureDate(5),
      references: "",
      notes: "",
      is_pilot,
      case_study_permission,
      testimonial_permission,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function createQuote(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function run() {
  const port = 8800;
  const server = await startServer(port);
  try {
    const pilotJob = await createJob(port, {
      is_pilot: true,
      case_study_permission: true,
      testimonial_permission: false,
    });
    assert.equal(pilotJob.is_pilot, true);
    assert.equal(pilotJob.case_study_permission, true);
    assert.equal(pilotJob.testimonial_permission, false);

    const jobDetailRes = await fetch(`http://${HOST}:${port}/api/jobs/${pilotJob.id}`);
    const jobDetailBody = await jobDetailRes.json();
    assert.equal(jobDetailRes.status, 200);
    assert.equal(jobDetailBody.item.is_pilot, true);
    assert.equal(jobDetailBody.item.case_study_permission, true);

    const pilotQuote = await createQuote(port, {
      job_id: pilotJob.id,
      package_type: "growth",
      number_of_final_images: 8,
      number_of_directions: 2,
      revision_rounds: 3,
      deadline_urgency: "standard",
      usage_scope: "digital",
    });
    assert.equal(pilotQuote.is_pilot, true);
    assert.equal(pilotQuote.revision_limit <= 1, true);

    const standardJob = await createJob(port, { is_pilot: false });
    const standardQuote = await createQuote(port, {
      job_id: standardJob.id,
      package_type: "growth",
      number_of_final_images: 8,
      number_of_directions: 2,
      revision_rounds: 3,
      deadline_urgency: "standard",
      usage_scope: "digital",
    });
    assert.equal(standardQuote.is_pilot, false);
    assert.equal(standardQuote.revision_limit, 3);
    assert.equal(pilotQuote.price < standardQuote.price, true);

    const manualPilotOverride = await createQuote(port, {
      job_id: standardJob.id,
      package_type: "starter",
      number_of_final_images: 4,
      number_of_directions: 1,
      revision_rounds: 2,
      deadline_urgency: "standard",
      usage_scope: "internal",
      is_pilot: true,
    });
    assert.equal(manualPilotOverride.is_pilot, true);
    assert.equal(manualPilotOverride.revision_limit <= 1, true);

    console.log("Pilot mode endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
