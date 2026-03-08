import { getDocumentsDbPath } from "../server/documentsMigrations.mjs";
import { seedDocuments } from "../server/documentsSeed.mjs";

async function run() {
  const dbPath = getDocumentsDbPath();
  const inserted = await seedDocuments({ force: true });
  console.log(`[documents-seed] db=${dbPath} upserted=${inserted}`);
}

run().catch((error) => {
  console.error("[documents-seed] failed", error);
  process.exit(1);
});
