import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePayload() {
  return {
    schemaVersion: "2026-03-08",
    prompt: {
      brief: "operator provider smoke test",
      preset: "Dior Chiaroscuro",
      rationale: "provider validation",
      positivePrompt: "high-end fashion editorial portrait, studio lighting",
      negativePrompt: "watermark, logo, text",
      params: {
        cfg: 6,
        steps: 28,
        aspectRatio: "1:1",
      },
      qcChecklist: ["clean output"],
    },
    quality: { overall: 90 },
    generation: {
      provider: "openai",
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      variants: 1,
      seedPolicy: "locked",
      aspectRatio: "1:1",
      cfg: 6,
      steps: 28,
    },
    createdAt: new Date().toISOString(),
  };
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: "OPTIONS" });
      return;
    } catch (_) {
      await wait(150);
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function startServer(port) {
  const storageDir = `data/object-assets-openai-test-${port}`;
  await rm(path.resolve(process.cwd(), storageDir), { recursive: true, force: true });

  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      IMAGE_PROVIDER: "openai",
      STORAGE_PROVIDER: "filesystem",
      STORAGE_LOCAL_DIR: storageDir,
    },
    stdio: "pipe",
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitForServer(`http://${HOST}:${port}/api/vertex/imagen/generate`);
  return { child, storageDir };
}

async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill("SIGTERM");
  await new Promise((resolve) => {
    server.child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  await rm(path.resolve(process.cwd(), server.storageDir), { recursive: true, force: true });
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

async function run() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key || key.toLowerCase() === "mock") {
    console.log("Skipping OpenAI provider smoke test (OPENAI_API_KEY missing or mock).");
    return;
  }

  const port = 8816;
  const server = await startServer(port);
  try {
    const { status, body } = await postGenerate(port, makePayload());
    assert.equal(status, 200);
    assert.equal(body.provider, "openai");
    assert.equal(typeof body.generation_time_ms, "number");
    assert.ok(Array.isArray(body.images));
    assert.ok(body.images.length > 0);
    const first = body.images[0];
    assert.equal(typeof first.url, "string");
    assert.equal(first.provider, "openai");
    assert.ok(Object.prototype.hasOwnProperty.call(first, "asset_key"));
    assert.ok(Object.prototype.hasOwnProperty.call(first, "width"));
    assert.ok(Object.prototype.hasOwnProperty.call(first, "height"));
    assert.ok(Array.isArray(body.assets));
    assert.ok(body.assets.length > 0);
    console.log("OpenAI provider smoke test passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
