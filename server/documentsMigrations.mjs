import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationsDir = path.resolve(process.cwd(), "server/migrations");

const migrations = [
  {
    name: "001_create_documents",
    upFile: path.join(migrationsDir, "001_create_documents.up.sql"),
    downFile: path.join(migrationsDir, "001_create_documents.down.sql"),
  },
];

export function getDocumentsDbPath(dbPath = process.env.DOCUMENTS_DB_PATH) {
  return path.resolve(process.cwd(), dbPath || "data/studio.db");
}

async function ensureDbDir(dbPath) {
  await mkdir(path.dirname(dbPath), { recursive: true });
}

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  return db;
}

async function readSql(filePath) {
  return readFile(filePath, "utf8");
}

export async function migrateDocuments({ dbPath } = {}) {
  const resolvedDbPath = getDocumentsDbPath(dbPath);
  await ensureDbDir(resolvedDbPath);
  const db = openDatabase(resolvedDbPath);
  const applied = [];

  try {
    const hasMigration = db.prepare(
      "SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1"
    );
    const insertMigration = db.prepare(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)"
    );

    for (const migration of migrations) {
      const exists = hasMigration.get(migration.name);
      if (exists) continue;
      const upSql = await readSql(migration.upFile);
      db.exec("BEGIN;");
      db.exec(upSql);
      insertMigration.run(migration.name, new Date().toISOString());
      db.exec("COMMIT;");
      applied.push(migration.name);
    }
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch (_) {
      // no-op
    }
    throw error;
  } finally {
    db.close();
  }

  return applied;
}

export async function rollbackDocuments({ dbPath, steps = 1 } = {}) {
  const resolvedDbPath = getDocumentsDbPath(dbPath);
  await ensureDbDir(resolvedDbPath);
  const db = openDatabase(resolvedDbPath);
  const rolledBack = [];

  try {
    const hasMigration = db.prepare(
      "SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1"
    );
    const deleteMigration = db.prepare("DELETE FROM schema_migrations WHERE name = ?");

    for (const migration of [...migrations].reverse()) {
      if (rolledBack.length >= steps) break;
      const exists = hasMigration.get(migration.name);
      if (!exists) continue;
      const downSql = await readSql(migration.downFile);
      db.exec("BEGIN;");
      db.exec(downSql);
      deleteMigration.run(migration.name);
      db.exec("COMMIT;");
      rolledBack.push(migration.name);
    }
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch (_) {
      // no-op
    }
    throw error;
  } finally {
    db.close();
  }

  return rolledBack;
}
