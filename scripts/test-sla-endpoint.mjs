import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function startServer(port) {
  const dbPath = `data/sla-test-${port}.db`;
  const storageDir = `data/object-assets-sla-test-${port}`;
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

async function createJob(port, suffix) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: `SLA Client ${suffix}`,
      brand: `SLA Brand ${suffix}`,
      contact_info: `sla-${suffix}@example.com`,
      use_case: "SLA endpoint test",
      mood_style: "clean",
      deliverables: "4 images",
      deadline: futureDate(4),
      references: "",
      notes: "",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function updateSla(port, jobId, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/sla`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getJob(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  return body.item;
}

async function getOverview(port) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/overview`);
  const body = await response.json();
  assert.equal(response.status, 200);
  return body;
}

async function run() {
  const port = 8802;
  const server = await startServer(port);
  try {
    const jobA = await createJob(port, "A");
    const jobB = await createJob(port, "B");
    const jobC = await createJob(port, "C");

    const before = await getJob(port, jobA.id);
    assert.equal(typeof before.sla, "object");
    assert.equal(before.sla.status === "on-time" || before.sla.status === "at-risk", true);
    assert.equal(typeof before.sla.policy_snapshot, "object");
    assert.equal(typeof before.sla.policy_snapshot.version, "string");

    const overdueRes = await updateSla(port, jobA.id, {
      first_output_at: hoursFromNow(26),
    });
    assert.equal(overdueRes.status, 200);
    assert.equal(overdueRes.body.item.sla.status, "overdue");

    const onTimeRes = await updateSla(port, jobB.id, {
      first_output_at: hoursAgo(2),
      feedback_received_at: hoursAgo(5),
      final_delivered_at: hoursAgo(1),
    });
    assert.equal(onTimeRes.status, 200);
    assert.equal(onTimeRes.body.item.sla.status, "on-time");

    const atRiskRes = await updateSla(port, jobC.id, {
      first_output_at: hoursAgo(1),
      feedback_received_at: hoursAgo(40),
    });
    assert.equal(atRiskRes.status, 200);
    assert.equal(atRiskRes.body.item.sla.status, "at-risk");

    const breachRes = await updateSla(port, jobA.id, {
      breach_reason_code: "client-delay",
      breach_note: "Waiting on feedback bundle",
    });
    assert.equal(breachRes.status, 200);
    assert.equal(breachRes.body.item.sla.breach_reason_code, "client-delay");
    assert.equal(breachRes.body.item.sla.breach_note, "Waiting on feedback bundle");

    const badRes = await updateSla(port, jobC.id, {
      first_output_at: "not-a-date",
    });
    assert.equal(badRes.status, 400);

    const db = new DatabaseSync(path.resolve(process.cwd(), server.dbPath));
    db.prepare(
      `
      UPDATE jobs
      SET sla_policy_snapshot_json = NULL, sla_first_output_status = NULL, sla_final_status = NULL
      WHERE id = ?
    `
    ).run(jobC.id);
    db.close();

    const forbiddenRecompute = await fetch(
      `http://${HOST}:${port}/api/jobs/${jobC.id}/sla/recompute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "admin-user" }),
      }
    );
    assert.equal(forbiddenRecompute.status, 403);

    const recomputeRes = await fetch(
      `http://${HOST}:${port}/api/jobs/${jobC.id}/sla/recompute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin: true, actor: "admin-user" }),
      }
    );
    const recomputeBody = await recomputeRes.json();
    assert.equal(recomputeRes.status, 200);
    assert.equal(typeof recomputeBody.item.sla.policy_snapshot, "object");
    assert.equal(typeof recomputeBody.item.sla_first_output_status, "string");

    const overview = await getOverview(port);
    const rowA = overview.recent.find((item) => item.id === jobA.id);
    const rowB = overview.recent.find((item) => item.id === jobB.id);
    const rowC = overview.recent.find((item) => item.id === jobC.id);
    assert.equal(rowA.sla.status, "overdue");
    assert.equal(rowB.sla.status, "on-time");
    assert.equal(rowC.sla.status, "at-risk");

    console.log("SLA endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
