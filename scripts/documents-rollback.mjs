import { getDocumentsDbPath, rollbackDocuments } from "../server/documentsMigrations.mjs";

async function run() {
  const dbPath = getDocumentsDbPath();
  const rolledBack = await rollbackDocuments({ steps: 1 });
  console.log(
    `[documents-rollback] db=${dbPath} rolled_back=${
      rolledBack.length ? rolledBack.join(",") : "none"
    }`
  );
}

run().catch((error) => {
  console.error("[documents-rollback] failed", error);
  process.exit(1);
});
