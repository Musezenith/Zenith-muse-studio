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
  const dbPath = `data/jobs-overview-test-${port}.db`;
  const storageDir = `data/object-assets-jobs-overview-test-${port}`;
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

async function createJob(port, status, suffix) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: `Client ${suffix}`,
      brand: `Brand ${suffix}`,
      contact_info: `ops-${suffix}@example.com`,
      use_case: "Ops dashboard test",
      mood_style: "minimal",
      deliverables: "3 images",
      deadline: futureDate(4),
      references: "",
      notes: "",
      status,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function createQuote(port, jobId, manualPrice = null) {
  const response = await fetch(`http://${HOST}:${port}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      package_type: "starter",
      number_of_final_images: 4,
      number_of_directions: 1,
      revision_rounds: 1,
      deadline_urgency: "standard",
      usage_scope: "internal",
      ...(manualPrice
        ? {
            manual: {
              price: manualPrice,
            },
          }
        : {}),
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return body.item;
}

async function getOverview(port) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/overview?limit=10`);
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const port = 8798;
  const server = await startServer(port);
  try {
    const empty = await getOverview(port);
    assert.equal(empty.status, 200);
    assert.equal(Array.isArray(empty.body.recent), true);
    assert.equal(empty.body.recent.length, 0);
    assert.equal(empty.body.summary["new brief"], 0);

    const j1 = await createJob(port, "new brief", "A");
    await wait(20);
    const j2 = await createJob(port, "in production", "B");
    await wait(20);
    const j3 = await createJob(port, "archived", "C");

    await createQuote(port, j2.id);
    await createQuote(port, j2.id, 2500);

    const overview = await getOverview(port);
    assert.equal(overview.status, 200);
    assert.equal(overview.body.summary["new brief"], 1);
    assert.equal(overview.body.summary["in production"], 1);
    assert.equal(overview.body.summary["archived"], 1);
    assert.equal(overview.body.summary["awaiting feedback"], 0);
    assert.equal(overview.body.recent.length, 3);

    assert.equal(overview.body.recent[0].updated_at >= overview.body.recent[1].updated_at, true);

    const productionRow = overview.body.recent.find((item) => item.id === j2.id);
    assert.ok(productionRow);
    assert.equal(productionRow.quote_count, 2);
    assert.equal(productionRow.latest_quote_version, 2);
    assert.equal(productionRow.status, "in production");

    console.log("Jobs overview endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
