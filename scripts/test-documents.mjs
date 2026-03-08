import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getDocumentsDbPath,
  migrateDocuments,
  rollbackDocuments,
} from "../server/documentsMigrations.mjs";
import { seedDocuments } from "../server/documentsSeed.mjs";

const HOST = "127.0.0.1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 8000) {
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

function makeDbPath(testName) {
  return `data/${testName}-${Date.now()}.db`;
}

async function removeDbIfExists(dbPath) {
  await rm(path.resolve(process.cwd(), dbPath), { force: true });
}

function openDb(dbPath) {
  return new DatabaseSync(getDocumentsDbPath(dbPath));
}

async function testSchemaValidationAndRollback() {
  const dbPath = makeDbPath("documents-schema");
  await removeDbIfExists(dbPath);

  try {
    const applied = await migrateDocuments({ dbPath });
    assert.ok(applied.includes("001_create_documents"));
    await seedDocuments({ dbPath });

    const db = openDb(dbPath);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
      .get();
    assert.ok(table);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='documents'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes("idx_documents_slug"));
    assert.ok(indexes.includes("idx_documents_category"));
    assert.ok(indexes.includes("idx_documents_status"));

    const uniqueSlug = `schema-unique-${Date.now()}`;
    const insert = db.prepare(`
      INSERT INTO documents (
        slug, title, category, summary, content, status, version, owner, tags, created_at, updated_at
      ) VALUES (
        @slug, @title, @category, @summary, @content, @status, @version, @owner, @tags, @created_at, @updated_at
      )
    `);

    insert.run({
      slug: uniqueSlug,
      title: "Schema Test Doc",
      category: "testing",
      summary: "Schema validation check",
      content: "Schema content",
      status: "active",
      version: 1,
      owner: "test-suite",
      tags: "[]",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    assert.throws(
      () =>
        insert.run({
          slug: `${uniqueSlug}-bad`,
          title: "Invalid Status",
          category: "testing",
          summary: "Bad status check",
          content: "Should fail",
          status: "archived",
          version: 1,
          owner: "test-suite",
          tags: "[]",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      /CHECK constraint failed/
    );

    assert.throws(
      () =>
        insert.run({
          slug: uniqueSlug,
          title: "Duplicate Slug",
          category: "testing",
          summary: "Duplicate check",
          content: "Should fail",
          status: "active",
          version: 1,
          owner: "test-suite",
          tags: "[]",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      /UNIQUE constraint failed/
    );

    db.close();

    const rolledBack = await rollbackDocuments({ dbPath, steps: 1 });
    assert.ok(rolledBack.includes("001_create_documents"));

    const dbAfterRollback = openDb(dbPath);
    const tableAfter = dbAfterRollback
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'")
      .get();
    assert.equal(tableAfter, undefined);
    dbAfterRollback.close();
  } finally {
    await removeDbIfExists(dbPath);
  }
}

async function startServer({ port, dbPath }) {
  await removeDbIfExists(dbPath);

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

  await waitForServer(`http://${HOST}:${port}/api/documents`);
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
}

async function testApiListAndDetail() {
  const port = 8795;
  const dbPath = makeDbPath("documents-api");
  const child = await startServer({ port, dbPath });

  try {
    const listResponse = await fetch(`http://${HOST}:${port}/api/documents`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.ok(Array.isArray(listBody.items));
    assert.ok(listBody.items.length >= 10);

    const first = listBody.items[0];
    assert.equal(typeof first.slug, "string");
    assert.equal(typeof first.title, "string");
    assert.ok(["draft", "active", "deprecated"].includes(first.status));
    assert.ok(Array.isArray(first.tags));

    const detailResponse = await fetch(`http://${HOST}:${port}/api/documents/${first.slug}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await detailResponse.json();
    assert.equal(detailBody.item.slug, first.slug);
    assert.equal(detailBody.item.id, first.id);

    const missingResponse = await fetch(
      `http://${HOST}:${port}/api/documents/non-existent-doc`
    );
    assert.equal(missingResponse.status, 404);
  } finally {
    await stopServer(child);
    await removeDbIfExists(dbPath);
  }
}

async function run() {
  await testSchemaValidationAndRollback();
  await testApiListAndDetail();
  console.log("Documents tests passed: migration/schema/api");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
