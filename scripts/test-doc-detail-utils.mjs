import assert from "node:assert/strict";
import {
  getRelatedDocuments,
  renderMarkdownDocument,
} from "../src/lib/documentsDetail.js";

function testTocGeneration() {
  const content = `
# Operations Manual

## Intake
Intro text

## Intake
More text

### Checklist
- item one
- item two
`.trim();

  const result = renderMarkdownDocument(content);
  assert.equal(result.headings.length, 4);
  assert.deepEqual(
    result.headings.map((entry) => entry.id),
    ["operations-manual", "intake", "intake-2", "checklist"]
  );
  assert.ok(result.html.includes('<h2 id="intake">'));
  assert.ok(result.html.includes('<h2 id="intake-2">'));
  assert.ok(result.html.includes("<ul><li>item one</li><li>item two</li></ul>"));
}

function testNoHeadingsGraceful() {
  const result = renderMarkdownDocument("Plain paragraph only.\n\nSecond line.");
  assert.equal(result.headings.length, 0);
  assert.ok(result.html.includes("<p>Plain paragraph only.</p>"));
}

function testRelatedDocuments() {
  const current = {
    slug: "current",
    title: "Current",
    category: "operations",
    status: "active",
    tags: ["brief", "intake"],
  };
  const docs = [
    current,
    {
      slug: "same-category",
      title: "Same Category",
      category: "operations",
      status: "active",
      tags: ["random"],
    },
    {
      slug: "shared-tag",
      title: "Shared Tag",
      category: "other",
      status: "active",
      tags: ["brief"],
    },
    {
      slug: "none",
      title: "No Relation",
      category: "finance",
      status: "draft",
      tags: ["cost"],
    },
  ];

  const related = getRelatedDocuments(current, docs, 4);
  assert.equal(related.some((item) => item.slug === "current"), false);
  assert.equal(related.some((item) => item.slug === "none"), false);
  assert.equal(related.length, 2);
  assert.equal(related[0].slug, "same-category");
}

testTocGeneration();
testNoHeadingsGraceful();
testRelatedDocuments();
console.log("Doc detail utility tests passed");
