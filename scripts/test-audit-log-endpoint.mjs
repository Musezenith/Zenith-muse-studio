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
  const dbPath = `data/audit-test-${port}.db`;
  const storageDir = `data/object-assets-audit-test-${port}`;
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

async function createJob(port) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Audit Client",
      brand: "Audit Brand",
      contact_info: "audit@example.com",
      use_case: "Audit log flow",
      mood_style: "clean",
      deliverables: "5 images",
      deadline: futureDate(5),
      references: "",
      notes: "",
      reference_uploads: [],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function listAudit(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/audit`);
  const body = await response.json();
  assert.equal(response.status, 200);
  return Array.isArray(body.items) ? body.items : [];
}

async function run() {
  const port = 8799;
  const server = await startServer(port);
  try {
    const job = await createJob(port);

    const afterJobCreate = await listAudit(port, job.id);
    assert.equal(afterJobCreate.length >= 1, true);
    assert.equal(afterJobCreate[0].action_type, "job_created");

    const quoteRes = await fetch(`http://${HOST}:${port}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: job.id,
        package_type: "growth",
        number_of_final_images: 8,
        number_of_directions: 2,
        revision_rounds: 2,
        deadline_urgency: "standard",
        usage_scope: "digital",
      }),
    });
    assert.equal(quoteRes.status, 201);

    const afterQuote = await listAudit(port, job.id);
    assert.equal(afterQuote.some((item) => item.action_type === "quote_changed"), true);

    const statusRes = await fetch(`http://${HOST}:${port}/api/jobs/${job.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in production",
        actor: "qa-user",
      }),
    });
    assert.equal(statusRes.status, 200);

    const finalAudit = await listAudit(port, job.id);
    assert.equal(finalAudit[0].action_type, "status_changed");
    assert.equal(finalAudit[0].actor, "qa-user");
    assert.equal(finalAudit[0].metadata.next_status, "in production");
    assert.equal(finalAudit.some((item) => item.action_type === "job_created"), true);
    assert.equal(finalAudit.some((item) => item.action_type === "quote_changed"), true);
    assert.equal(finalAudit.length >= 3, true);

    const none = await listAudit(port, "missing-job-id");
    assert.equal(Array.isArray(none), true);
    assert.equal(none.length, 0);

    console.log("Audit log endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
