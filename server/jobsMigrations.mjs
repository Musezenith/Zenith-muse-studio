import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";

const migrationsDir = path.resolve(process.cwd(), "server/migrations");

const migrations = [
  {
    name: "002_create_jobs",
    upFile: path.join(migrationsDir, "002_create_jobs.up.sql"),
    downFile: path.join(migrationsDir, "002_create_jobs.down.sql"),
  },
  {
    name: "005_add_pilot_fields_to_jobs",
    upFile: path.join(migrationsDir, "005_add_pilot_fields_to_jobs.up.sql"),
    downFile: path.join(migrationsDir, "005_add_pilot_fields_to_jobs.down.sql"),
  },
  {
    name: "007_add_sla_fields_to_jobs",
    upFile: path.join(migrationsDir, "007_add_sla_fields_to_jobs.up.sql"),
    downFile: path.join(migrationsDir, "007_add_sla_fields_to_jobs.down.sql"),
  },
  {
    name: "008_add_sla_hardening_fields_to_jobs",
    upFile: path.join(migrationsDir, "008_add_sla_hardening_fields_to_jobs.up.sql"),
    downFile: path.join(migrationsDir, "008_add_sla_hardening_fields_to_jobs.down.sql"),
  },
  {
    name: "009_create_testimonials",
    upFile: path.join(migrationsDir, "009_create_testimonials.up.sql"),
    downFile: path.join(migrationsDir, "009_create_testimonials.down.sql"),
  },
  {
    name: "010_create_proof_asset_packs",
    upFile: path.join(migrationsDir, "010_create_proof_asset_packs.up.sql"),
    downFile: path.join(migrationsDir, "010_create_proof_asset_packs.down.sql"),
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

export async function migrateJobs({ dbPath } = {}) {
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
