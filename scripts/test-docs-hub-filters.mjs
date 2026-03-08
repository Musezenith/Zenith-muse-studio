import assert from "node:assert/strict";
import { deriveDocumentsMeta, filterDocuments } from "../src/lib/documentsFilter.js";

const fixtures = [
  {
    id: 1,
    slug: "alpha",
    title: "Studio Intake Checklist",
    summary: "Intake for campaign kickoff",
    category: "operations",
    status: "active",
    tags: ["intake", "brief"],
  },
  {
    id: 2,
    slug: "beta",
    title: "Safety Escalation Flow",
    summary: "Policy path for flagged prompts",
    category: "compliance",
    status: "draft",
    tags: ["safety", "policy"],
  },
  {
    id: 3,
    slug: "gamma",
    title: "Legacy Workflow Notes",
    summary: "Historical reference",
    category: "operations",
    status: "deprecated",
    tags: null,
  },
];

function run() {
  const meta = deriveDocumentsMeta(fixtures);
  assert.deepEqual(meta.categories, ["compliance", "operations"]);
  assert.deepEqual(meta.statuses, ["active", "deprecated", "draft"]);
  assert.deepEqual(meta.tags, ["brief", "intake", "policy", "safety"]);

  assert.equal(filterDocuments(fixtures).length, 3);
  assert.equal(filterDocuments(fixtures, { category: "operations" }).length, 2);
  assert.equal(filterDocuments(fixtures, { status: "draft" }).length, 1);
  assert.equal(filterDocuments(fixtures, { tag: "policy" }).length, 1);
  assert.equal(filterDocuments(fixtures, { tag: "missing" }).length, 0);
  assert.equal(filterDocuments(fixtures, { query: "safety" })[0].slug, "beta");
  assert.equal(filterDocuments(fixtures, { query: "brief" })[0].slug, "alpha");
  assert.equal(filterDocuments(fixtures, { query: "historical" })[0].slug, "gamma");
  assert.equal(
    filterDocuments(fixtures, { category: "operations", query: "legacy" })[0].slug,
    "gamma"
  );
}

run();
console.log("Docs hub filter tests passed");
