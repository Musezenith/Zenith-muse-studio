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
      await wait(100);
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function futureDate(days = 3) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function startServer(port) {
  const dbPath = `data/quotes-test-${port}.db`;
  const storageDir = `data/object-assets-quotes-test-${port}`;
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

  await waitForServer(`http://${HOST}:${port}/api/documents`);
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
      client_name: "Quote Client",
      brand: "Quote Brand",
      contact_info: "quote@example.com",
      use_case: "Quote workflow test",
      mood_style: "neutral",
      deliverables: "image pack",
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

async function postQuote(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getQuotesByJob(port, jobId) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${jobId}/quotes`);
  const body = await response.json();
  return { status: response.status, body };
}

async function getQuote(port, quoteId) {
  const response = await fetch(`http://${HOST}:${port}/api/quotes/${quoteId}`);
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const port = 8797;
  const server = await startServer(port);
  try {
    const job = await createJob(port);
    const basePayload = {
      job_id: job.id,
      package_type: "starter",
      number_of_final_images: 6,
      number_of_directions: 2,
      revision_rounds: 2,
      deadline_urgency: "rush",
      usage_scope: "digital",
      status: "draft",
    };

    const first = await postQuote(port, basePayload);
    assert.equal(first.status, 201);
    assert.equal(first.body.item.version, 1);
    assert.equal(first.body.item.job_id, job.id);

    const second = await postQuote(port, {
      ...basePayload,
      manual: {
        price: 4321,
        scope_summary: "Manual override summary",
        delivery_timeline: "5 business days",
        assumptions: "Manual assumptions",
        revision_limit: 4,
        is_pilot: false,
      },
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.item.version, 2);
    assert.equal(second.body.item.price, 4321);
    assert.equal(second.body.item.scope_summary, "Manual override summary");
    assert.equal(second.body.item.delivery_timeline, "5 business days");
    assert.equal(second.body.item.revision_limit, 4);

    const byJob = await getQuotesByJob(port, job.id);
    assert.equal(byJob.status, 200);
    assert.equal(Array.isArray(byJob.body.items), true);
    assert.equal(byJob.body.items.length, 2);
    assert.equal(byJob.body.items[0].version, 2);
    assert.equal(byJob.body.items[1].version, 1);

    const detail = await getQuote(port, second.body.item.id);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.item.id, second.body.item.id);
    assert.equal(detail.body.item.job_id, job.id);

    console.log("Quotes endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
