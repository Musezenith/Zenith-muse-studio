import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath, migrateDocuments } from "./documentsMigrations.mjs";
import { seedDocuments } from "./documentsSeed.mjs";

function parseTags(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeDocument(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    summary: row.summary,
    content: row.content,
    status: row.status,
    version: row.version,
    owner: row.owner,
    tags: parseTags(row.tags),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function withDb(fn, dbPath) {
  const resolvedDbPath = getDocumentsDbPath(dbPath);
  const db = new DatabaseSync(resolvedDbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export async function initializeDocumentsStore({ dbPath } = {}) {
  await migrateDocuments({ dbPath });
  await seedDocuments({ dbPath });
}

export function listDocuments({ dbPath } = {}) {
  return withDb((db) => {
    const rows = db
      .prepare(
        `
        SELECT
          id, slug, title, category, summary, content, status, version, owner, tags, created_at, updated_at
        FROM documents
        ORDER BY category ASC, title ASC
      `
      )
      .all();
    return rows.map(normalizeDocument);
  }, dbPath);
}

export function getDocumentBySlug(slug, { dbPath } = {}) {
  return withDb((db) => {
    const row = db
      .prepare(
        `
        SELECT
          id, slug, title, category, summary, content, status, version, owner, tags, created_at, updated_at
        FROM documents
        WHERE slug = ?
        LIMIT 1
      `
      )
      .get(slug);
    return row ? normalizeDocument(row) : null;
  }, dbPath);
}
