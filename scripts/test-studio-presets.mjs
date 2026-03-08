import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  listStudioPresets,
  validateStudioPresetRegistry,
} from "../server/studioPresets.mjs";

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

function assertPresetShape(preset) {
  const required = [
    "id",
    "label",
    "positive_prompt_base",
    "negative_prompt_base",
    "sampler",
    "steps",
    "cfg",
    "aspect_ratio",
    "seed_policy",
    "identity_strength_default",
    "lighting_recipe",
    "camera_profile",
    "color_grade",
  ];
  for (const key of required) {
    assert.ok(Object.prototype.hasOwnProperty.call(preset, key), `missing key ${key}`);
  }
  assert.equal(typeof preset.id, "string");
  assert.equal(typeof preset.label, "string");
  assert.equal(typeof preset.positive_prompt_base, "string");
  assert.equal(typeof preset.negative_prompt_base, "string");
  assert.equal(typeof preset.sampler, "string");
  assert.equal(typeof preset.steps, "number");
  assert.equal(typeof preset.cfg, "number");
  assert.equal(typeof preset.aspect_ratio, "string");
  assert.equal(typeof preset.seed_policy, "string");
  assert.equal(typeof preset.identity_strength_default, "number");
  assert.equal(typeof preset.lighting_recipe, "string");
  assert.equal(typeof preset.camera_profile, "string");
  assert.equal(typeof preset.color_grade, "string");
}

async function startServer(port) {
  const dbPath = `data/studio-presets-test-${port}.db`;
  await rm(path.resolve(process.cwd(), dbPath), { force: true });

  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DOCUMENTS_DB_PATH: dbPath,
      MOCK_IMAGEN: "1",
    },
    stdio: "pipe",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  await waitForServer(`http://${HOST}:${port}/api/studio/presets`);
  return { child, dbPath };
}

async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill("SIGTERM");
  await new Promise((resolve) => {
    server.child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  await rm(path.resolve(process.cwd(), server.dbPath), { force: true });
}

async function testRegistryValidation() {
  const presets = listStudioPresets();
  assert.equal(validateStudioPresetRegistry(presets), true);
  assert.equal(presets.length, 7);
  const ids = presets.map((item) => item.id).sort();
  assert.deepEqual(ids, [
    "avant_garde",
    "balenciaga_raw_flash",
    "dior_chiaroscuro",
    "kpop_glow",
    "minimal",
    "prada_intellectual",
    "vogue_cover",
  ]);
}

async function testApiRoutes(port) {
  const listResponse = await fetch(`http://${HOST}:${port}/api/studio/presets`);
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.ok(Array.isArray(listBody.items));
  assert.equal(listBody.items.length, 7);
  for (const preset of listBody.items) {
    assertPresetShape(preset);
  }

  const detailResponse = await fetch(
    `http://${HOST}:${port}/api/studio/presets/dior_chiaroscuro`
  );
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.item.id, "dior_chiaroscuro");
  assertPresetShape(detailBody.item);

  const missingResponse = await fetch(
    `http://${HOST}:${port}/api/studio/presets/does-not-exist`
  );
  assert.equal(missingResponse.status, 404);
}

async function run() {
  await testRegistryValidation();

  const port = 8830;
  const server = await startServer(port);
  try {
    await testApiRoutes(port);
    console.log("Studio presets tests passed");
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
