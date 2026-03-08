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
  const dbPath = `data/cost-test-${port}.db`;
  const storageDir = `data/object-assets-cost-test-${port}`;
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
      client_name: `Cost Client ${suffix}`,
      brand: `Cost Brand ${suffix}`,
      contact_info: `cost-${suffix}@example.com`,
      use_case: "cost tracking",
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

async function createCostRun(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/generation-cost-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
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
  const port = 8801;
  const server = await startServer(port);
  try {
    const job = await createJob(port, "A");
    const jobWithoutCost = await createJob(port, "B");

    const estimatedRun = await createCostRun(port, {
      job_id: job.id,
      model: "imagen-3.0-generate-002",
      provider: "vertex-imagen",
      number_of_outputs: 3,
      rerun_count: 1,
    });
    assert.equal(estimatedRun.actual_cost, null);
    assert.equal(estimatedRun.cost_source, "estimated");
    assert.equal(estimatedRun.estimated_cost > 0, true);

    const actualRun = await createCostRun(port, {
      job_id: job.id,
      model: "imagen-3.0-generate-002",
      provider: "vertex-imagen",
      number_of_outputs: 2,
      rerun_count: 0,
      actual_cost: 0.77,
    });
    assert.equal(actualRun.actual_cost, 0.77);
    assert.equal(actualRun.cost_source, "actual");

    const withCost = await getJob(port, job.id);
    assert.equal(withCost.generation_cost.run_count, 2);
    assert.equal(withCost.generation_cost.actual_runs, 1);
    assert.equal(withCost.generation_cost.estimated_runs, 1);
    assert.equal(withCost.generation_cost.total_cost > 0.77, true);

    const noCost = await getJob(port, jobWithoutCost.id);
    assert.equal(noCost.generation_cost.run_count, 0);
    assert.equal(noCost.generation_cost.total_cost, 0);

    const overview = await getOverview(port);
    const recentRow = overview.recent.find((row) => row.id === job.id);
    assert.ok(recentRow);
    assert.equal(recentRow.generation_cost_total > 0.77, true);
    assert.equal(overview.generation_cost_summary.total.run_count >= 2, true);
    assert.equal(overview.generation_cost_summary.total.actual_runs >= 1, true);
    assert.equal(overview.generation_cost_summary.total.estimated_runs >= 1, true);

    console.log("Generation cost endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
