import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";

const migrationsDir = path.resolve(process.cwd(), "server/migrations");
const migrations = [
  {
    name: "003_create_quotes",
    upFile: path.join(migrationsDir, "003_create_quotes.up.sql"),
    downFile: path.join(migrationsDir, "003_create_quotes.down.sql"),
  },
];

async function ensureDbDir(dbPath) {
  await mkdir(path.dirname(dbPath), { recursive: true });
}

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
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

export async function migrateQuotes({ dbPath } = {}) {
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
      if (hasMigration.get(migration.name)) continue;
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
