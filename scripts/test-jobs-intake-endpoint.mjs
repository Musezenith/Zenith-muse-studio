import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZxXcAAAAASUVORK5CYII=";

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

function makeDate(daysFromNow = 2) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

async function startServer(port) {
  const dbPath = `data/jobs-test-${port}.db`;
  const storageDir = `data/object-assets-jobs-test-${port}`;
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

async function postJob(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getJob(port, id) {
  const response = await fetch(`http://${HOST}:${port}/api/jobs/${id}`);
  const body = await response.json();
  return { status: response.status, body };
}

function validPayload() {
  return {
    client_name: "Acme Fashion",
    brand: "Acme Atelier",
    contact_info: "ops@acme.example",
    use_case: "Launch lookbook assets for spring campaign.",
    mood_style: "Minimal editorial, monochrome, textured lighting.",
    deliverables: "6 hero images, 12 product crops, social resized pack.",
    deadline: makeDate(3),
    references: "https://example.com/moodboard",
    notes: "Prioritize variant consistency.",
    reference_uploads: [
      {
        fileName: "reference-1.png",
        mimeType: "image/png",
        dataUri: ONE_PIXEL_PNG,
      },
    ],
  };
}

async function testSuccessfulSubmission(port) {
  const { status, body } = await postJob(port, validPayload());
  assert.equal(status, 201);
  assert.equal(typeof body.item.id, "string");
  assert.equal(body.item.brand, "Acme Atelier");
  assert.equal(body.item.status, "new brief");
  assert.equal(Array.isArray(body.item.references.links), true);
  assert.equal(body.item.references.links.length, 1);
  assert.equal(Array.isArray(body.item.references.uploads), true);
  assert.equal(body.item.references.uploads.length, 1);

  const uploaded = body.item.references.uploads[0];
  assert.equal(uploaded.kind, "image");
  assert.equal(typeof uploaded.url === "string" || typeof uploaded.dataUri === "string", true);

  if (uploaded.url) {
    const assetResponse = await fetch(`http://${HOST}:${port}${uploaded.url}`);
    assert.equal(assetResponse.status, 200);
  }

  const detail = await getJob(port, body.item.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.item.id, body.item.id);
  assert.equal(detail.body.item.references.uploads.length, 1);
}

async function testValidationFailure(port) {
  const { status, body } = await postJob(port, {
    client_name: "",
    brand: "",
    contact_info: "",
    use_case: "",
    deliverables: "",
    deadline: "1999-01-01",
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(typeof body.error.details?.errors, "object");
  assert.equal(typeof body.error.details.errors.client_name, "string");
  assert.equal(typeof body.error.details.errors.deadline, "string");
}

async function run() {
  const port = 8796;
  const server = await startServer(port);
  try {
    await testSuccessfulSubmission(port);
    await testValidationFailure(port);
    console.log("Jobs intake endpoint tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
