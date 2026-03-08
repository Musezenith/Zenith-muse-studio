import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm, access } from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePayload() {
  return {
    schemaVersion: "2026-03-08",
    prompt: {
      brief: "editorial look",
      preset: "Dior Chiaroscuro",
      rationale: "test",
      positivePrompt: "fashion editorial portrait",
      negativePrompt: "watermark, logo",
      params: {
        cfg: 6,
        steps: 28,
        aspectRatio: "3:4",
      },
      qcChecklist: ["clean"],
    },
    quality: { overall: 90 },
    generation: {
      provider: "vertex-imagen",
      model: "imagen-3.0-generate-002",
      variants: 2,
      seedPolicy: "locked",
      seeds: [123, 124],
      aspectRatio: "3:4",
      cfg: 6,
      steps: 28,
    },
    createdAt: new Date().toISOString(),
  };
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: "OPTIONS" });
      return;
    } catch (error) {
      await wait(120);
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function storageDirForPort(port) {
  return `data/object-assets-test-${port}`;
}

async function startServer(port, envOverrides = {}) {
  const storageDir = storageDirForPort(port);
  await rm(path.resolve(process.cwd(), storageDir), { recursive: true, force: true });

  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      MOCK_IMAGEN: "1",
      STORAGE_PROVIDER: "filesystem",
      STORAGE_LOCAL_DIR: storageDir,
      ...envOverrides,
    },
    stdio: "pipe",
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  await waitForServer(`http://${HOST}:${port}/api/vertex/imagen/generate`);
  return { child, storageDir };
}

async function stopServer(child, storageDir) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  if (storageDir) {
    await rm(path.resolve(process.cwd(), storageDir), { recursive: true, force: true });
  }
}

