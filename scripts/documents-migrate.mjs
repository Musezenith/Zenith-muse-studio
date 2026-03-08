import { migrateDocuments, getDocumentsDbPath } from "../server/documentsMigrations.mjs";

async function run() {
  const dbPath = getDocumentsDbPath();
  const applied = await migrateDocuments();
  console.log(
    `[documents-migrate] db=${dbPath} applied=${applied.length ? applied.join(",") : "none"}`
  );
}

run().catch((error) => {
  console.error("[documents-migrate] failed", error);
  process.exit(1);
});
