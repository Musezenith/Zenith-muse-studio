import { DatabaseSync } from "node:sqlite";
import { getDocumentsDbPath } from "./documentsMigrations.mjs";

const seedDocumentsData = [
  {
    slug: "studio-intake-checklist",
    title: "Studio Intake Checklist",
    category: "operations",
    summary: "Required intake signals before a generation run starts.",
    content:
      "Collect brand references, campaign objective, aspect ratio, target channel, and hard constraints before creating prompts.",
    status: "active",
    version: 1,
    owner: "studio-ops",
    tags: ["intake", "brief", "quality"],
  },
  {
    slug: "prompt-qa-rubric",
    title: "Prompt QA Rubric",
    category: "quality",
    summary: "Scoring rubric for prompt clarity and policy-safe output.",
    content:
      "Score prompt packs on objective fit, composition detail, style coherence, and policy-safe language before generation.",
    status: "active",
    version: 1,
    owner: "creative-direction",
    tags: ["prompt", "qa", "rubric"],
  },
  {
    slug: "asset-naming-standard",
    title: "Asset Naming Standard",
    category: "operations",
    summary: "Stable naming and slug conventions for generated assets.",
    content:
      "Use project, concept, variant, and seed tokens in filenames to keep retrieval and archive history deterministic.",
    status: "active",
    version: 1,
    owner: "platform",
    tags: ["assets", "naming", "archive"],
  },
  {
    slug: "review-loop-sla",
    title: "Creative Review Loop SLA",
    category: "delivery",
    summary: "Expected turnaround windows for feedback and revisions.",
    content:
      "First review response in under 4 hours, revision handoff in under 24 hours, and explicit blockers logged to archive.",
    status: "active",
    version: 1,
    owner: "studio-manager",
    tags: ["sla", "review", "delivery"],
  },
  {
    slug: "model-selection-matrix",
    title: "Model Selection Matrix",
    category: "generation",
    summary: "When to choose photoreal, stylized, or concept-first settings.",
    content:
      "Select model and params based on campaign type, speed requirement, and post-production tolerance.",
    status: "active",
    version: 1,
    owner: "ml-ops",
    tags: ["model", "settings", "generation"],
  },
  {
    slug: "safety-escalation-flow",
    title: "Safety Escalation Flow",
    category: "compliance",
    summary: "Escalation process for flagged prompts or generated outputs.",
    content:
      "Route suspected policy violations to compliance owner, freeze delivery, and append audit notes to run metadata.",
    status: "active",
    version: 1,
    owner: "compliance",
    tags: ["safety", "policy", "escalation"],
  },
  {
    slug: "archive-retention-policy",
    title: "Archive Retention Policy",
    category: "operations",
    summary: "Retention windows and cleanup strategy for runs and assets.",
    content:
      "Keep production assets for 180 days, temporary drafts for 30 days, and remove orphans after run deletion.",
    status: "active",
    version: 1,
    owner: "platform",
    tags: ["archive", "retention", "cleanup"],
  },
  {
    slug: "client-handoff-template",
    title: "Client Handoff Template",
    category: "delivery",
    summary: "Standard package for final asset delivery and usage notes.",
    content:
      "Include selected variants, usage constraints, revision log, and source prompt summary in every handoff bundle.",
    status: "active",
    version: 1,
    owner: "account-team",
    tags: ["handoff", "delivery", "template"],
  },
  {
    slug: "cost-tracking-guide",
    title: "Generation Cost Tracking Guide",
    category: "finance",
    summary: "How to attribute generation and storage spend per project.",
    content:
      "Log variant count, retry count, model selection, and asset size for each run to support project-level margin tracking.",
    status: "draft",
    version: 1,
    owner: "finance-ops",
    tags: ["cost", "tracking", "margin"],
  },
  {
    slug: "legacy-workflow-notes",
    title: "Legacy Workflow Notes",
    category: "operations",
    summary: "Historical notes retained for backward compatibility context.",
    content:
      "Legacy workflow relied on manual asset uploads and ad hoc review channels; keep for historical reference only.",
    status: "deprecated",
    version: 2,
    owner: "studio-ops",
    tags: ["legacy", "workflow", "history"],
  },
];

export async function seedDocuments({ dbPath, force = false } = {}) {
  const resolvedDbPath = getDocumentsDbPath(dbPath);
  const db = new DatabaseSync(resolvedDbPath);
  let inserted = 0;

  try {
    const count = db.prepare("SELECT COUNT(*) AS total FROM documents").get().total;
    if (!force && count > 0) {
      return inserted;
    }

    const insert = db.prepare(`
      INSERT INTO documents (
        slug, title, category, summary, content, status, version, owner, tags, created_at, updated_at
      ) VALUES (
        @slug, @title, @category, @summary, @content, @status, @version, @owner, @tags, @created_at, @updated_at
      )
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        summary = excluded.summary,
        content = excluded.content,
        status = excluded.status,
        version = excluded.version,
        owner = excluded.owner,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `);

    const now = new Date().toISOString();
    db.exec("BEGIN;");
    for (const document of seedDocumentsData) {
      insert.run({
        ...document,
        tags: JSON.stringify(document.tags || []),
        created_at: now,
        updated_at: now,
      });
      inserted += 1;
    }
    db.exec("COMMIT;");
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

  return inserted;
}