async function postGenerate(port, payload) {
  const response = await fetch(`http://${HOST}:${port}/api/vertex/imagen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function postArchiveRun(port, body) {
  const response = await fetch(`http://${HOST}:${port}/api/archive/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function putArchiveRun(port, id, body) {
  const response = await fetch(`http://${HOST}:${port}/api/archive/runs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function deleteArchiveRun(port, id) {
  const response = await fetch(`http://${HOST}:${port}/api/archive/runs/${id}`, {
    method: "DELETE",
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function getArchiveRuns(port) {
  const response = await fetch(`http://${HOST}:${port}/api/archive/runs`);
  const json = await response.json();
  return { status: response.status, body: json };
}

function makeArchiveEntry(id, generationResponse) {
  return {
    id,
    type: "prompt-lab-run",
    createdAt: new Date().toISOString(),
    runState: "success",
    payload: makePayload(),
    generation: generationResponse,
    generationError: null,
  };
}

function getAssetPathFromUrl(url, storageDir) {
  const key = url.split("/").pop();
  return path.resolve(process.cwd(), storageDir, key);
}

async function testSuccessContract() {
  const port = 8791;
  const server = await startServer(port);
  try {
    const { status, body } = await postGenerate(port, makePayload());
    assert.equal(status, 200);
    assert.equal(typeof body.requestId, "string");
    assert.equal(typeof body.model, "string");
    assert.ok(Array.isArray(body.assets));
    assert.equal(body.assets.length, 2);
    assert.equal(typeof body.assets[0].id, "string");
    assert.equal(body.assets[0].kind, "image");
    assert.equal(typeof body.assets[0].storage, "object");
    assert.equal(body.assets[0].storage.provider, "filesystem");
    assert.equal(typeof body.assets[0].storage.key, "string");
    assert.ok(body.assets[0].url || body.assets[0].base64 || body.assets[0].dataUri);
    assert.equal(typeof body.assets[0].createdAt, "string");
    assert.equal(typeof body.assets[0].status, "string");
    assert.ok(typeof body.assets[0].size === "number" || body.assets[0].size === null);
    assert.ok(Array.isArray(body.images));
    assert.equal(body.images.length, 2);
    assert.equal(typeof body.images[0].id, "string");
    assert.ok(body.images[0].url);
    assert.equal(typeof body.latencyMs, "number");

    const firstAssetUrl = body.assets[0].url;
    const assetResponse = await fetch(`http://${HOST}:${port}${firstAssetUrl}`);
    assert.equal(assetResponse.status, 200);
    assert.ok((assetResponse.headers.get("content-type") || "").includes("image"));
  } finally {
    await stopServer(server.child, server.storageDir);
  }
}

async function testValidationErrorContract() {
  const port = 8792;
  const server = await startServer(port);
  try {
    const { status, body } = await postGenerate(port, { invalid: true });
    assert.equal(status, 400);
    assert.equal(typeof body.requestId, "string");
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(typeof body.error.message, "string");
  } finally {
    await stopServer(server.child, server.storageDir);
  }
}

async function testTimeoutContract() {
  const port = 8793;
  const server = await startServer(port, {
    MOCK_IMAGEN_DELAY_MS: "1500",
    VERTEX_TIMEOUT_MS: "50",
  });
  try {
    const { status, body } = await postGenerate(port, makePayload());
    assert.equal(status, 504);
    assert.equal(typeof body.requestId, "string");
    assert.equal(body.error.code, "TIMEOUT");
  } finally {
    await stopServer(server.child, server.storageDir);
  }
}

async function testMissingFileFallbackAndCleanup() {
  const port = 8794;
  const server = await startServer(port);
  try {
    const runResponse = await postGenerate(port, makePayload());
    assert.equal(runResponse.status, 200);
    const firstAsset = runResponse.body.assets[0];
    const firstAssetPath = getAssetPathFromUrl(firstAsset.url, server.storageDir);

    const saveRes = await postArchiveRun(
      port,
      makeArchiveEntry("archive-missing-fallback", runResponse.body)
    );
    assert.equal(saveRes.status, 201);

    await rm(firstAssetPath, { force: true });

    const listRes = await getArchiveRuns(port);
    assert.equal(listRes.status, 200);
    const saved = (listRes.body.items || []).find((item) => item.id === "archive-missing-fallback");
    assert.ok(saved);
    const savedAsset = saved.generation.assets[0];
    assert.equal(savedAsset.storage.mode, "remote");
    assert.equal(savedAsset.storage.missing, true);
    assert.equal(savedAsset.status, "fallback-inline");
    assert.equal(savedAsset.url, null);
    assert.ok(savedAsset.base64 || savedAsset.dataUri);

    const generateForCleanup = await postGenerate(port, makePayload());
    assert.equal(generateForCleanup.status, 200);
    const cleanupAsset = generateForCleanup.body.assets[0];
    const cleanupAssetPath = getAssetPathFromUrl(cleanupAsset.url, server.storageDir);
    await access(cleanupAssetPath);

    const saveCleanup = await postArchiveRun(
      port,
      makeArchiveEntry("archive-cleanup", generateForCleanup.body)
    );
    assert.equal(saveCleanup.status, 201);

    const updateRes = await putArchiveRun(port, "archive-cleanup", {
      ...makeArchiveEntry("archive-cleanup", generateForCleanup.body),
      generation: {
        ...generateForCleanup.body,
        assets: [],
        images: [],
      },
    });
    assert.equal(updateRes.status, 200);

    let removedByUpdate = false;
    try {
      await access(cleanupAssetPath);
    } catch (error) {
      removedByUpdate = true;
    }
    assert.equal(removedByUpdate, true);

    const generateForDelete = await postGenerate(port, makePayload());
    assert.equal(generateForDelete.status, 200);
    const deleteAssetPath = getAssetPathFromUrl(
      generateForDelete.body.assets[0].url,
      server.storageDir
    );
    await postArchiveRun(port, makeArchiveEntry("archive-delete", generateForDelete.body));
    await access(deleteAssetPath);

    const deleteRes = await deleteArchiveRun(port, "archive-delete");
    assert.equal(deleteRes.status, 200);
    let removedByDelete = false;
    try {
      await access(deleteAssetPath);
    } catch (error) {
      removedByDelete = true;
    }
    assert.equal(removedByDelete, true);

    const missingAssetResponse = await fetch(
      `http://${HOST}:${port}/api/assets/../../etc/passwd`
    );
    assert.equal(missingAssetResponse.status, 404);
  } finally {
    await stopServer(server.child, server.storageDir);
  }
}

async function run() {
  await testSuccessContract();
  await testValidationErrorContract();
  await testTimeoutContract();
  await testMissingFileFallbackAndCleanup();
  console.log("Integration tests passed: /api/vertex/imagen/generate");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
