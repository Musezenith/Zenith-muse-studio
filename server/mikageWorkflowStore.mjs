import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateMockModeOutput } from "./mikageGenerationProvider.mjs";
import { DEFAULT_MIKAGE_MODES, compilePromptSetsForModes } from "./promptCompilerService.mjs";

const MODE_DEFS = [
  {
    mode: "canon_core",
    title: "Canon Core",
    seed_policy: "lock",
  },
  {
    mode: "luminous_fan_appeal",
    title: "Luminous Fan Appeal",
    seed_policy: "reuse canon",
  },
  {
    mode: "luxury_mystical_editorial",
    title: "Luxury Mystical Editorial",
    seed_policy: "independent",
  },
];

const JAPANESE_ART_MASTER_STYLE_ID = "japanese_art_grammar_master";
const OBJECTIVE_TEMPLATES = {
  poster: "layout optimized for key poster readability and dramatic focal flow",
  character_sheet: "orthographic readability and silhouette clarity for character sheet use",
  lore_scene: "environmental storytelling with layered folklore symbolism",
  social_asset: "high-contrast social-first framing with immediate visual hook",
  key_visual: "cinematic hero composition for flagship key visual deployment",
};
const OBJECTIVE_NEGATIVE_TEMPLATES = {
  poster: "weak focal hierarchy, muddled silhouette readability",
  character_sheet: "occluded costume details, ambiguous silhouette turn",
  lore_scene: "empty worldbuilding context, motif scarcity, narrative vacuum",
  social_asset: "low-impact framing, weak scroll-stop composition",
  key_visual: "flat hero staging, diluted flagship impact",
};
const VARIANT_DELTAS = {
  canon_core: {
    positive_delta: "canon-safe identity lock, balanced detailing, restrained ornament",
    negative_delta: "identity drift, off-model anatomy, noisy decorative clutter",
  },
  luminous_fan_appeal: {
    positive_delta: "luminous crowd-appeal glow, emotive eye focus, stylized polish",
    negative_delta: "flat expression, muted appeal, washed-out highlights",
  },
  luxury_mystical_editorial: {
    positive_delta: "luxury mystical atmosphere, couture-grade material richness, premium drama",
    negative_delta: "generic editorial flattening, low texture fidelity, casual styling",
  },
};

const ALLOWED_CLASSIFICATIONS = [
  "reject",
  "interesting_but_non_canon",
  "usable_asset",
  "canon_candidate",
];

const dbDir = process.env.MIKAGE_WORKFLOW_DATA_DIR
  ? path.resolve(process.env.MIKAGE_WORKFLOW_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const dbFile = path.join(dbDir, "mikage-workflow.json");
const jobAssetsRootDir = path.join(dbDir, "job-assets");
const japaneseArtGrammarSeedFile = path.resolve(
  process.cwd(),
  "studio-data",
  "seeds",
  "mikage",
  "japanese-art-grammar.seed.json"
);

function nowIso() {
  return new Date().toISOString();
}

function toText(value, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function throwClassificationValidationError(fieldName, value) {
  const error = new Error(
    `${fieldName} must be one of: ${ALLOWED_CLASSIFICATIONS.join(", ")}. Received: ${String(value ?? "")}`
  );
  error.status = 400;
  throw error;
}

function normalizeClassificationValue(value, { fallback = "", fieldName = "classification", rejectInvalid = false } = {}) {
  const normalized = toText(value, 120).toLowerCase();
  if (!normalized) return fallback;
  if (ALLOWED_CLASSIFICATIONS.includes(normalized)) return normalized;
  if (rejectInvalid) {
    throwClassificationValidationError(fieldName, value);
  }
  return fallback;
}

function sanitizePathSegment(value, fallback = "item") {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || fallback;
}

function decodeDataUrlPayload(dataUrl) {
  if (typeof dataUrl !== "string") return { content: "", ext: "txt" };
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl.trim());
  if (!match) return { content: "", ext: "txt" };
  const mime = String(match[1] || "text/plain");
  const encoded = String(match[3] || "");
  const content = match[2]
    ? Buffer.from(encoded, "base64").toString("utf8")
    : decodeURIComponent(encoded);
  const ext = mime.includes("svg") ? "svg" : mime.includes("json") ? "json" : "txt";
  return { content, ext };
}

async function persistModeOutputsToJobFolder({ job, run, modeResults }) {
  if (!job?.id || !run?.id || !Array.isArray(modeResults)) return;
  for (const result of modeResults) {
    const safeMode = sanitizePathSegment(result?.mode, "mode");
    const modeDir = path.join(
      jobAssetsRootDir,
      sanitizePathSegment(job.id, "job"),
      sanitizePathSegment(run.id, "run"),
      safeMode
    );
    await mkdir(modeDir, { recursive: true });

    const refs = Array.isArray(result?.output_refs) ? result.output_refs : [];
    for (let index = 0; index < refs.length; index += 1) {
      const output = refs[index];
      const { content, ext } = decodeDataUrlPayload(output?.preview_data_url || "");
      const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizePathSegment(output?.id, "asset")}.${ext}`;
      const filePath = path.join(modeDir, fileName);
      await writeFile(filePath, content || "", "utf8");
      const relativePath = path.relative(dbDir, filePath).replaceAll("\\", "/");
      output.job_asset_path = relativePath;
      output.artifact_filename = fileName;
      output.artifact_mime_type = ext === "svg" ? "image/svg+xml" : "text/plain";
      if (output?.receipt && typeof output.receipt === "object") {
        output.receipt.job_asset_path = relativePath;
      }
    }
  }
}

function defaultStore() {
  return {
    schema_version: "2026-03-11.operator-workflow.v2.phase4.japanese-art-grammar",
    clients: [],
    campaigns: [],
    projects: [],
    intake_briefs: [],
    jobs: [],
    runs: [],
    run_batches: [],
    mode_jobs: [],
    job_plans: [],
    compiled_prompts: [],
    mode_results: [],
    review_sheets: [],
    review_scores: [],
    canon_gate_decisions: [],
    canon_assets: [],
    archive_assets: [],
    archive_runs: [],
    reference_library: [],
    reference_presets: [],
    reference_styles: [],
    reference_grammar_blocks: [],
    studio_presets: [],
    preset_variants: [],
    generation_runs: [],
    generation_variants: [],
    objective_overrides: [],
    compiled_prompt_rules: [],
    compiled_prompt_recipes: [],
    proof_sets: [],
    lineage_metadata: [],
  };
}

async function ensureDbDir() {
  await mkdir(dbDir, { recursive: true });
}

async function readStore() {
  try {
    const raw = await readFile(dbFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultStore();
    return normalizeLegacyStore({
      ...defaultStore(),
      ...parsed,
    });
  } catch (error) {
    if (error?.code === "ENOENT") return defaultStore();
    throw error;
  }
}

function normalizeLegacyStore(store) {
  const next = {
    ...defaultStore(),
    ...store,
  };

  next.clients = Array.isArray(next.clients) ? next.clients : [];
  next.campaigns = Array.isArray(next.campaigns) ? next.campaigns : [];
  next.projects = Array.isArray(next.projects) ? next.projects : [];
  next.intake_briefs = Array.isArray(next.intake_briefs) ? next.intake_briefs : [];
  next.jobs = Array.isArray(next.jobs) ? next.jobs : [];
  next.runs = Array.isArray(next.runs) ? next.runs : [];
  next.run_batches = Array.isArray(next.run_batches) ? next.run_batches : [];
  next.mode_jobs = Array.isArray(next.mode_jobs) ? next.mode_jobs : [];
  next.job_plans = Array.isArray(next.job_plans) ? next.job_plans : [];
  next.compiled_prompts = Array.isArray(next.compiled_prompts) ? next.compiled_prompts : [];
  next.mode_results = Array.isArray(next.mode_results) ? next.mode_results : [];
  next.review_sheets = Array.isArray(next.review_sheets) ? next.review_sheets : [];
  next.review_scores = Array.isArray(next.review_scores) ? next.review_scores : [];
  next.canon_gate_decisions = Array.isArray(next.canon_gate_decisions)
    ? next.canon_gate_decisions
    : [];
  next.canon_assets = Array.isArray(next.canon_assets) ? next.canon_assets : [];
  next.archive_assets = Array.isArray(next.archive_assets) ? next.archive_assets : [];
  next.archive_runs = Array.isArray(next.archive_runs) ? next.archive_runs : [];
  next.reference_library = Array.isArray(next.reference_library) ? next.reference_library : [];
  next.reference_presets = Array.isArray(next.reference_presets) ? next.reference_presets : [];
  next.reference_styles = Array.isArray(next.reference_styles) ? next.reference_styles : [];
  next.reference_grammar_blocks = Array.isArray(next.reference_grammar_blocks)
    ? next.reference_grammar_blocks
    : [];
  next.studio_presets = Array.isArray(next.studio_presets) ? next.studio_presets : [];
  next.preset_variants = Array.isArray(next.preset_variants) ? next.preset_variants : [];
  next.generation_runs = Array.isArray(next.generation_runs) ? next.generation_runs : [];
  next.generation_variants = Array.isArray(next.generation_variants) ? next.generation_variants : [];
  next.objective_overrides = Array.isArray(next.objective_overrides)
    ? next.objective_overrides
    : [];
  next.compiled_prompt_rules = Array.isArray(next.compiled_prompt_rules)
    ? next.compiled_prompt_rules
    : [];
  next.compiled_prompt_recipes = Array.isArray(next.compiled_prompt_recipes)
    ? next.compiled_prompt_recipes
    : [];
  next.proof_sets = Array.isArray(next.proof_sets) ? next.proof_sets : [];
  next.lineage_metadata = Array.isArray(next.lineage_metadata) ? next.lineage_metadata : [];

  const briefsById = new Map(next.intake_briefs.map((item) => [item.id, item]));

  for (const brief of next.intake_briefs) {
    brief.collection = toText(brief.collection || "core", 120) || "core";
    brief.campaign_name =
      toText(brief.campaign_name || "default-campaign", 120) || "default-campaign";
    brief.environment = toText(brief.environment || "studio", 120) || "studio";
    brief.creative_direction =
      toText(brief.creative_direction || "Luxury visual workflow", 220) ||
      "Luxury visual workflow";
  }

  const ensureClient = (clientName) => {
    const normalized = toText(clientName, 120);
    if (!normalized) return null;
    let client = next.clients.find((item) => item.client_name === normalized);
    if (!client) {
      client = {
        id: randomUUID(),
        client_name: normalized,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      next.clients.push(client);
    }
    return client;
  };

  const ensureCampaign = (clientId, campaignName) => {
    const normalized = toText(campaignName || "default-campaign", 120) || "default-campaign";
    if (!clientId) return null;
    let campaign = next.campaigns.find(
      (item) => item.client_id === clientId && item.campaign_name === normalized
    );
    if (!campaign) {
      campaign = {
        id: randomUUID(),
        client_id: clientId,
        campaign_name: normalized,
        status: "active",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      next.campaigns.push(campaign);
    }
    return campaign;
  };

  const ensureProject = (job, brief) => {
    const projectName = toText(job.project_name || job.title || brief?.project_title, 140);
    const collection = toText(job.collection || brief?.collection || "core", 120) || "core";
    let project = next.projects.find(
      (item) =>
        item.client_id === job.client_id &&
        item.campaign_id === job.campaign_id &&
        item.project_name === projectName &&
        item.collection === collection
    );
    if (!project) {
      project = {
        id: randomUUID(),
        client_id: job.client_id,
        campaign_id: job.campaign_id,
        client_name: job.client_name,
        campaign_name: job.campaign_name,
        project_name: projectName,
        collection,
        creative_direction:
          toText(job.creative_direction || brief?.creative_direction, 240) ||
          "Luxury visual workflow",
        environment: toText(job.environment || brief?.environment, 120) || "studio",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      next.projects.push(project);
    }
    return project;
  };

  for (const job of next.jobs) {
    const brief = briefsById.get(job.brief_id) || null;
    job.client_name = toText(job.client_name || brief?.client_name, 120);
    job.campaign_name =
      toText(job.campaign_name || brief?.campaign_name || "default-campaign", 120) ||
      "default-campaign";
    job.collection = toText(job.collection || brief?.collection || "core", 120) || "core";
    job.project_name = toText(job.project_name || job.title || brief?.project_title, 140);
    job.title = toText(job.title || job.project_name || brief?.project_title, 140);
    job.creative_direction =
      toText(job.creative_direction || brief?.creative_direction, 240) ||
      "Luxury visual workflow";
    job.environment = toText(job.environment || brief?.environment, 120) || "studio";

    const client = ensureClient(job.client_name);
    const campaign = ensureCampaign(client?.id || null, job.campaign_name);
    job.client_id = job.client_id || client?.id || null;
    job.campaign_id = job.campaign_id || campaign?.id || null;
    const project = ensureProject(job, brief);
    job.project_id = job.project_id || project?.id || null;
    job.controller_state = {
      brief: "compiled",
      review: "pending",
      canon_decision: "pending",
      archive: "pending",
      ...(job.controller_state || {}),
    };
  }

  const jobsById = new Map(next.jobs.map((item) => [item.id, item]));

  for (const run of next.runs) {
    if (!run.job_id) {
      const lineage = next.lineage_metadata.find((item) => item.run_id === run.id);
      run.job_id = lineage?.job_id || null;
    }
    const job = jobsById.get(run.job_id) || null;
    run.client_id = run.client_id || job?.client_id || null;
    run.campaign_id = run.campaign_id || job?.campaign_id || null;
    run.project_id = run.project_id || job?.project_id || null;
    run.client_name = toText(run.client_name || job?.client_name, 120);
    run.campaign_name =
      toText(run.campaign_name || job?.campaign_name || "default-campaign", 120) ||
      "default-campaign";
    run.project_name = toText(run.project_name || job?.project_name || job?.title, 140);
    run.collection = toText(run.collection || job?.collection || "core", 120) || "core";
    run.creative_direction =
      toText(run.creative_direction || job?.creative_direction, 240) ||
      "Luxury visual workflow";
    run.environment = toText(run.environment || job?.environment, 120) || "studio";
    run.batch_id = run.batch_id || null;
    run.batch_kind = toText(run.batch_kind || "", 80) || null;
    run.batch_index = Number.isFinite(Number(run.batch_index)) ? Number(run.batch_index) : 0;
    run.batch_size = Number.isFinite(Number(run.batch_size)) ? Number(run.batch_size) : 24;
  }

  const runsById = new Map(next.runs.map((item) => [item.id, item]));

  for (const batch of next.run_batches) {
    batch.run_ids = Array.isArray(batch.run_ids) ? batch.run_ids : [];
    batch.progress = {
      total: Number(batch.progress?.total || batch.run_ids.length || 1),
      completed: Number(batch.progress?.completed || batch.run_ids.length || 0),
      failed: Number(batch.progress?.failed || 0),
      percent: Number(batch.progress?.percent || 0),
    };
    if (!batch.progress.percent && batch.progress.total > 0) {
      batch.progress.percent = Number(
        ((batch.progress.completed / batch.progress.total) * 100).toFixed(1)
      );
    }
    batch.status =
      toText(batch.status, 80) ||
      (batch.progress.completed >= batch.progress.total ? "completed" : "running");
  }

  for (const asset of next.archive_assets) {
    const run = runsById.get(asset.run_id) || null;
    const job = run ? jobsById.get(run.job_id) || null : jobsById.get(asset.job_id) || null;
    asset.job_id = asset.job_id || run?.job_id || null;
    asset.client_id = asset.client_id || run?.client_id || job?.client_id || null;
    asset.campaign_id = asset.campaign_id || run?.campaign_id || job?.campaign_id || null;
    asset.client_name = toText(asset.client_name || run?.client_name || job?.client_name, 120);
    asset.campaign_name =
      toText(asset.campaign_name || run?.campaign_name || job?.campaign_name || "default-campaign", 120) ||
      "default-campaign";
    asset.project_title = toText(asset.project_title || run?.project_name || job?.project_name, 140);
    asset.project_name = toText(asset.project_name || asset.project_title, 140);
    asset.collection = toText(asset.collection || run?.collection || job?.collection || "core", 120) || "core";

    const modeResult = run
      ? next.mode_results.find(
          (item) => item.run_id === run.id && item.mode === asset.selected_mode
        ) || null
      : null;
    const visualTheme =
      toText(asset.asset_intelligence?.visual_theme || run?.creative_direction || job?.creative_direction, 180) ||
      "Luxury visual workflow";

    asset.asset_intelligence = {
      mode: toText(asset.asset_intelligence?.mode || asset.selected_mode, 120) || "canon_core",
      seed: Number(asset.asset_intelligence?.seed ?? modeResult?.seed ?? 0),
      preset: toText(asset.asset_intelligence?.preset || null, 120) || null,
      environment: toText(asset.asset_intelligence?.environment || run?.environment || job?.environment, 120) || "studio",
      visual_theme: visualTheme,
      generation_params: asset.asset_intelligence?.generation_params || modeResult?.generation_params || null,
      ...computeAssetIntelligenceScores({
        seed: Number(asset.asset_intelligence?.seed ?? modeResult?.seed ?? 0),
        mode: toText(asset.selected_mode, 120) || "canon_core",
        visualTheme,
      }),
      ...(asset.asset_intelligence || {}),
    };
    asset.canon_status =
      toText(asset.canon_status, 120) ||
      (asset.proof_worthy ? "canon_candidate" : "interesting_but_non_canon");
    asset.featured = Boolean(asset.featured);
    asset.reason_kept = toText(asset.reason_kept, 1000) || "";
    asset.tags = Array.isArray(asset.tags)
      ? asset.tags.map((item) => toText(item, 80)).filter(Boolean)
      : [];
    asset.reuse_notes = toText(asset.reuse_notes, 1000) || "";
    asset.usage_target = toText(asset.usage_target, 180) || "";
    asset.reuse_count = Number.isFinite(Number(asset.reuse_count)) ? Number(asset.reuse_count) : 0;
    asset.character = toText(asset.character || "the-porcelain-muse", 120) || "the-porcelain-muse";
    asset.canon_id = toText(asset.canon_id, 120) || "";
    asset.review_decision = toText(asset.review_decision, 40) || "keep";
    asset.fan_appeal_score = Number.isFinite(Number(asset.fan_appeal_score))
      ? Number(asset.fan_appeal_score)
      : null;
  }

  for (const proof of next.proof_sets) {
    const asset = next.archive_assets.find((item) => item.id === proof.archive_asset_id) || null;
    if (!proof.archive_asset_id && proof.run_id) {
      proof.archive_asset_id =
        next.archive_assets.find((item) => item.run_id === proof.run_id)?.id || null;
    }
    if (!proof.run_id && asset) {
      proof.run_id = asset.run_id;
    }
    proof.metadata = {
      client: toText(proof.metadata?.client || asset?.client_name, 120) || "Unknown",
      campaign:
        toText(proof.metadata?.campaign || asset?.campaign_name || "default-campaign", 120) ||
        "default-campaign",
      project: toText(proof.metadata?.project || asset?.project_title, 140) || "Untitled",
      mode: toText(proof.metadata?.mode || asset?.selected_mode, 120) || "canon_core",
      visual_theme:
        toText(proof.metadata?.visual_theme || asset?.asset_intelligence?.visual_theme, 180) ||
        "Mikage Zenith Visual Exploration",
      generation_params: proof.metadata?.generation_params || asset?.asset_intelligence?.generation_params || null,
      archive_asset_ids: Array.isArray(proof.metadata?.archive_asset_ids)
        ? proof.metadata.archive_asset_ids
        : [proof.archive_asset_id].filter(Boolean),
      workflow_timeline: Array.isArray(proof.metadata?.workflow_timeline)
        ? proof.metadata.workflow_timeline
        : ["Brief", "Compile", "Run Three Modes", "Review", "Canon Gate", "Archive", "Proof Set"],
      studio_narrative:
        toText(proof.metadata?.studio_narrative, 800) ||
        "Studio package generated from production lineage with canon-approved assets and ranked archive intelligence.",
    };
  }

  for (const plan of next.job_plans) {
    plan.modes = Array.isArray(plan.modes) && plan.modes.length > 0 ? plan.modes : [...DEFAULT_MIKAGE_MODES];
    plan.batch_size = Number.isFinite(Number(plan.batch_size)) ? Number(plan.batch_size) : 24;
    plan.constraints = Array.isArray(plan.constraints) ? plan.constraints : [];
  }

  for (const item of next.compiled_prompts) {
    item.mode = toText(item.mode, 120) || "canon_core";
    item.sampler = toText(item.sampler, 120) || "dpmpp_2m";
    item.steps = Number.isFinite(Number(item.steps)) ? Number(item.steps) : 32;
    item.cfg = Number.isFinite(Number(item.cfg)) ? Number(item.cfg) : 6.5;
    item.seed_policy = toText(item.seed_policy, 120) || "lock";
  }

  for (const review of next.review_scores) {
    review.soul_fidelity = Number(review.soul_fidelity || 0);
    review.visual_attraction = Number(review.visual_attraction || 0);
    review.luxury_editorial = Number(review.luxury_editorial || 0);
    review.usable_asset_strength = Number(review.usable_asset_strength || 0);
    review.canon_potential = Number(review.canon_potential || 0);
    review.total_score =
      Number(review.total_score || 0) ||
      (review.soul_fidelity +
        review.visual_attraction +
        review.luxury_editorial +
        review.usable_asset_strength +
        review.canon_potential);
    review.classification =
      toText(review.classification, 120) ||
      (review.total_score >= 40 ? "canon_candidate" : "usable_asset");
  }

  for (const archiveRun of next.archive_runs) {
    archiveRun.modes = Array.isArray(archiveRun.modes) ? archiveRun.modes : [...DEFAULT_MIKAGE_MODES];
    archiveRun.prompts = Array.isArray(archiveRun.prompts) ? archiveRun.prompts : [];
    archiveRun.params = Array.isArray(archiveRun.params) ? archiveRun.params : [];
    archiveRun.outputs = Array.isArray(archiveRun.outputs) ? archiveRun.outputs : [];
    archiveRun.review_scores = archiveRun.review_scores || null;
    archiveRun.classification = toText(archiveRun.classification, 120) || "usable_asset";
  }

  for (const reference of next.reference_library) {
    reference.reference_id = toText(reference.reference_id || reference.id, 120) || randomUUID();
    reference.title = toText(reference.title, 180) || "Untitled Reference";
    reference.source_url = toText(reference.source_url, 1200) || "";
    reference.artist_name = toText(reference.artist_name, 160) || "";
    reference.movement = toText(reference.movement, 120) || "";
    reference.culture = toText(reference.culture, 120) || "";
    reference.period = toText(reference.period, 120) || "";
    reference.palette = toText(reference.palette, 240) || "";
    reference.lighting = toText(reference.lighting, 240) || "";
    reference.texture = toText(reference.texture, 240) || "";
    reference.composition = toText(reference.composition, 240) || "";
    reference.mood = toText(reference.mood, 240) || "";
    reference.notes = toText(reference.notes, 2000) || "";
    reference.tags = Array.isArray(reference.tags)
      ? reference.tags.map((item) => toText(item, 80)).filter(Boolean)
      : [];
    reference.created_at = toText(reference.created_at, 80) || nowIso();
    reference.updated_at = toText(reference.updated_at, 80) || reference.created_at;
  }

  for (const preset of next.reference_presets) {
    preset.id = toText(preset.id, 120) || randomUUID();
    preset.reference_id = toText(preset.reference_id, 120) || "";
    preset.title = toText(preset.title, 180) || "Untitled Preset";
    preset.preset_seed = toText(preset.preset_seed, 2400) || "";
    preset.created_at = toText(preset.created_at, 80) || nowIso();
  }

  for (const style of next.reference_styles) {
    style.id = toText(style.id, 120) || randomUUID();
    style.reference_style_id = toText(style.reference_style_id || style.id, 120) || style.id;
    style.title = toText(style.title, 180) || "Untitled Reference Style";
    style.movement_lineage = toText(style.movement_lineage, 500) || "";
    style.description = toText(style.description, 2000) || "";
    style.created_at = toText(style.created_at, 80) || nowIso();
    style.updated_at = toText(style.updated_at, 80) || style.created_at;
  }

  for (const block of next.reference_grammar_blocks) {
    block.id = toText(block.id, 120) || randomUUID();
    block.reference_style_id = toText(block.reference_style_id, 120) || "";
    block.block_type = toText(block.block_type, 120) || "composition";
    block.label = toText(block.label, 180) || block.block_type;
    block.content = toText(block.content, 4000) || "";
    block.tags = Array.isArray(block.tags)
      ? block.tags.map((item) => toText(item, 80)).filter(Boolean)
      : [];
    block.created_at = toText(block.created_at, 80) || nowIso();
  }

  for (const preset of next.studio_presets) {
    preset.id = toText(preset.id, 120) || randomUUID();
    preset.preset_key = toText(preset.preset_key, 120) || preset.id;
    preset.title = toText(preset.title, 180) || "Untitled Studio Preset";
    preset.reference_style_id = toText(preset.reference_style_id, 120) || "";
    preset.composition = toText(preset.composition, 600) || "";
    preset.subject_rule = toText(preset.subject_rule, 700) || "";
    preset.linework = toText(preset.linework, 600) || "";
    preset.color_system = toText(preset.color_system, 600) || "";
    preset.material = toText(preset.material, 600) || "";
    preset.motif = toText(preset.motif, 600) || "";
    preset.character = toText(preset.character, 600) || "";
    preset.fashion = toText(preset.fashion, 600) || "";
    preset.decorative = toText(preset.decorative, 600) || "";
    preset.mood = toText(preset.mood, 600) || "";
    preset.negative_template = toText(preset.negative_template, 2000) || "";
    preset.sampler = toText(preset.sampler, 120) || "";
    preset.steps = Number.isFinite(Number(preset.steps)) ? Number(preset.steps) : 32;
    preset.cfg = Number.isFinite(Number(preset.cfg)) ? Number(preset.cfg) : 6.5;
    preset.aspect_ratio = toText(preset.aspect_ratio, 40) || "3:4";
    preset.created_at = toText(preset.created_at, 80) || nowIso();
    preset.updated_at = toText(preset.updated_at, 80) || preset.created_at;
  }

  for (const variant of next.preset_variants) {
    variant.id = toText(variant.id, 120) || randomUUID();
    variant.variant_key = toText(variant.variant_key, 120) || "canon_core";
    variant.title = toText(variant.title, 180) || variant.variant_key;
    variant.positive_delta = toText(variant.positive_delta, 1200) || "";
    variant.negative_delta = toText(variant.negative_delta, 1200) || "";
    variant.created_at = toText(variant.created_at, 80) || nowIso();
  }

  for (const run of next.generation_runs) {
    run.id = toText(run.id, 120) || randomUUID();
    run.project = toText(run.project, 180) || "";
    run.client = toText(run.client, 120) || "";
    run.preset = toText(run.preset, 120) || "";
    run.variant_count = Number.isFinite(Number(run.variant_count)) ? Number(run.variant_count) : 3;
    run.status = toText(run.status, 80) || "queued";
    run.seed = Number.isFinite(Number(run.seed)) ? Number(run.seed) : 110771;
    run.job_id = toText(run.job_id, 120) || "";
    run.mikage_run_id = toText(run.mikage_run_id, 120) || "";
    run.created_at = toText(run.created_at, 80) || nowIso();
    run.updated_at = toText(run.updated_at, 80) || run.created_at;
  }

  for (const variant of next.generation_variants) {
    variant.id = toText(variant.id, 120) || randomUUID();
    variant.run_id = toText(variant.run_id, 120) || "";
    variant.variant_name = toText(variant.variant_name, 120) || "canon_core";
    variant.status = toText(variant.status, 80) || "queued";
    variant.mikage_mode = toText(variant.mikage_mode, 120) || variant.variant_name;
    variant.created_at = toText(variant.created_at, 80) || nowIso();
    variant.updated_at = toText(variant.updated_at, 80) || variant.created_at;
  }

  for (const override of next.objective_overrides) {
    override.id = toText(override.id, 120) || randomUUID();
    override.objective_key = toText(override.objective_key, 120) || "key_visual";
    override.override_text = toText(override.override_text, 1200) || "";
    override.source_reference_style_id = toText(override.source_reference_style_id, 120) || "";
    override.created_at = toText(override.created_at, 80) || nowIso();
  }

  for (const rule of next.compiled_prompt_rules) {
    rule.id = toText(rule.id, 120) || randomUUID();
    rule.rule_key = toText(rule.rule_key, 120) || "japanese_art_grammar_default_compiler";
    rule.title = toText(rule.title, 180) || "Compiled Prompt Rule";
    rule.compile_order = Array.isArray(rule.compile_order)
      ? rule.compile_order.map((item) => toText(item, 120)).filter(Boolean)
      : [];
    rule.positive_prompt_skeleton = toText(rule.positive_prompt_skeleton, 3000) || "";
    rule.negative_prompt_skeleton = toText(rule.negative_prompt_skeleton, 3000) || "";
    rule.rules = Array.isArray(rule.rules)
      ? rule.rules.map((item) => toText(item, 300)).filter(Boolean)
      : [];
    rule.created_at = toText(rule.created_at, 80) || nowIso();
  }

  for (const recipe of next.compiled_prompt_recipes) {
    recipe.id = toText(recipe.id, 120) || randomUUID();
    recipe.preset_id = toText(recipe.preset_id, 120) || "";
    recipe.variant_key = toText(recipe.variant_key, 120) || "canon_core";
    recipe.objective = toText(recipe.objective, 120) || "key_visual";
    recipe.positive_prompt = toText(recipe.positive_prompt, 10000) || "";
    recipe.negative_prompt = toText(recipe.negative_prompt, 10000) || "";
    recipe.created_at = toText(recipe.created_at, 80) || nowIso();
  }

  if (next.studio_presets.length < 1 && next.reference_presets.length > 0) {
    next.studio_presets = next.reference_presets.map((item) => ({
      id: randomUUID(),
      preset_key: toText(item.id || item.reference_id, 120) || randomUUID(),
      title: toText(item.title, 180) || "Legacy Reference Preset",
      reference_style_id: toText(item.reference_id, 120) || "",
      composition: toText(item.preset_seed, 600),
      linework: "",
      color_system: "",
      material: "",
      motif: "",
      character: "",
      fashion: "",
      decorative: "",
      mood: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    }));
  }

  return next;
}

async function readDemoFile(relativePath, key) {
  try {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const raw = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.[key]) ? parsed[key] : [];
    return items;
  } catch (_) {
    return [];
  }
}

async function readJapaneseArtGrammarSeedPack() {
  try {
    const raw = await readFile(japaneseArtGrammarSeedFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      reference_styles: Array.isArray(parsed.reference_styles) ? parsed.reference_styles : [],
      reference_grammar_blocks: Array.isArray(parsed.reference_grammar_blocks)
        ? parsed.reference_grammar_blocks
        : [],
      studio_presets: Array.isArray(parsed.studio_presets) ? parsed.studio_presets : [],
      preset_variants: Array.isArray(parsed.preset_variants) ? parsed.preset_variants : [],
      objective_overrides: Array.isArray(parsed.objective_overrides)
        ? parsed.objective_overrides
        : [],
      compiled_prompt_rules: Array.isArray(parsed.compiled_prompt_rules)
        ? parsed.compiled_prompt_rules
        : [],
    };
  } catch (_) {
    return null;
  }
}

async function writeStore(store) {
  await ensureDbDir();
  await writeFile(dbFile, JSON.stringify(store, null, 2), "utf8");
}

async function ensureJapaneseArtGrammarSeed(store) {
  const now = nowIso();
  const pack = await readJapaneseArtGrammarSeedPack();

  const referenceStyles = Array.isArray(pack?.reference_styles) && pack.reference_styles.length > 0
    ? pack.reference_styles
    : [
        {
          reference_style_id: JAPANESE_ART_MASTER_STYLE_ID,
          title: "Japanese Art Grammar Master",
          movement_lineage: "Ukiyo-e -> Folklore -> Manga / Anime",
          description: "Curated grammar system for Japanese art direction and adaptation workflows.",
        },
      ];

  for (const styleSeed of referenceStyles) {
    const styleKey = toText(styleSeed.reference_style_id || styleSeed.id, 120);
    if (!styleKey) continue;
    const existing = store.reference_styles.find(
      (item) => item.reference_style_id === styleKey || item.id === styleKey
    );
    if (!existing) {
      store.reference_styles.push({
        id: randomUUID(),
        reference_style_id: styleKey,
        title: toText(styleSeed.title, 180) || "Japanese Art Grammar Master",
        movement_lineage: toText(styleSeed.movement_lineage, 500) || "",
        description: toText(styleSeed.description, 2000) || "",
        created_at: now,
        updated_at: now,
      });
    }
  }

  const requiredBlocks = Array.isArray(pack?.reference_grammar_blocks) && pack.reference_grammar_blocks.length > 0
    ? pack.reference_grammar_blocks
    : [
        { block_type: "composition", content: "Layered asymmetry, diagonal flow, foreground frame anchors" },
        { block_type: "linework", content: "Tapered ink contour, selective hatching, elegant edge rhythm" },
        { block_type: "color_system", content: "Indigo-crimson-gold harmony with muted rice-paper neutrals" },
        { block_type: "material", content: "Washi grain, woodblock bleed, silk brocade accents" },
        { block_type: "motif", content: "Waves, cloud bands, shrine lanterns, seasonal flora" },
        { block_type: "character", content: "Theatrical expression grammar, profile discipline, iconic silhouette" },
        { block_type: "fashion", content: "Edo kimono layering, obi hierarchy, kabuki textile emphasis" },
        { block_type: "decorative", content: "Karakusa borders, mon crests, patterned framing ornaments" },
        { block_type: "adaptation", content: "Translate classical grammar into manga/anime readability while preserving lineage" },
      ];

  for (const blockSeed of requiredBlocks) {
    const styleId = toText(blockSeed.reference_style_id, 120) || JAPANESE_ART_MASTER_STYLE_ID;
    const blockType = toText(blockSeed.block_type, 120);
    const content = toText(blockSeed.content, 4000);
    if (!blockType || !content) continue;
    const exists = store.reference_grammar_blocks.some(
      (item) =>
        item.reference_style_id === styleId &&
        item.block_type === blockType
    );
    if (!exists) {
      store.reference_grammar_blocks.push({
        id: randomUUID(),
        reference_style_id: styleId,
        block_type: blockType,
        label: toText(blockSeed.label, 180) || blockType,
        content,
        tags: ["japanese-art-grammar"],
        created_at: now,
      });
    }
  }

  const requiredPresets = Array.isArray(pack?.studio_presets) && pack.studio_presets.length > 0
    ? pack.studio_presets
    : [
        { preset_key: "edo_folklore_print", title: "Edo Folklore Print" },
        { preset_key: "kabuki_actor_portrait", title: "Kabuki Actor Portrait" },
        { preset_key: "bijin_ga_elegant_women", title: "Bijin-ga Elegant Women" },
        { preset_key: "yokai_creature_scene", title: "Yokai Creature Scene" },
        { preset_key: "edo_manga_hybrid", title: "Edo Manga Hybrid" },
      ];

  for (const presetSeed of requiredPresets) {
    const presetKey = toText(presetSeed.preset_key || presetSeed.slug, 120);
    const title = toText(presetSeed.title, 180);
    if (!presetKey) continue;
    const exists = store.studio_presets.some((item) => item.preset_key === presetKey);
    if (!exists) {
      store.studio_presets.push({
        id: randomUUID(),
        preset_key: presetKey,
        title: title || presetKey,
        reference_style_id:
          toText(presetSeed.reference_style_id, 120) || JAPANESE_ART_MASTER_STYLE_ID,
        composition: toText(presetSeed.composition, 600) || "",
        subject_rule: toText(presetSeed.subject_rule, 700) || "",
        linework: toText(presetSeed.linework, 600) || "",
        color_system: toText(presetSeed.color_system, 600) || "",
        material: toText(presetSeed.material, 600) || "",
        motif: toText(presetSeed.motif, 600) || "",
        character: toText(presetSeed.character, 600) || "",
        fashion: toText(presetSeed.fashion, 600) || "",
        decorative: toText(presetSeed.decorative, 600) || "",
        mood: toText(presetSeed.mood, 600) || "",
        negative_template: toText(presetSeed.negative_template, 2000) || "",
        sampler: toText(presetSeed.sampler, 120) || "dpmpp_2m",
        steps: Number.isFinite(Number(presetSeed.steps)) ? Number(presetSeed.steps) : 32,
        cfg: Number.isFinite(Number(presetSeed.cfg)) ? Number(presetSeed.cfg) : 6.5,
        aspect_ratio: toText(presetSeed.aspect_ratio, 40) || "3:4",
        created_at: now,
        updated_at: now,
      });
    }
  }

  const requiredVariants = Array.isArray(pack?.preset_variants) && pack.preset_variants.length > 0
    ? pack.preset_variants
    : [
        { variant_key: "canon_core", title: "Canon Core" },
        { variant_key: "luminous_fan_appeal", title: "Luminous Fan Appeal" },
        { variant_key: "luxury_mystical_editorial", title: "Luxury Mystical Editorial" },
      ];

  for (const variantSeed of requiredVariants) {
    const variantKey = toText(variantSeed.variant_key, 120);
    const title = toText(variantSeed.title, 180);
    if (!variantKey) continue;
    const exists = store.preset_variants.some((item) => item.variant_key === variantKey);
    if (!exists) {
      store.preset_variants.push({
        id: randomUUID(),
        variant_key: variantKey,
        title: title || variantKey,
        positive_delta:
          toText(variantSeed.positive_delta, 1200) ||
          VARIANT_DELTAS[variantKey]?.positive_delta ||
          "",
        negative_delta:
          toText(variantSeed.negative_delta, 1200) ||
          VARIANT_DELTAS[variantKey]?.negative_delta ||
          "",
        created_at: now,
      });
    }
  }

  const objectiveOverrides = Array.isArray(pack?.objective_overrides)
    ? pack.objective_overrides
    : [];
  for (const overrideSeed of objectiveOverrides) {
    const objectiveKey = toText(overrideSeed.objective_key, 120);
    if (!objectiveKey) continue;
    const exists = store.objective_overrides.some((item) => item.objective_key === objectiveKey);
    if (!exists) {
      store.objective_overrides.push({
        id: randomUUID(),
        objective_key: objectiveKey,
        override_text:
          toText(overrideSeed.override_text, 1200) ||
          OBJECTIVE_TEMPLATES[objectiveKey] ||
          OBJECTIVE_TEMPLATES.key_visual,
        source_reference_style_id: JAPANESE_ART_MASTER_STYLE_ID,
        created_at: now,
      });
    }
  }

  const promptRules = Array.isArray(pack?.compiled_prompt_rules) ? pack.compiled_prompt_rules : [];
  for (const ruleSeed of promptRules) {
    const ruleKey = toText(ruleSeed.rule_key, 120);
    if (!ruleKey) continue;
    const exists = store.compiled_prompt_rules.some((item) => item.rule_key === ruleKey);
    if (!exists) {
      store.compiled_prompt_rules.push({
        id: randomUUID(),
        rule_key: ruleKey,
        title: toText(ruleSeed.title, 180) || "Compiled Prompt Rule",
        compile_order: Array.isArray(ruleSeed.compile_order)
          ? ruleSeed.compile_order.map((item) => toText(item, 120)).filter(Boolean)
          : [],
        positive_prompt_skeleton: toText(ruleSeed.positive_prompt_skeleton, 3000) || "",
        negative_prompt_skeleton: toText(ruleSeed.negative_prompt_skeleton, 3000) || "",
        rules: Array.isArray(ruleSeed.rules)
          ? ruleSeed.rules.map((item) => toText(item, 300)).filter(Boolean)
          : [],
        created_at: now,
      });
    }
  }

  if (store.objective_overrides.length < 1) {
    for (const [objectiveKey, overrideText] of Object.entries(OBJECTIVE_TEMPLATES)) {
      store.objective_overrides.push({
        id: randomUUID(),
        objective_key: objectiveKey,
        override_text: overrideText,
        source_reference_style_id: JAPANESE_ART_MASTER_STYLE_ID,
        created_at: now,
      });
    }
  }

  return store;
}

function modeSeedMap(canonSeed) {
  const base = Number.isInteger(canonSeed) ? canonSeed : 110771;
  return {
    canon_core: base,
    luminous_fan_appeal: base,
    luxury_mystical_editorial: base + 701,
  };
}

function buildReviewTemplate(runId) {
  return {
    id: randomUUID(),
    run_id: runId,
    operator_notes: "",
    qc: {
      fidelity: "pending",
      luxury_signal: "pending",
      brand_fit: "pending",
      technical_cleanliness: "pending",
    },
    scored_modes: [],
    next_action: "review",
    updated_at: nowIso(),
  };
}

function computeRunStatus(modeResults) {
  if (!Array.isArray(modeResults) || modeResults.length < 1) return "queued";
  if (modeResults.some((item) => item.status === "failed")) return "attention";
  if (modeResults.every((item) => item.status === "succeeded")) return "ready_for_review";
  return "running";
}

function normalizeIntake(input = {}) {
  const projectTitle = toText(input.project_title || input.brand || "", 140);
  const clientName = toText(input.client_name || "", 120);
  const campaignName = toText(input.campaign_name || "default-campaign", 120) || "default-campaign";
  const creativeBrief = toText(input.creative_brief || input.use_case || "", 2000);
  const collection = toText(input.collection || "core", 120) || "core";
  const creativeDirection = toText(input.creative_direction || "Luxury visual workflow", 220);
  const environment = toText(input.environment || "studio", 120) || "studio";
  const restrictions = Array.isArray(input.restrictions)
    ? input.restrictions.map((item) => toText(item, 200)).filter(Boolean).slice(0, 12)
    : [];
  const preset = toText(input.preset || "mikage-porcelain-canon", 120) || "mikage-porcelain-canon";
  const archetype = toText(input.archetype || "the-porcelain-muse", 120) || "the-porcelain-muse";

  const errors = {};
  if (!projectTitle) errors.project_title = "project_title is required";
  if (!clientName) errors.client_name = "client_name is required";
  if (!creativeBrief) errors.creative_brief = "creative_brief is required";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      project_title: projectTitle,
      client_name: clientName,
      campaign_name: campaignName,
      collection,
      creative_direction: creativeDirection,
      environment,
      creative_brief: creativeBrief,
      restrictions,
      preset,
      archetype,
    },
  };
}

function normalizeJobPlan(input = {}) {
  const projectId = toText(input.project_id, 120);
  const objective = toText(input.objective, 240);
  const runObjective = toText(input.run_objective, 600);
  const canonCoreReminder = toText(input.canon_core_reminder, 600);
  const modes = Array.isArray(input.modes)
    ? input.modes.map((item) => toText(item, 120)).filter(Boolean)
    : [...DEFAULT_MIKAGE_MODES];
  const batchSize = Number.isFinite(Number(input.batch_size))
    ? Math.max(1, Math.min(48, Number(input.batch_size)))
    : 24;
  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map((item) => toText(item, 200)).filter(Boolean).slice(0, 16)
    : [];

  const errors = {};
  if (!projectId) errors.project_id = "project_id is required";
  if (!runObjective) errors.run_objective = "run_objective is required";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      project_id: projectId,
      objective,
      run_objective: runObjective,
      canon_core_reminder: canonCoreReminder,
      modes: modes.length > 0 ? modes : [...DEFAULT_MIKAGE_MODES],
      batch_size: batchSize,
      constraints,
    },
  };
}

function computeReviewTotalScore(input = {}) {
  const soulFidelity = Number(input.soul_fidelity || 0);
  const visualAttraction = Number(input.visual_attraction || 0);
  const luxuryEditorial = Number(input.luxury_editorial || 0);
  const usableAssetStrength = Number(
    Object.prototype.hasOwnProperty.call(input, "usable_asset")
      ? input.usable_asset
      : input.usable_asset_strength || 0
  );
  const canonPotential = Number(input.canon_potential || 0);
  const totalScore =
    soulFidelity + visualAttraction + luxuryEditorial + usableAssetStrength + canonPotential;
  return {
    soul_fidelity: soulFidelity,
    visual_attraction: visualAttraction,
    luxury_editorial: luxuryEditorial,
    usable_asset_strength: usableAssetStrength,
    usable_asset: usableAssetStrength,
    canon_potential: canonPotential,
    total_score: totalScore,
  };
}

function upsertCanonAssetRecord(store, archiveAsset, review = null) {
  if (!archiveAsset?.id) return null;
  const now = nowIso();
  const existing = store.canon_assets.find((item) => item.archive_asset_id === archiveAsset.id);
  const entry =
    existing ||
    {
      id: randomUUID(),
      archive_asset_id: archiveAsset.id,
      created_at: now,
    };

  entry.run_id = archiveAsset.run_id;
  entry.job_id = archiveAsset.job_id;
  entry.project = archiveAsset.project_title || archiveAsset.project_name || "";
  entry.mode = archiveAsset.selected_mode || "canon_core";
  const resolvedClassification =
    toText(archiveAsset.classification, 120) ||
    toText(archiveAsset.canon_status, 120) ||
    toText(review?.classification, 120);
  entry.classification = normalizeClassificationValue(resolvedClassification, {
    fallback: "canon_candidate",
  });
  entry.review_score = Number(review?.total_score || archiveAsset.review_score || 0);
  entry.asset_url = toText(archiveAsset.asset_url, 800) || "";
  entry.timestamp = toText(archiveAsset.timestamp, 80) || archiveAsset.archived_at || now;
  entry.updated_at = now;

  if (!existing) {
    store.canon_assets.push(entry);
  }
  return entry;
}

function removeCanonAssetRecord(store, archiveAssetId) {
  if (!archiveAssetId) return;
  const index = store.canon_assets.findIndex((item) => item.archive_asset_id === archiveAssetId);
  if (index >= 0) {
    store.canon_assets.splice(index, 1);
  }
}

function suggestClassification(totalScore) {
  return Number(totalScore || 0) >= 40 ? "canon_candidate" : "usable_asset";
}

function upsertClient(store, input = {}) {
  const clientName = toText(input.client_name, 120);
  if (!clientName) return null;
  let client = store.clients.find((item) => item.client_name === clientName);
  if (!client) {
    client = {
      id: randomUUID(),
      client_name: clientName,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.clients.push(client);
  } else {
    client.updated_at = nowIso();
  }
  return client;
}

function upsertCampaign(store, input = {}) {
  const clientId = toText(input.client_id, 120);
  const campaignName = toText(input.campaign_name || "default-campaign", 120) || "default-campaign";
  if (!clientId) return null;

  let campaign = store.campaigns.find(
    (item) => item.client_id === clientId && item.campaign_name === campaignName
  );

  if (!campaign) {
    campaign = {
      id: randomUUID(),
      client_id: clientId,
      campaign_name: campaignName,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.campaigns.push(campaign);
  } else {
    campaign.updated_at = nowIso();
  }

  return campaign;
}

function upsertProject(store, input = {}) {
  const clientId = toText(input.client_id, 120);
  const campaignId = toText(input.campaign_id, 120);
  const clientName = toText(input.client_name, 120);
  const campaignName = toText(input.campaign_name || "default-campaign", 120) || "default-campaign";
  const projectName = toText(input.project_name || input.project_title, 140);
  const collection = toText(input.collection || "core", 120) || "core";
  const creativeDirection = toText(input.creative_direction || "", 240);
  const environment = toText(input.environment || "studio", 120) || "studio";

  let project = store.projects.find(
    (item) =>
      item.client_id === clientId &&
      item.campaign_id === campaignId &&
      item.project_name === projectName &&
      item.collection === collection
  );

  if (!project) {
    project = {
      id: randomUUID(),
      client_id: clientId,
      campaign_id: campaignId,
      client_name: clientName,
      campaign_name: campaignName,
      project_name: projectName,
      collection,
      creative_direction: creativeDirection,
      environment,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.projects.push(project);
  } else {
    project.creative_direction = creativeDirection || project.creative_direction;
    project.environment = environment || project.environment;
    project.updated_at = nowIso();
  }

  return project;
}

function computeAssetIntelligenceScores({ seed = 0, mode = "canon_core", visualTheme = "" } = {}) {
  const modeWeight = mode === "canon_core" ? 9 : mode === "luminous_fan_appeal" ? 5 : 7;
  const themeWeight = Math.max(1, String(visualTheme || "").length % 13);
  const base = Math.abs(Number(seed || 0)) + modeWeight * 97 + themeWeight * 31;
  const normalize = (value) => Number((Math.max(58, Math.min(99, value))).toFixed(1));

  return {
    visual_score: normalize(62 + (base % 32)),
    composition_score: normalize(60 + ((base * 3) % 35)),
    novelty_score: normalize(55 + ((base * 5) % 40)),
    brand_fit: normalize(63 + ((base * 7) % 30)),
  };
}

function resolveGenerationRuntimeConfig() {
  const nodeEnv = toText(process.env.NODE_ENV, 40).toLowerCase();
  const runtimeMode = toText(process.env.MIKAGE_GENERATION_RUNTIME, 40).toLowerCase();
  const allowMockFlag = toText(process.env.MIKAGE_ALLOW_MOCK_GENERATION, 10).toLowerCase() === "true";
  const providerBaseUrl = toText(process.env.MIKAGE_IMAGE_PROVIDER_BASE_URL, 800).replace(/\/+$/, "");
  const providerName = toText(process.env.MIKAGE_IMAGE_PROVIDER, 120) || "provider-adapter";
  const providerModel = toText(process.env.MIKAGE_IMAGE_MODEL, 120) || "provider-managed";
  const isProduction = nodeEnv === "production";

  const forceProvider = runtimeMode === "provider";
  const forceMock = runtimeMode === "mock";
  const allowMock = allowMockFlag || forceMock || (!isProduction && !forceProvider);

  if (!allowMock && !providerBaseUrl) {
    const error = new Error(
      "Image generation provider is not configured. Set MIKAGE_IMAGE_PROVIDER_BASE_URL or enable MIKAGE_ALLOW_MOCK_GENERATION=true for non-production."
    );
    error.status = 503;
    throw error;
  }

  if (allowMock) {
    return {
      kind: "mock",
      provider: "mock-stub",
      model: "mikage-mock-renderer-v1",
      baseUrl: "",
    };
  }

  return {
    kind: "provider",
    provider: providerName,
    model: providerModel,
    baseUrl: providerBaseUrl,
  };
}

function generateModeOutput({ runId, mode, seed, rerunCount }) {
  const runtime = resolveGenerationRuntimeConfig();
  if (runtime.kind === "mock") {
    return {
      ...generateMockModeOutput({
        run_id: runId,
        mode,
        seed,
        rerun_count: rerunCount,
      }),
      model: runtime.model,
    };
  }

  const safeRun = encodeURIComponent(String(runId || "run"));
  const safeMode = encodeURIComponent(String(mode || "unknown"));
  const safeSeed = Number.isFinite(Number(seed)) ? Number(seed) : 0;
  const safeRerun = Number.isFinite(Number(rerunCount)) ? Number(rerunCount) : 0;
  const label = safeRerun > 0 ? `${mode}-rerun-${safeRerun}` : `${mode}-primary`;
  const previewUrl = `${runtime.baseUrl}/runs/${safeRun}/${safeMode}/${safeSeed}?rerun=${safeRerun}`;

  return {
    provider: runtime.provider,
    request_id: `${runtime.provider}-${safeRun}-${safeMode}-${safeSeed}-${safeRerun}`,
    label,
    preview_url: previewUrl,
    preview_data_url: "",
    seed: safeSeed,
    model: runtime.model,
  };
}

function toSeededModeResult({
  runId,
  mode,
  seed,
  status = "succeeded",
  rerunCount = 0,
  batchSize = 24,
  compiledPrompt = null,
  modeJobId = null,
}) {
  const generated = generateModeOutput({
    runId,
    mode,
    seed,
    rerunCount,
  });
  const outputs = Array.from({ length: Math.max(1, Number(batchSize || 1)) }).map((_, index) => {
    const outputSeed = Number(seed || 0) + index;
    const label = `${generated.label} #${String(index + 1).padStart(2, "0")}`;
    const previewUrl = `${String(generated.preview_url || "")}&variant=${index + 1}`;
    const timestamp = nowIso();
    return {
      id: randomUUID(),
      mode_job_id: modeJobId,
      label,
      asset_url: previewUrl,
      thumbnail_url: previewUrl,
      preview_url: previewUrl,
      preview_data_url: generated.preview_data_url,
      width: 960,
      height: 1200,
      timestamp,
      proof_worthy: mode !== "luminous_fan_appeal",
      receipt: {
        mode,
        positive_prompt: compiledPrompt?.positive_prompt || "",
        negative_prompt: compiledPrompt?.negative_prompt || "",
        sampler: compiledPrompt?.sampler || "dpmpp_2m",
        steps: Number(compiledPrompt?.steps || 32),
        cfg: Number(compiledPrompt?.cfg || 6.5),
        seed: outputSeed,
        aspect_ratio: "3:4",
        model: "mikage-mock-renderer-v1",
        timestamp,
        asset_url: previewUrl,
      },
    };
  });
  return {
    id: randomUUID(),
    run_id: runId,
    mode_job_id: modeJobId,
    mode,
    seed,
    status,
    rerun_count: rerunCount,
    output_refs: outputs,
    prompt: compiledPrompt?.positive_prompt || "",
    negative_prompt: compiledPrompt?.negative_prompt || "",
    provider: generated.provider,
    provider_request_id: generated.request_id,
    model: generated.model || "provider-managed",
    generation_params: {
      sampler: compiledPrompt?.sampler || "dpmpp_2m",
      steps: Number(compiledPrompt?.steps || 32),
      cfg: Number(compiledPrompt?.cfg || 6.5),
      aspect_ratio: "3:4",
      seed,
    },
    updated_at: nowIso(),
  };
}

function cloneModeResult({ source, runId }) {
  return {
    id: randomUUID(),
    run_id: runId,
    mode_job_id: source.mode_job_id || null,
    mode: source.mode,
    seed: Number(source.seed || 0),
    status: source.status || "succeeded",
    rerun_count: Number(source.rerun_count || 0),
    output_refs: Array.isArray(source.output_refs)
      ? source.output_refs.map((output) => ({
          id: randomUUID(),
          mode_job_id: source.mode_job_id || null,
          label: toText(output?.label, 180) || `${source.mode}-carry-over`,
          preview_url: toText(output?.preview_url, 800) || null,
          preview_data_url: toText(output?.preview_data_url, 60000) || null,
          job_asset_path: toText(output?.job_asset_path, 400) || "",
          artifact_filename: toText(output?.artifact_filename, 180) || "",
          artifact_mime_type: toText(output?.artifact_mime_type, 120) || "",
          proof_worthy: output?.proof_worthy !== false,
          receipt: output?.receipt || null,
        }))
      : [],
    prompt: toText(source.prompt, 4000) || "",
    negative_prompt: toText(source.negative_prompt, 4000) || "",
    provider: toText(source.provider, 80) || "mock-stub",
    provider_request_id: toText(source.provider_request_id, 180) || randomUUID(),
    updated_at: nowIso(),
  };
}

function summarizeRun(store, run) {
  const modeResults = store.mode_results.filter((item) => item.run_id === run.id);
  const modeJobs = store.mode_jobs.filter((item) => item.run_id === run.id);
  const reviewSheet = store.review_sheets.find((item) => item.run_id === run.id) || null;
  const reviewScore = store.review_scores.find((item) => item.run_id === run.id) || null;
  const canonDecision = store.canon_gate_decisions.find((item) => item.run_id === run.id) || null;
  const archiveAsset = store.archive_assets.find((item) => item.run_id === run.id) || null;
  const lineage = store.lineage_metadata.find((item) => item.run_id === run.id) || null;
  const job = store.jobs.find((item) => item.id === run.job_id) || null;
  const batch = run.batch_id
    ? store.run_batches.find((item) => item.id === run.batch_id) || null
    : null;
  const client = job?.client_id
    ? store.clients.find((item) => item.id === job.client_id) || null
    : null;
  const campaign = job?.campaign_id
    ? store.campaigns.find((item) => item.id === job.campaign_id) || null
    : null;
  const project = job?.project_id
    ? store.projects.find((item) => item.id === job.project_id) || null
    : null;
  const brief = job
    ? store.intake_briefs.find((item) => item.id === job.brief_id) || null
    : null;
  const childReruns = store.runs
    .filter((item) => item.rerun_of_run_id === run.id)
    .map((item) => ({
      id: item.id,
      job_id: item.job_id,
      rerun_mode: item.rerun_mode || null,
      status: item.status,
      stage: item.stage,
      created_at: item.created_at,
    }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const lineageChain = [
    {
      key: "intake",
      label: "intake",
      state: brief ? "completed" : "missing",
      ref_id: brief?.id || null,
    },
    {
      key: "run-three-modes",
      label: "run-three-modes",
      state: run ? "completed" : "missing",
      ref_id: run.id,
    },
    {
      key: "mode-outputs",
      label: "mode outputs",
      state: modeResults.length > 0 ? "completed" : "missing",
      ref_id: modeResults.length,
    },
    {
      key: "rerun",
      label: "rerun",
      state: childReruns.length > 0 ? "completed" : "idle",
      ref_id: childReruns.length,
    },
    {
      key: "canon-gate",
      label: "canon gate",
      state: canonDecision ? "completed" : "pending",
      ref_id: canonDecision?.id || null,
    },
    {
      key: "archive",
      label: "archive",
      state: archiveAsset ? "completed" : "pending",
      ref_id: archiveAsset?.id || null,
    },
  ];

  const timeline = [
    {
      key: "Brief",
      label: "Brief",
      completed: Boolean(brief),
      active: String(run.stage || "").toLowerCase() === "brief",
      metadata: brief
        ? {
            brief_id: brief.id,
            project_title: brief.project_title,
            client_name: brief.client_name,
            preset: brief.preset,
            archetype: brief.archetype,
          }
        : null,
    },
    {
      key: "Compile",
      label: "Compile",
      completed: Boolean(job),
      active: String(run.stage || "").toLowerCase() === "compile",
      metadata: job
        ? {
            job_id: job.id,
            workflow_stage: job.workflow_stage,
            status: job.status,
          }
        : null,
    },
    {
      key: "Run Three Modes",
      label: "Run Three Modes",
      completed: modeResults.length === 3,
      active: String(run.stage || "").toLowerCase().includes("generate"),
      metadata: {
        mode_count: modeResults.length,
        modes: modeResults.map((item) => ({
          mode: item.mode,
          seed: item.seed,
          status: item.status,
        })),
      },
    },
    {
      key: "Review",
      label: "Review",
      completed: Boolean(reviewSheet),
      active: String(run.stage || "").toLowerCase() === "review",
      metadata: reviewSheet,
    },
    {
      key: "Canon Gate",
      label: "Canon Gate",
      completed: Boolean(canonDecision),
      active: String(run.stage || "").toLowerCase().includes("canon"),
      metadata: canonDecision,
    },
    {
      key: "Archive",
      label: "Archive",
      completed: Boolean(archiveAsset),
      active: String(run.stage || "").toLowerCase().includes("archive"),
      metadata: archiveAsset,
    },
  ];

  return {
    ...run,
    live_status:
      toText(run.workflow_status, 80) ||
      (run.status === "archived"
        ? "archived"
        : run.status === "canon_approved"
        ? "canonized"
        : reviewScore
        ? "reviewed"
        : run.status === "ready_for_review"
        ? "completed"
        : run.status === "running"
        ? "running"
        : "queued"),
    mode_results: modeResults,
    review_sheet: reviewSheet,
    review_score: reviewScore,
    canon_gate_decision: canonDecision,
    archive_asset: archiveAsset,
    lineage,
    lineage_chain: lineageChain,
    timeline,
    child_reruns: childReruns,
    mode_jobs: modeJobs,
    batch,
    client,
    campaign,
    project,
    job,
    intake_brief: brief,
  };
}

function summarizeJob(store, job) {
  const runs = store.runs
    .filter((item) => item.job_id === job.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latestRun = runs[0] || null;
  const runCount = runs.length;
  const batches = store.run_batches
    .filter((item) => item.job_id === job.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const activeBatch = batches.find((item) => item.status === "running") || null;
  const archivedCount = runs.filter((run) =>
    store.archive_assets.some((asset) => asset.run_id === run.id)
  ).length;
  return {
    ...job,
    run_count: runCount,
    archived_count: archivedCount,
    batches,
    active_batch: activeBatch,
    latest_run: latestRun ? summarizeRun(store, latestRun) : null,
  };
}

function buildOverview(store) {
  const derivedClients =
    store.clients.length > 0
      ? store.clients
      : [...new Set(store.jobs.map((job) => job.client_name).filter(Boolean))].map((name) => ({
          id: `derived-client-${name}`,
          client_name: name,
          created_at: nowIso(),
          updated_at: nowIso(),
        }));

  const derivedCampaigns =
    store.campaigns.length > 0
      ? store.campaigns
      : [...new Set(store.jobs.map((job) => `${job.client_name}::${job.campaign_name || "default-campaign"}`))]
          .map((value) => {
            const [clientName, campaignName] = value.split("::");
            const client = derivedClients.find((item) => item.client_name === clientName);
            return {
              id: `derived-campaign-${value}`,
              client_id: client?.id || null,
              client_name: clientName,
              campaign_name: campaignName,
              status: "active",
              created_at: nowIso(),
              updated_at: nowIso(),
            };
          })
          .filter((item) => item.client_name);

  const derivedProjects =
    store.projects.length > 0
      ? store.projects
      : store.jobs.map((job) => ({
          id: job.project_id || `${job.client_name}::${job.project_name || job.title}::${job.collection || "core"}`,
          client_id: job.client_id || null,
          campaign_id: job.campaign_id || null,
          client_name: job.client_name,
          campaign_name: job.campaign_name || "default-campaign",
          project_name: job.project_name || job.title,
          collection: job.collection || "core",
          creative_direction: job.creative_direction || "Luxury visual workflow",
          environment: job.environment || "studio",
          created_at: job.created_at,
          updated_at: job.updated_at,
        }));

  const jobs = store.jobs.map((job) => summarizeJob(store, job));
  const runs = [...store.runs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const modeResults = store.mode_results;
  const reviewScores = store.review_scores;
  const alerts = [];

  const failedModes = modeResults.filter((item) => item.status === "failed");
  if (failedModes.length > 0) {
    alerts.push({
      level: "warning",
      code: "FAILED_MODES",
      message: `${failedModes.length} mode outputs need rerun.`,
    });
  }

  const unarchivedCanon = runs.filter((run) => {
    const hasCanon = store.canon_gate_decisions.some((item) => item.run_id === run.id);
    const hasArchive = store.archive_assets.some((item) => item.run_id === run.id);
    return hasCanon && !hasArchive;
  });

  if (unarchivedCanon.length > 0) {
    alerts.push({
      level: "info",
      code: "PENDING_ARCHIVE",
      message: `${unarchivedCanon.length} canon-approved runs pending archive.`,
    });
  }

  const costSummary = {
    total_runs: runs.length,
    estimated_total_usd: Number((runs.length * 5.4).toFixed(2)),
    avg_per_run_usd: runs.length > 0 ? Number((5.4).toFixed(2)) : 0,
  };

  const activeBatches = store.run_batches.filter((item) => item.status === "running");
  const imagesGenerated = modeResults.reduce(
    (sum, item) => sum + (Array.isArray(item.output_refs) ? item.output_refs.length : 0),
    0
  );
  const canonCandidates = reviewScores.filter((item) => item.classification === "canon_candidate").length;
  const usableAssets = reviewScores.filter((item) => item.classification === "usable_asset").length;
  const last10ArchiveRuns = store.archive_runs
    .slice()
    .sort((a, b) => Date.parse(b.date || b.updated_at || "") - Date.parse(a.date || a.updated_at || ""))
    .slice(0, 10);
  const modeWinCounts = {
    canon_core: 0,
    luminous_fan_appeal: 0,
    luxury_mystical_editorial: 0,
  };
  for (const runItem of last10ArchiveRuns) {
    if (modeWinCounts[runItem.winner_mode] !== undefined) {
      modeWinCounts[runItem.winner_mode] += 1;
    }
  }
  const topModeLast10Runs = Object.entries(modeWinCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const fanAppealAverage =
    reviewScores.length > 0
      ? Number(
          (
            reviewScores.reduce((sum, item) => sum + Number(item.visual_attraction || 0), 0) /
            reviewScores.length
          ).toFixed(2)
        )
      : 0;

  const projectDashboard = [];
  for (const project of derivedProjects) {
    const projectJobs = store.jobs.filter((item) => item.project_id === project.id);
    const projectJobIds = new Set(projectJobs.map((item) => item.id));
    const projectRuns = store.runs.filter((item) => projectJobIds.has(item.job_id));
    const projectRunIds = new Set(projectRuns.map((item) => item.id));
    const canonAssets = store.archive_assets.filter((item) => projectRunIds.has(item.run_id));
    const recentDecisions = store.canon_gate_decisions
      .filter((item) => projectRunIds.has(item.run_id))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 3);

    projectDashboard.push({
      ...project,
      active_runs: projectRuns.filter((item) => item.status !== "archived").length,
      canon_assets: canonAssets.length,
      archive_count: canonAssets.length,
      recent_review_decisions: recentDecisions,
      run_ids: projectRuns.map((item) => item.id),
    });
  }

  const recentReviewDecisions = store.canon_gate_decisions
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10)
    .map((decision) => {
      const run = store.runs.find((item) => item.id === decision.run_id) || null;
      const job = run ? store.jobs.find((item) => item.id === run.job_id) || null : null;
      return {
        ...decision,
        run,
        job,
      };
    });

  const campaignDashboard = derivedCampaigns.map((campaign) => {
    const campaignJobs = store.jobs.filter((item) => item.campaign_id === campaign.id);
    const jobIds = new Set(campaignJobs.map((item) => item.id));
    const campaignRuns = store.runs.filter((item) => jobIds.has(item.job_id));
    const runIds = new Set(campaignRuns.map((item) => item.id));
    const archivedAssets = store.archive_assets.filter((item) => runIds.has(item.run_id));
    return {
      ...campaign,
      projects: derivedProjects.filter((item) => item.campaign_id === campaign.id).length,
      jobs: campaignJobs.length,
      runs: campaignRuns.length,
      archived_assets: archivedAssets.length,
    };
  });

  return {
    metrics: {
      clients_total: derivedClients.length,
      campaigns_total: derivedCampaigns.length,
      jobs_total: jobs.length,
      total_runs: runs.length,
      jobs_active: jobs.filter((job) => String(job.status) !== "archived").length,
      runs_total: runs.length,
      images_generated: imagesGenerated,
      canon_candidates: canonCandidates,
      usable_assets: usableAssets,
      top_mode_last_10_runs: topModeLast10Runs,
      archive_assets_total: store.archive_assets.length,
      proof_sets_total: store.proof_sets.length,
      active_batches_total: activeBatches.length,
      mode_success_total: modeResults.filter((item) => item.status === "succeeded").length,
      mode_failed_total: failedModes.length,
    },
    cost_summary: costSummary,
    recent_runs: runs.slice(0, 10).map((run) => summarizeRun(store, run)),
    clients: derivedClients,
    campaigns: derivedCampaigns,
    campaign_dashboard: campaignDashboard,
    project_dashboard: projectDashboard,
    dashboard_charts: {
      mode_win_rate: {
        canon_core: modeWinCounts.canon_core,
        luminous_fan_appeal: modeWinCounts.luminous_fan_appeal,
        luxury_mystical_editorial: modeWinCounts.luxury_mystical_editorial,
      },
      average_fan_appeal_score: fanAppealAverage,
    },
    recent_review_decisions: recentReviewDecisions,
    active_batches: activeBatches,
    alerts,
    jobs: jobs.slice(0, 20),
  };
}

async function seedDemoStore(store) {
  if (store.jobs.length > 0 || store.runs.length > 0) return store;

  const demoRuns = await readDemoFile("studio-data/demo/mikage-demo-run.json", "runs");
  const demoArchiveAssets = await readDemoFile("studio-data/demo/archive-assets.json", "archive_assets");

  if (demoRuns.length > 0) {
    const generatedStore = {
      ...store,
      clients: [],
      campaigns: [],
      projects: [],
      intake_briefs: [],
      jobs: [],
      runs: [],
      run_batches: [],
      mode_jobs: [],
      job_plans: [],
      compiled_prompts: [],
      mode_results: [],
      review_sheets: [],
      review_scores: [],
      canon_gate_decisions: [],
      archive_assets: [],
      archive_runs: [],
      proof_sets: [],
      lineage_metadata: [],
    };

    for (const item of demoRuns) {
      const createdAt = toText(item?.created_at, 80) || nowIso();
      const briefId = randomUUID();
      const jobId = randomUUID();
      const runId = randomUUID();
      const projectTitle = toText(item?.project_title, 140) || "Mikage Demo Project";
      const clientName = toText(item?.client_name, 120) || "Mikage Demo Client";
      const campaignName = toText(item?.campaign_name, 120) || "launch-wave-a";
      const seeds = modeSeedMap(Number(item?.canon_seed || 220114));

      const brief = {
        id: briefId,
        project_title: projectTitle,
        client_name: clientName,
        campaign_name: campaignName,
        creative_brief:
          toText(item?.creative_brief, 2000) ||
          "Demo brief for first-load operator understanding of Mikage workflow.",
        restrictions: Array.isArray(item?.restrictions)
          ? item.restrictions.map((entry) => toText(entry, 200)).filter(Boolean)
          : ["no watermark", "no anatomy distortion"],
        preset: toText(item?.preset, 120) || "mikage-porcelain-canon",
        archetype: toText(item?.archetype, 120) || "the-porcelain-muse",
        collection: toText(item?.collection, 120) || "core",
        creative_direction: toText(item?.creative_direction, 220) || "Luxury visual workflow",
        environment: toText(item?.environment, 120) || "studio",
        created_at: createdAt,
      };

      const client = upsertClient(generatedStore, {
        client_name: brief.client_name,
      });
      const campaign = upsertCampaign(generatedStore, {
        client_id: client?.id,
        campaign_name: brief.campaign_name,
      });

      const project = upsertProject(generatedStore, {
        client_id: client?.id,
        campaign_id: campaign?.id,
        client_name: brief.client_name,
        campaign_name: brief.campaign_name,
        project_title: brief.project_title,
        collection: brief.collection,
        creative_direction: brief.creative_direction,
        environment: brief.environment,
      });

      const job = {
        id: jobId,
        brief_id: briefId,
        client_id: client?.id || null,
        campaign_id: campaign?.id || null,
        project_id: project.id,
        title: projectTitle,
        project_name: projectTitle,
        client_name: clientName,
        campaign_name: campaignName,
        collection: brief.collection,
        creative_direction: brief.creative_direction,
        environment: brief.environment,
        status: toText(item?.job_status, 80) || "review",
        workflow_stage: toText(item?.workflow_stage, 80) || "Review",
        controller_state: {
          brief: "compiled",
          review: "pending",
          canon_decision: "pending",
          archive: "pending",
        },
        created_at: createdAt,
        updated_at: createdAt,
      };

      const run = {
        id: runId,
        job_id: jobId,
        client_id: client?.id || null,
        campaign_id: campaign?.id || null,
        project_id: project.id,
        client_name: clientName,
        campaign_name: campaignName,
        project_name: projectTitle,
        collection: brief.collection,
        creative_direction: brief.creative_direction,
        environment: brief.environment,
        stage: toText(item?.stage, 80) || "Review",
        status: toText(item?.status, 80) || "ready_for_review",
        mode_seed_policy: {
          canon_core: "lock",
          luminous_fan_appeal: "reuse canon",
          luxury_mystical_editorial: "independent",
        },
        created_at: createdAt,
        updated_at: createdAt,
      };

      const modeResults = MODE_DEFS.map((def) =>
        toSeededModeResult({ runId, mode: def.mode, seed: seeds[def.mode] })
      );

      const reviewSheet = {
        ...buildReviewTemplate(runId),
        operator_notes: toText(item?.review_notes, 2400) || "Demo review sheet loaded.",
        qc: {
          fidelity: "pass",
          luxury_signal: "pass",
          brand_fit: "pass",
          technical_cleanliness: "pass",
        },
        scored_modes: [
          { mode: "canon_core", score: 91 },
          { mode: "luminous_fan_appeal", score: 85 },
          { mode: "luxury_mystical_editorial", score: 88 },
        ],
        next_action: "canon_gate",
        updated_at: createdAt,
      };

      generatedStore.intake_briefs.push(brief);
      generatedStore.jobs.push(job);
      generatedStore.runs.push(run);
      generatedStore.mode_results.push(...modeResults);
      generatedStore.review_sheets.push(reviewSheet);
      generatedStore.lineage_metadata.push({
        id: randomUUID(),
        run_id: runId,
        job_id: jobId,
        brief_id: briefId,
        archive_asset_id: null,
        proof_set_id: null,
        created_at: createdAt,
      });
    }

    for (const item of demoArchiveAssets) {
      const targetRun = generatedStore.runs[0];
      const targetJob = targetRun
        ? generatedStore.jobs.find((job) => job.id === targetRun.job_id)
        : generatedStore.jobs[0];
      if (!targetRun || !targetJob) break;

      const archiveAsset = {
        id: randomUUID(),
        run_id: targetRun.id,
        job_id: targetJob.id,
        client_id: targetJob.client_id || null,
        campaign_id: targetJob.campaign_id || null,
        campaign_name: targetJob.campaign_name || "default-campaign",
        client_name: toText(item?.client_name, 120) || targetJob.client_name,
        project_title: toText(item?.project_title, 140) || targetJob.title,
        project_name: toText(item?.project_title, 140) || targetJob.project_name || targetJob.title,
        collection: targetJob.collection || "core",
        selected_mode: toText(item?.selected_mode, 120) || "canon_core",
        selected_output_id:
          generatedStore.mode_results.find(
            (modeItem) => modeItem.run_id === targetRun.id && modeItem.mode === "canon_core"
          )?.output_refs?.[0]?.id || null,
        proof_worthy: item?.proof_worthy !== false,
        lineage_note: toText(item?.lineage_note, 400) || "demo archive lineage",
        asset_intelligence: {
          mode: toText(item?.selected_mode, 120) || "canon_core",
          seed: generatedStore.mode_results.find(
            (modeItem) => modeItem.run_id === targetRun.id && modeItem.mode === "canon_core"
          )?.seed,
          preset: targetJob.preset || "mikage-porcelain-canon",
          environment: targetJob.environment || "studio",
          visual_theme: targetJob.creative_direction || "Luxury visual workflow",
          generation_params: generatedStore.mode_results.find(
            (modeItem) => modeItem.run_id === targetRun.id && modeItem.mode === "canon_core"
          )?.generation_params || null,
          ...computeAssetIntelligenceScores({
            seed: generatedStore.mode_results.find(
              (modeItem) => modeItem.run_id === targetRun.id && modeItem.mode === "canon_core"
            )?.seed,
            mode: toText(item?.selected_mode, 120) || "canon_core",
            visualTheme: targetJob.creative_direction || "Luxury visual workflow",
          }),
        },
        archived_at: toText(item?.archived_at, 80) || nowIso(),
      };

      generatedStore.archive_assets.push(archiveAsset);
      generatedStore.canon_gate_decisions.push({
        id: randomUUID(),
        run_id: targetRun.id,
        selected_mode: archiveAsset.selected_mode,
        selected_output_id: archiveAsset.selected_output_id,
        rationale: "Demo canon decision",
        approved_by: "demo.operator",
        created_at: archiveAsset.archived_at,
      });
      generatedStore.proof_sets.push({
        id: randomUUID(),
        archive_asset_id: archiveAsset.id,
        run_id: targetRun.id,
        case_study_title: `${archiveAsset.project_title} Proof Set`,
        export_status: "ready",
        created_at: archiveAsset.archived_at,
      });
      const lineage = generatedStore.lineage_metadata.find((line) => line.run_id === targetRun.id);
      if (lineage) {
        lineage.archive_asset_id = archiveAsset.id;
      }
      targetRun.status = "archived";
      targetRun.stage = "Archive";
      targetRun.updated_at = archiveAsset.archived_at;
      targetJob.status = "archived";
      targetJob.workflow_stage = "Archive";
      targetJob.updated_at = archiveAsset.archived_at;
    }

    return generatedStore;
  }

  const createdAt = nowIso();
  const briefId = randomUUID();
  const jobId = randomUUID();
  const runId = randomUUID();
  const seeds = modeSeedMap(220114);

  const brief = {
    id: briefId,
    project_title: "Mikage Zenith Visual Exploration",
    client_name: "MIKAGE ZENITH",
    campaign_name: "launch-wave-a",
    creative_brief: "THE PORCELAIN MUSE visual production cycle for launch-ready editorial output.",
    restrictions: [
      "no distorted anatomy",
      "no watermark",
      "maintain porcelain muse identity",
    ],
    preset: "mikage-porcelain-canon",
    archetype: "the-porcelain-muse",
    collection: "core",
    creative_direction: "Luxury visual workflow",
    environment: "studio",
    created_at: createdAt,
  };

  const client = upsertClient(store, {
    client_name: brief.client_name,
  });
  const campaign = upsertCampaign(store, {
    client_id: client?.id,
    campaign_name: brief.campaign_name,
  });

  const project = upsertProject(store, {
    client_id: client?.id,
    campaign_id: campaign?.id,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    project_title: brief.project_title,
    collection: brief.collection,
    creative_direction: brief.creative_direction,
    environment: brief.environment,
  });

  const job = {
    id: jobId,
    brief_id: briefId,
    client_id: client?.id || null,
    campaign_id: campaign?.id || null,
    project_id: project.id,
    title: brief.project_title,
    project_name: brief.project_title,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    collection: brief.collection,
    creative_direction: brief.creative_direction,
    environment: brief.environment,
    status: "review",
    workflow_stage: "Review",
    controller_state: {
      brief: "compiled",
      review: "pending",
      canon_decision: "pending",
      archive: "pending",
    },
    created_at: createdAt,
    updated_at: createdAt,
  };

  const run = {
    id: runId,
    job_id: jobId,
    client_id: client?.id || null,
    campaign_id: campaign?.id || null,
    project_id: project.id,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    project_name: brief.project_title,
    collection: brief.collection,
    creative_direction: brief.creative_direction,
    environment: brief.environment,
    stage: "Review",
    status: "ready_for_review",
    mode_seed_policy: {
      canon_core: "lock",
      luminous_fan_appeal: "reuse canon",
      luxury_mystical_editorial: "independent",
    },
    created_at: createdAt,
    updated_at: createdAt,
  };

  const modeResults = MODE_DEFS.map((def) =>
    toSeededModeResult({ runId, mode: def.mode, seed: seeds[def.mode] })
  );

  const reviewSheet = {
    ...buildReviewTemplate(runId),
    operator_notes: "Seeded run for operator onboarding. Ready for canon gate selection.",
    qc: {
      fidelity: "pass",
      luxury_signal: "pass",
      brand_fit: "pass",
      technical_cleanliness: "pass",
    },
    scored_modes: [
      { mode: "canon_core", score: 92 },
      { mode: "luminous_fan_appeal", score: 84 },
      { mode: "luxury_mystical_editorial", score: 89 },
    ],
    next_action: "canon_gate",
    updated_at: createdAt,
  };

  const canonDecision = {
    id: randomUUID(),
    run_id: runId,
    selected_mode: "canon_core",
    selected_output_id: modeResults[0]?.output_refs?.[0]?.id || null,
    rationale: "Canon fidelity and luxury signal scored highest for launch baseline.",
    approved_by: "seed.operator",
    created_at: createdAt,
  };

  const archiveAsset = {
    id: randomUUID(),
    run_id: runId,
    job_id: jobId,
    client_id: client?.id || null,
    campaign_id: campaign?.id || null,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    project_title: brief.project_title,
    project_name: brief.project_title,
    collection: brief.collection,
    selected_mode: canonDecision.selected_mode,
    selected_output_id: canonDecision.selected_output_id,
    proof_worthy: true,
    asset_intelligence: {
      mode: canonDecision.selected_mode,
      seed: modeResults[0]?.seed,
      preset: brief.preset,
      environment: brief.environment,
      visual_theme: brief.creative_direction,
      generation_params: modeResults[0]?.generation_params || null,
      ...computeAssetIntelligenceScores({
        seed: modeResults[0]?.seed,
        mode: canonDecision.selected_mode,
        visualTheme: brief.creative_direction,
      }),
    },
    archived_at: createdAt,
  };

  const proofSet = {
    id: randomUUID(),
    archive_asset_id: archiveAsset.id,
    run_id: runId,
    case_study_title: "The Porcelain Muse Canon Exploration",
    export_status: "ready",
    created_at: createdAt,
  };

  const lineage = {
    id: randomUUID(),
    run_id: runId,
    job_id: jobId,
    brief_id: briefId,
    archive_asset_id: archiveAsset.id,
    proof_set_id: proofSet.id,
    created_at: createdAt,
  };

  return {
    ...store,
    clients: [client],
    campaigns: [campaign],
    projects: [project],
    intake_briefs: [brief],
    jobs: [job],
    runs: [run],
    run_batches: [],
    mode_jobs: [],
    job_plans: [],
    compiled_prompts: [],
    mode_results: modeResults,
    review_sheets: [reviewSheet],
    review_scores: [],
    canon_gate_decisions: [canonDecision],
    archive_assets: [archiveAsset],
    archive_runs: [],
    proof_sets: [proofSet],
    lineage_metadata: [lineage],
  };
}

export async function initializeMikageWorkflowStore() {
  const store = await readStore();
  const seeded = await ensureJapaneseArtGrammarSeed(await seedDemoStore(store));
  if (JSON.stringify(store) !== JSON.stringify(seeded)) {
    await writeStore(seeded);
  }
}

export async function rerunMikagePipeline(runId, { actor = "operator" } = {}) {
  const store = await readStore();
  const sourceRun = store.runs.find((item) => item.id === String(runId || ""));
  if (!sourceRun) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const sourceJob = store.jobs.find((item) => item.id === sourceRun.job_id);
  if (!sourceJob) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const sourceBrief = store.intake_briefs.find((item) => item.id === sourceJob.brief_id);
  if (!sourceBrief) {
    const error = new Error("Intake brief not found");
    error.status = 404;
    throw error;
  }

  const created = await createMikageJob({
    project_title: sourceBrief.project_title,
    client_name: sourceBrief.client_name,
    campaign_name: sourceBrief.campaign_name,
    collection: sourceBrief.collection,
    creative_direction: sourceBrief.creative_direction,
    environment: sourceBrief.environment,
    creative_brief: sourceBrief.creative_brief,
    restrictions: sourceBrief.restrictions,
    preset: sourceBrief.preset,
    archetype: sourceBrief.archetype,
  });

  const run = await runMikageThreeModes(created.job.id, { actor });

  const latestStore = await readStore();
  const lineage = latestStore.lineage_metadata.find((item) => item.run_id === run.id);
  if (lineage) {
    lineage.parent_run_id = sourceRun.id;
    lineage.parent_job_id = sourceJob.id;
    lineage.rerun_mode = "pipeline";
    await writeStore(latestStore);
  }

  return {
    actor,
    source_run_id: sourceRun.id,
    source_job_id: sourceJob.id,
    job: created.job,
    run: await getMikageRunById(run.id),
  };
}

export async function getMikageOverview() {
  const store = await readStore();
  return buildOverview(store);
}

export async function getMikageControlRoom(projectId = "") {
  const store = await readStore();
  const targetProjectId = toText(projectId, 120);
  const project =
    store.projects.find((item) => item.id === targetProjectId) ||
    store.projects[0] ||
    null;
  if (!project) {
    return {
      objective: null,
      context: null,
      modes: [...DEFAULT_MIKAGE_MODES],
      compiled_prompts: [],
      params: [],
      batch_status: null,
      review_summary: null,
      winner_mode: null,
      next_run_recommendation: null,
      archive_outcome: null,
    };
  }

  const projectJobs = store.jobs.filter((item) => item.project_id === project.id);
  const jobIds = new Set(projectJobs.map((item) => item.id));
  const runs = store.runs
    .filter((item) => jobIds.has(item.job_id))
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
  const latestRun = runs[0] || null;
  const latestJob = latestRun
    ? store.jobs.find((item) => item.id === latestRun.job_id) || null
    : projectJobs.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))[0] || null;
  const latestPlan = store.job_plans
    .filter((item) => item.project_id === project.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
  const latestCompiled = latestPlan
    ? store.compiled_prompts.filter((item) => item.job_plan_id === latestPlan.id)
    : latestRun
    ? store.compiled_prompts.filter((item) => item.run_id === latestRun.id)
    : [];
  const latestBatch = latestRun?.batch_id
    ? store.run_batches.find((item) => item.id === latestRun.batch_id) || null
    : null;
  const reviewScore = latestRun
    ? store.review_scores.find((item) => item.run_id === latestRun.id) || null
    : null;
  const decision = latestRun
    ? store.canon_gate_decisions.find((item) => item.run_id === latestRun.id) || null
    : null;
  const archiveOutcome = latestRun
    ? store.archive_runs.find((item) => item.run_id === latestRun.id) || null
    : null;
  const latestAsset = latestRun
    ? store.archive_assets.find((item) => item.run_id === latestRun.id) || null
    : null;
  const brief = latestJob
    ? store.intake_briefs.find((item) => item.id === latestJob.brief_id) || null
    : null;

  return {
    objective: latestPlan?.run_objective || brief?.creative_brief || latestJob?.title || null,
    context: {
      project,
      character: brief?.archetype || "the-porcelain-muse",
      campaign: latestJob?.campaign_name || project.campaign_name || "default-campaign",
      client: latestJob?.client_name || project.client_name,
    },
    modes: latestPlan?.modes || [...DEFAULT_MIKAGE_MODES],
    compiled_prompts: latestCompiled,
    params:
      latestRun
        ? store.mode_results
            .filter((item) => item.run_id === latestRun.id)
            .map((item) => ({
              mode: item.mode,
              sampler: item.generation_params?.sampler,
              steps: item.generation_params?.steps,
              cfg: item.generation_params?.cfg,
              seed: item.seed,
              output_goal:
                latestCompiled.find((row) => row.mode === item.mode)?.output_goal ||
                "Production validation",
            }))
        : [],
    batch_status: latestBatch || (latestRun ? { id: latestRun.batch_id, status: latestRun.status } : null),
    review_summary: reviewScore,
    winner_mode: decision?.selected_mode || archiveOutcome?.winner_mode || null,
    next_run_recommendation:
      archiveOutcome?.next_run_recommendation ||
      latestPlan?.constraints?.[0] ||
      "Review top candidate and schedule next controlled run.",
    archive_outcome: archiveOutcome
      ? {
          ...archiveOutcome,
          featured_asset: latestAsset,
        }
      : null,
    latest_run_id: latestRun?.id || null,
  };
}

export async function listMikageCanonAssets(filters = {}) {
  const store = await readStore();
  const project = toText(filters.project, 180).toLowerCase();
  const character = toText(filters.character, 120).toLowerCase();
  const mode = toText(filters.mode, 120);
  const outputGoal = toText(filters.output_goal, 220).toLowerCase();
  const canonStatus = toText(filters.canon_status, 120).toLowerCase();
  const score = Number(filters.score || 0);
  const dateFrom = toText(filters.date_from, 80);
  const dateTo = toText(filters.date_to, 80);
  const sortBy = toText(filters.sort, 120).toLowerCase();
  const fromMs = dateFrom ? Date.parse(dateFrom) : null;
  const toMs = dateTo ? Date.parse(dateTo) : null;

  const canonSource =
    store.canon_assets.length > 0
      ? store.canon_assets
          .map((entry) => {
            const sourceAsset = store.archive_assets.find((asset) => asset.id === entry.archive_asset_id);
            return sourceAsset || null;
          })
          .filter(Boolean)
      : store.archive_assets.filter(
          (asset) =>
            String(asset.canon_status || asset.classification || "") === "canon_candidate"
        );

  const mapped = canonSource.map((asset) => {
    const run = store.runs.find((item) => item.id === asset.run_id) || null;
    const modeResult = run
      ? store.mode_results.find((item) => item.run_id === run.id && item.mode === asset.selected_mode) || null
      : null;
    const review = run
      ? store.review_scores.find((item) => item.run_id === run.id) || null
      : null;
    const siblings = run
      ? store.mode_results
          .filter((item) => item.run_id === run.id)
          .flatMap((item) =>
            (item.output_refs || []).map((output) => ({
              id: output.id,
              mode: item.mode,
              preview_url: output.preview_url,
              preview_data_url: output.preview_data_url,
            }))
          )
      : [];

    return {
      ...asset,
      score_total: Number(review?.total_score || 0),
      fan_appeal_score: Number(review?.visual_attraction || 0),
      canon_status:
        toText(asset.canon_status, 120) ||
        review?.classification ||
        (asset.proof_worthy ? "canon_candidate" : "interesting_but_non_canon"),
      output_goal:
        toText(
          store.compiled_prompts.find((item) => item.run_id === run?.id && item.mode === asset.selected_mode)
            ?.output_goal,
          220
        ) || "Production validation",
      prompt_lineage: {
        positive_prompt: modeResult?.prompt || "",
        negative_prompt: modeResult?.negative_prompt || "",
      },
      seed: modeResult?.seed ?? null,
      params: modeResult?.generation_params || null,
      archive_source_run_id: run?.id || asset.run_id,
      sibling_outputs: siblings,
      mode_result: modeResult,
      review_score: review,
    };
  });

  const filtered = mapped.filter((item) => {
    if (project && !String(item.project_title || "").toLowerCase().includes(project)) return false;
    if (character && !String(item.character || "").toLowerCase().includes(character)) return false;
    if (mode && item.selected_mode !== mode) return false;
    if (outputGoal && !String(item.output_goal || "").toLowerCase().includes(outputGoal)) return false;
    if (canonStatus && !String(item.canon_status || "").toLowerCase().includes(canonStatus)) return false;
    if (score > 0 && Number(item.score_total || 0) < score) return false;
    const archivedMs = Date.parse(String(item.archived_at || ""));
    if (Number.isFinite(fromMs) && Number.isFinite(archivedMs) && archivedMs < fromMs) return false;
    if (Number.isFinite(toMs) && Number.isFinite(archivedMs) && archivedMs > toMs) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sortBy === "best_score") return Number(b.score_total || 0) - Number(a.score_total || 0);
    if (sortBy === "most_reused") return Number(b.reuse_count || 0) - Number(a.reuse_count || 0);
    if (sortBy === "top_fan_appeal") return Number(b.fan_appeal_score || 0) - Number(a.fan_appeal_score || 0);
    return Date.parse(String(b.archived_at || "")) - Date.parse(String(a.archived_at || ""));
  });
}

export async function updateMikageCanonAsset(assetId, input = {}) {
  const store = await readStore();
  const asset = store.archive_assets.find((item) => item.id === String(assetId || ""));
  if (!asset) {
    const error = new Error("Asset not found");
    error.status = 404;
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(input, "featured")) {
    asset.featured = Boolean(input.featured);
  }
  asset.reason_kept = toText(input.reason_kept, 1000) || asset.reason_kept || "";
  if (Object.prototype.hasOwnProperty.call(input, "canon_status")) {
    asset.canon_status = normalizeClassificationValue(input.canon_status, {
      fallback: asset.canon_status || "interesting_but_non_canon",
      fieldName: "canon_status",
      rejectInvalid: true,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, "classification")) {
    asset.classification = normalizeClassificationValue(input.classification, {
      fallback: asset.classification || asset.canon_status || "interesting_but_non_canon",
      fieldName: "classification",
      rejectInvalid: true,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, "review_decision")) {
    asset.review_decision = toText(input.review_decision, 40) || asset.review_decision || "keep";
  }
  if (Object.prototype.hasOwnProperty.call(input, "fan_appeal_score")) {
    const nextScore = Number(input.fan_appeal_score);
    asset.fan_appeal_score = Number.isFinite(nextScore)
      ? Math.max(0, Math.min(10, nextScore))
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "canon_id")) {
    asset.canon_id = toText(input.canon_id, 120) || asset.canon_id || "";
  }
  asset.tags = Array.isArray(input.tags)
    ? input.tags.map((item) => toText(item, 80)).filter(Boolean).slice(0, 16)
    : asset.tags || [];
  asset.reuse_notes = toText(input.reuse_notes, 1000) || asset.reuse_notes || "";
  asset.usage_target = toText(input.usage_target, 180) || asset.usage_target || "";
  if (Object.prototype.hasOwnProperty.call(input, "reuse_count")) {
    asset.reuse_count = Math.max(0, Number(input.reuse_count || 0));
  }

  const runReview = store.review_scores.find((item) => item.run_id === asset.run_id) || null;
  const resolvedClass = normalizeClassificationValue(
    toText(asset.classification, 120) ||
      toText(asset.canon_status, 120) ||
      toText(runReview?.classification, 120),
    {
      fallback: "interesting_but_non_canon",
    }
  );
  asset.classification = resolvedClass;
  asset.canon_status = normalizeClassificationValue(asset.canon_status, {
    fallback: resolvedClass,
  });
  if (resolvedClass === "canon_candidate") {
    upsertCanonAssetRecord(store, asset, runReview);
  } else {
    removeCanonAssetRecord(store, asset.id);
  }

  await writeStore(store);
  return asset;
}

export async function listMikageReferences(filters = {}) {
  const store = await readStore();
  const palette = toText(filters.palette, 120).toLowerCase();
  const mood = toText(filters.mood, 120).toLowerCase();
  const culture = toText(filters.culture, 120).toLowerCase();
  const lighting = toText(filters.lighting, 120).toLowerCase();
  const texture = toText(filters.texture, 120).toLowerCase();
  const q = toText(filters.search, 240).toLowerCase();

  return store.reference_library
    .filter((item) => {
      if (palette && !String(item.palette || "").toLowerCase().includes(palette)) return false;
      if (mood && !String(item.mood || "").toLowerCase().includes(mood)) return false;
      if (culture && !String(item.culture || "").toLowerCase().includes(culture)) return false;
      if (lighting && !String(item.lighting || "").toLowerCase().includes(lighting)) return false;
      if (texture && !String(item.texture || "").toLowerCase().includes(texture)) return false;
      if (q) {
        const hay = [item.title, item.artist_name, item.notes, ...(item.tags || [])]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
}

export async function upsertMikageReference(input = {}) {
  const store = await readStore();
  const id = toText(input.reference_id || input.id, 120);
  const now = nowIso();
  const existing = id ? store.reference_library.find((item) => item.reference_id === id || item.id === id) : null;
  const reference = existing || {
    id: randomUUID(),
    reference_id: id || randomUUID(),
    created_at: now,
  };

  reference.title = toText(input.title, 180) || reference.title || "Untitled Reference";
  reference.source_url = toText(input.source_url, 1200) || "";
  reference.artist_name = toText(input.artist_name, 160) || "";
  reference.movement = toText(input.movement, 120) || "";
  reference.culture = toText(input.culture, 120) || "";
  reference.period = toText(input.period, 120) || "";
  reference.palette = toText(input.palette, 240) || "";
  reference.lighting = toText(input.lighting, 240) || "";
  reference.texture = toText(input.texture, 240) || "";
  reference.composition = toText(input.composition, 240) || "";
  reference.mood = toText(input.mood, 240) || "";
  reference.notes = toText(input.notes, 2000) || "";
  reference.tags = Array.isArray(input.tags)
    ? input.tags.map((item) => toText(item, 80)).filter(Boolean).slice(0, 16)
    : reference.tags || [];
  reference.updated_at = now;

  if (!existing) {
    store.reference_library.push(reference);
  }

  await writeStore(store);
  return reference;
}

export async function createMikagePresetFromReference(referenceId, input = {}) {
  const store = await readStore();
  const reference = store.reference_library.find(
    (item) => item.reference_id === String(referenceId || "") || item.id === String(referenceId || "")
  );
  if (!reference) {
    const error = new Error("Reference not found");
    error.status = 404;
    throw error;
  }

  const preset = {
    id: randomUUID(),
    reference_id: reference.reference_id || reference.id,
    title: toText(input.title, 180) || `${reference.title} Preset`,
    preset_seed:
      toText(input.preset_seed, 2400) ||
      [
        `palette: ${reference.palette || "n/a"}`,
        `lighting: ${reference.lighting || "n/a"}`,
        `texture: ${reference.texture || "n/a"}`,
        `composition: ${reference.composition || "n/a"}`,
        `mood: ${reference.mood || "n/a"}`,
      ].join(" | "),
    created_at: nowIso(),
  };

  store.reference_presets.push(preset);
  await writeStore(store);
  return {
    preset,
    reference,
  };
}

export async function upsertMikageReferenceStyle(input = {}) {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const key = toText(input.reference_style_id || input.id, 120) || randomUUID();
  const now = nowIso();
  const existing = store.reference_styles.find(
    (item) => item.reference_style_id === key || item.id === key
  );
  const style = existing || {
    id: randomUUID(),
    reference_style_id: key,
    created_at: now,
  };
  style.title = toText(input.title, 180) || style.title || "Untitled Reference Style";
  style.movement_lineage =
    toText(input.movement_lineage, 500) || style.movement_lineage || "";
  style.description = toText(input.description, 2000) || style.description || "";
  style.updated_at = now;
  if (!existing) {
    store.reference_styles.push(style);
  }
  await writeStore(store);
  return style;
}

export async function addMikageReferenceStyleBlocks(referenceStyleId, input = {}) {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const style = store.reference_styles.find(
    (item) =>
      item.reference_style_id === String(referenceStyleId || "") ||
      item.id === String(referenceStyleId || "")
  );
  if (!style) {
    const error = new Error("Reference style not found");
    error.status = 404;
    throw error;
  }

  const rows = Array.isArray(input.blocks) ? input.blocks : [];
  const created = rows
    .map((item) => {
      const blockType = toText(item?.block_type, 120);
      const content = toText(item?.content, 4000);
      if (!blockType || !content) return null;
      return {
        id: randomUUID(),
        reference_style_id: style.reference_style_id,
        block_type: blockType,
        label: toText(item?.label, 180) || blockType,
        content,
        tags: Array.isArray(item?.tags)
          ? item.tags.map((tag) => toText(tag, 80)).filter(Boolean)
          : [],
        created_at: nowIso(),
      };
    })
    .filter(Boolean);

  store.reference_grammar_blocks.push(...created);
  await writeStore(store);
  return created;
}

export async function listMikageStudioPresets() {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const variants = store.preset_variants;
  return store.studio_presets
    .map((preset) => ({
      ...preset,
      variants,
    }))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

export async function getMikageReferenceStyleById(styleId) {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const target = String(styleId || "");
  const style = store.reference_styles.find(
    (item) => item.id === target || item.reference_style_id === target
  );
  if (!style) return null;
  const blocks = store.reference_grammar_blocks.filter(
    (item) => item.reference_style_id === style.reference_style_id
  );
  const presets = store.studio_presets.filter(
    (item) => item.reference_style_id === style.reference_style_id
  );
  return {
    ...style,
    blocks,
    presets,
    variants: store.preset_variants,
    objective_overrides: store.objective_overrides,
    compiled_prompt_rules: store.compiled_prompt_rules,
  };
}

export async function createMikagePresetFromReferenceStyle(input = {}) {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const referenceStyleId = toText(input.reference_style_id, 120);
  const style = store.reference_styles.find(
    (item) =>
      item.reference_style_id === referenceStyleId || item.id === referenceStyleId
  );
  if (!style) {
    const error = new Error("Reference style not found");
    error.status = 404;
    throw error;
  }

  const base = store.studio_presets.find(
    (item) => item.preset_key === toText(input.base_preset_key, 120)
  );
  const presetKey = toText(input.preset_key, 120) || `preset_${randomUUID().slice(0, 8)}`;
  const now = nowIso();
  const preset = {
    id: randomUUID(),
    preset_key: presetKey,
    title: toText(input.title, 180) || `${style.title} Preset`,
    reference_style_id: style.reference_style_id,
    composition: toText(input.composition, 600) || base?.composition || "",
    subject_rule: toText(input.subject_rule, 700) || base?.subject_rule || "",
    linework: toText(input.linework, 600) || base?.linework || "",
    color_system: toText(input.color_system, 600) || base?.color_system || "",
    material: toText(input.material, 600) || base?.material || "",
    motif: toText(input.motif, 600) || base?.motif || "",
    character: toText(input.character, 600) || base?.character || "",
    fashion: toText(input.fashion, 600) || base?.fashion || "",
    decorative: toText(input.decorative, 600) || base?.decorative || "",
    mood: toText(input.mood, 600) || base?.mood || "",
    negative_template: toText(input.negative_template, 2000) || base?.negative_template || "",
    sampler: toText(input.sampler, 120) || base?.sampler || "dpmpp_2m",
    steps: Number.isFinite(Number(input.steps)) ? Number(input.steps) : Number(base?.steps || 32),
    cfg: Number.isFinite(Number(input.cfg)) ? Number(input.cfg) : Number(base?.cfg || 6.5),
    aspect_ratio: toText(input.aspect_ratio, 40) || base?.aspect_ratio || "3:4",
    created_at: now,
    updated_at: now,
  };
  store.studio_presets.push(preset);
  await writeStore(store);
  return {
    preset,
    reference_style: style,
  };
}

export async function compileMikagePromptRecipe(input = {}) {
  const store = await ensureJapaneseArtGrammarSeed(await readStore());
  const presetKey = toText(input.preset_key, 120);
  const variantKey = toText(input.variant_key, 120) || "canon_core";
  const objective = toText(input.objective, 120) || "key_visual";
  const preset = store.studio_presets.find(
    (item) => item.preset_key === presetKey || item.id === presetKey
  );
  if (!preset) {
    const error = new Error("Preset not found");
    error.status = 404;
    throw error;
  }

  const variant =
    store.preset_variants.find((item) => item.variant_key === variantKey) ||
    store.preset_variants.find((item) => item.variant_key === "canon_core") ||
    {
      variant_key: "canon_core",
      positive_delta: VARIANT_DELTAS.canon_core.positive_delta,
      negative_delta: VARIANT_DELTAS.canon_core.negative_delta,
    };

  const objectiveConfig = store.objective_overrides.find(
    (item) => item.objective_key === objective
  );
  const objectiveText =
    toText(input.objective_override, 500) ||
    objectiveConfig?.override_text ||
    OBJECTIVE_TEMPLATES[objective] ||
    OBJECTIVE_TEMPLATES.key_visual;

  const subjectRule =
    toText(input.subject, 500) ||
    toText(preset.subject_rule, 700) ||
    toText(preset.character, 600);
  const subjectOverride = toText(input.subject_override, 500);
  let compositionRule = toText(input.composition, 600) || toText(preset.composition, 600);
  const lineworkRule = toText(input.linework, 600) || toText(preset.linework, 600);
  const colorRule = toText(input.color, 600) || toText(preset.color_system, 600);
  const materialRule = toText(input.material, 600) || toText(preset.material, 600);
  let motifRule = toText(input.motif, 600) || toText(preset.motif, 600);
  const wardrobeRule = toText(input.wardrobe, 600) || toText(preset.fashion, 600);
  let moodRule = toText(input.mood, 600) || toText(preset.mood, 600);
  let decorativeRule = toText(input.decorative, 600) || toText(preset.decorative, 600);
  const variantPromptAppend = toText(variant.positive_delta, 1200);

  // Preserve required style logic per preset, objective, and variant.
  if (preset.preset_key === "bijin_ga_elegant_women") {
    const hairKimonoGuardrail = "preserve shimada bun silhouette and kimono elegance";
    motifRule = [motifRule, hairKimonoGuardrail].filter(Boolean).join(", ");
  }
  if (preset.preset_key === "edo_manga_hybrid") {
    const hybridGuardrail = "allow clean digital ink and modern readability while preserving Edo grammar";
    compositionRule = [compositionRule, hybridGuardrail].filter(Boolean).join(", ");
  }
  if (objective === "poster") {
    compositionRule = [compositionRule, "force strong focal hierarchy"].filter(Boolean).join(", ");
  }
  if (objective === "lore_scene") {
    motifRule = [motifRule, "increase motif density"].filter(Boolean).join(", ");
  }
  if (variant.variant_key === "canon_core") {
    moodRule = [moodRule, "reduce modern drift"].filter(Boolean).join(", ");
  }
  if (variant.variant_key === "luminous_fan_appeal") {
    moodRule = [moodRule, "boost silhouette attraction without breaking Edo base"].filter(Boolean).join(", ");
  }
  if (variant.variant_key === "luxury_mystical_editorial") {
    decorativeRule = [decorativeRule, "increase ornamental refinement and premium mood"].filter(Boolean).join(", ");
  }

  const positiveParts = [
    subjectRule,
    compositionRule,
    lineworkRule,
    colorRule,
    materialRule,
    motifRule,
    wardrobeRule,
    moodRule,
    decorativeRule,
    variantPromptAppend,
    objectiveText,
    subjectOverride,
  ].filter(Boolean);

  const presetNegativeTemplate =
    toText(input.preset_negative_template, 2000) ||
    toText(preset.negative_template, 2000) ||
    "watermark, deformed anatomy, off-model silhouette, low texture fidelity";
  const objectiveNegativeText =
    OBJECTIVE_NEGATIVE_TEMPLATES[objective] || OBJECTIVE_NEGATIVE_TEMPLATES.key_visual;
  const negativeParts = [
    presetNegativeTemplate,
    toText(variant.negative_delta, 1200),
    objectiveNegativeText,
    toText(input.negative_override, 1200),
  ].filter(Boolean);

  const recipe = {
    id: randomUUID(),
    preset_id: preset.id,
    preset_key: preset.preset_key,
    variant_key: variant.variant_key,
    objective,
    input: {
      subject: toText(input.subject, 500),
      composition: toText(input.composition, 600),
      linework: toText(input.linework, 600),
      color: toText(input.color, 600),
      material: toText(input.material, 600),
      motif: toText(input.motif, 600),
      wardrobe: toText(input.wardrobe, 600),
      mood: toText(input.mood, 600),
      decorative: toText(input.decorative, 600),
      objective_override: toText(input.objective_override, 500),
    },
    positive_prompt: positiveParts.join(", "),
    negative_prompt: negativeParts.join(", "),
    lineage: {
      reference_style_id: preset.reference_style_id,
      preset_id: preset.id,
      preset_key: preset.preset_key,
      variant_key: variant.variant_key,
      objective,
    },
    params: {
      sampler: toText(input.sampler, 120) || toText(preset.sampler, 120) || "dpmpp_2m",
      steps: Number.isFinite(Number(input.steps)) ? Number(input.steps) : Number(preset.steps || 32),
      cfg: Number.isFinite(Number(input.cfg)) ? Number(input.cfg) : Number(preset.cfg || 6.5),
      aspect_ratio: toText(input.aspect_ratio, 40) || toText(preset.aspect_ratio, 40) || "3:4",
    },
    created_at: nowIso(),
  };

  store.compiled_prompt_recipes.push(recipe);
  await writeStore(store);
  return recipe;
}

export async function listMikageJobs() {
  const store = await readStore();
  return store.jobs.map((job) => summarizeJob(store, job));
}

export async function getMikageJobById(jobId) {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === String(jobId || ""));
  if (!job) return null;
  return summarizeJob(store, job);
}

export async function createMikageJobPlan(input = {}) {
  const validated = normalizeJobPlan(input);
  if (!validated.ok) {
    const error = new Error("Invalid job plan payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }

  const store = await readStore();
  const project = store.projects.find((item) => item.id === validated.value.project_id);
  if (!project) {
    const error = new Error("Project not found");
    error.status = 404;
    throw error;
  }

  const plan = {
    id: randomUUID(),
    project_id: validated.value.project_id,
    objective: validated.value.objective,
    run_objective: validated.value.run_objective,
    canon_core_reminder: validated.value.canon_core_reminder,
    modes: validated.value.modes,
    batch_size: validated.value.batch_size,
    constraints: validated.value.constraints,
    created_at: nowIso(),
  };
  store.job_plans.push(plan);
  await writeStore(store);
  return plan;
}

export async function listMikageJobPlans({ project_id } = {}) {
  const store = await readStore();
  return store.job_plans
    .filter((item) => (project_id ? item.project_id === project_id : true))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function compileMikagePrompts(input = {}) {
  const store = await readStore();
  const planId = toText(input.job_plan_id, 120);
  const plan = store.job_plans.find((item) => item.id === planId);
  if (!plan) {
    const error = new Error("job_plan_id not found");
    error.status = 404;
    throw error;
  }

  const project = store.projects.find((item) => item.id === plan.project_id) || null;
  const modes = Array.isArray(input.modes) && input.modes.length > 0 ? input.modes : plan.modes;
  const compiled = compilePromptSetsForModes({
    modes,
    runObjective: plan.run_objective,
    project: project?.project_name || "Mikage",
  });
  const promptSetId = randomUUID();
  const now = nowIso();
  const rows = compiled.map((item) => ({
    id: randomUUID(),
    prompt_set_id: promptSetId,
    job_plan_id: plan.id,
    run_id: null,
    mode: item.mode,
    positive_prompt: item.positive_prompt,
    negative_prompt: item.negative_prompt,
    sampler: item.sampler,
    steps: item.steps,
    cfg: item.cfg,
    seed_policy: item.seed_policy,
    output_goal: item.output_goal,
    created_at: now,
  }));

  store.compiled_prompts = store.compiled_prompts.filter((item) => item.job_plan_id !== plan.id);
  store.compiled_prompts.push(...rows);
  await writeStore(store);
  return {
    job_plan_id: plan.id,
    items: rows,
  };
}

export async function listMikageCompiledPrompts({ job_plan_id, run_id } = {}) {
  const store = await readStore();
  return store.compiled_prompts
    .filter((item) => (job_plan_id ? item.job_plan_id === job_plan_id : true))
    .filter((item) => (run_id ? item.run_id === run_id : true))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function upsertMikageReviewScore(runId, input = {}) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const metrics = computeReviewTotalScore(input || {});
  const suggested = suggestClassification(metrics.total_score);
  const classification =
    toText(input.classification, 120) ||
    (metrics.total_score >= 40 ? "canon_candidate" : "usable_asset");
  const allowed = [
    "reject",
    "interesting_but_non_canon",
    "usable_asset",
    "canon_candidate",
  ];
  const safeClassification = allowed.includes(classification) ? classification : suggested;

  const existing = store.review_scores.find((item) => item.run_id === run.id);
  const selectedArchiveAsset = store.archive_assets.find((item) => item.run_id === run.id) || null;
  const now = nowIso();
  const review = existing || {
    id: randomUUID(),
    review_id: randomUUID(),
    run_id: run.id,
    created_at: now,
  };

  Object.assign(review, metrics, {
    review_id: review.review_id || review.id,
    job_id: run.job_id,
    asset_id: toText(input.asset_id, 120) || selectedArchiveAsset?.id || "",
    classification: safeClassification,
    suggested_classification: suggested,
    notes: toText(input.notes, 1200),
    reviewer: toText(input.reviewer, 120) || "operator",
    timestamp: now,
  });

  if (!existing) {
    store.review_scores.push(review);
  }

  run.workflow_status = "reviewed";
  run.updated_at = now;

  if (selectedArchiveAsset) {
    selectedArchiveAsset.classification = safeClassification;
    selectedArchiveAsset.review_score = Number(metrics.total_score || 0);
    selectedArchiveAsset.review_id = review.review_id || review.id;
    if (safeClassification === "canon_candidate") {
      upsertCanonAssetRecord(store, selectedArchiveAsset, review);
    } else {
      removeCanonAssetRecord(store, selectedArchiveAsset.id);
    }
  }

  await writeStore(store);
  return review;
}

export async function listMikageReviewScores({ run_id } = {}) {
  const store = await readStore();
  return store.review_scores
    .filter((item) => (run_id ? item.run_id === run_id : true))
    .sort((a, b) => Date.parse(b.timestamp || b.created_at) - Date.parse(a.timestamp || a.created_at));
}

export async function createMikageJob(input = {}) {
  const validated = normalizeIntake(input);
  if (!validated.ok) {
    const error = new Error("Invalid intake brief payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }

  const store = await readStore();
  const now = nowIso();
  const brief = {
    id: randomUUID(),
    ...validated.value,
    created_at: now,
  };
  const client = upsertClient(store, {
    client_name: brief.client_name,
  });
  const campaign = upsertCampaign(store, {
    client_id: client?.id,
    campaign_name: brief.campaign_name,
  });
  const project = upsertProject(store, {
    client_id: client?.id,
    campaign_id: campaign?.id,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    project_title: brief.project_title,
    collection: brief.collection,
    creative_direction: brief.creative_direction,
    environment: brief.environment,
  });
  const job = {
    id: randomUUID(),
    brief_id: brief.id,
    client_id: client?.id || null,
    campaign_id: campaign?.id || null,
    project_id: project.id,
    title: brief.project_title,
    project_name: brief.project_title,
    client_name: brief.client_name,
    campaign_name: brief.campaign_name,
    collection: brief.collection,
    creative_direction: brief.creative_direction,
    environment: brief.environment,
    status: "new",
    workflow_stage: "New Intake",
    controller_state: {
      brief: "compiled",
      review: "pending",
      canon_decision: "pending",
      archive: "pending",
    },
    created_at: now,
    updated_at: now,
  };

  store.intake_briefs.push(brief);
  store.jobs.push(job);
  await writeStore(store);

  return {
    brief,
    job: summarizeJob(store, job),
  };
}

export async function runMikageThreeModes(
  jobId,
  {
    actor = "operator",
    canon_seed,
    batch_id = null,
    batch_kind = "primary",
    batch_index = 0,
    batch_size,
    job_plan_id,
    generation_run_id = null,
  } = {}
) {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === String(jobId || ""));
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const now = nowIso();
  const runId = randomUUID();
  const resolvedBatchId = batch_id || randomUUID();
  const seeds = modeSeedMap(Number.isInteger(canon_seed) ? canon_seed : 110771 + store.runs.length);
  const plan = store.job_plans.find((item) => item.id === job_plan_id) || null;
  const activeModes = MODE_DEFS.map((def) => def.mode);
  const outputBatchSize =
    Number.isFinite(Number(batch_size)) && Number(batch_size) > 0
      ? Number(batch_size)
      : Number(plan?.batch_size || 24);

  let compiled = store.compiled_prompts
    .filter((item) => item.job_plan_id === plan?.id)
    .sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));

  if (!plan && compiled.length < 1) {
    const generated = compilePromptSetsForModes({
      modes: activeModes,
      runObjective: `run for ${job.project_name || job.title}`,
      project: job.project_name || job.title,
    });
    const promptSetId = randomUUID();
    const rows = generated.map((item) => ({
      id: randomUUID(),
      prompt_set_id: promptSetId,
      job_plan_id: null,
      run_id: runId,
      mode: item.mode,
      positive_prompt: item.positive_prompt,
      negative_prompt: item.negative_prompt,
      sampler: item.sampler,
      steps: item.steps,
      cfg: item.cfg,
      seed_policy: item.seed_policy,
      output_goal: item.output_goal,
      created_at: now,
    }));
    store.compiled_prompts.push(...rows);
    compiled = rows;
  }

  for (const promptRow of compiled) {
    if (!promptRow.run_id) {
      promptRow.run_id = runId;
    }
  }

  const run = {
    id: runId,
    job_id: job.id,
    client_id: job.client_id || null,
    campaign_id: job.campaign_id || null,
    project_id: job.project_id || null,
    client_name: job.client_name,
    campaign_name: job.campaign_name || "default-campaign",
    project_name: job.project_name || job.title,
    collection: job.collection || "core",
    creative_direction: job.creative_direction || "Luxury visual workflow",
    environment: job.environment || "studio",
    stage: "Generate",
    status: "running",
    workflow_status: "running",
    job_plan_id: plan?.id || null,
    triggered_by: actor,
    batch_id: resolvedBatchId,
    batch_kind,
    batch_index,
    batch_size: outputBatchSize,
    mode_seed_policy: {
      canon_core: "lock",
      luminous_fan_appeal: "reuse canon",
      luxury_mystical_editorial: "independent",
    },
    created_at: now,
    updated_at: now,
  };

  const intakeBrief = store.intake_briefs.find((item) => item.id === job.brief_id) || null;
  const presetId =
    toText(intakeBrief?.preset, 120) ||
    toText(plan?.preset_id, 120) ||
    "mikage-porcelain-canon";

  const modeJobs = activeModes.map((mode) => ({
    id: randomUUID(),
    run_id: runId,
    batch_id: resolvedBatchId,
    job_id: job.id,
    preset_id: presetId,
    mode,
    positive_prompt: toText(compiled.find((item) => item.mode === mode)?.positive_prompt, 4000),
    negative_prompt: toText(compiled.find((item) => item.mode === mode)?.negative_prompt, 4000),
    sampler: toText(compiled.find((item) => item.mode === mode)?.sampler, 120) || "dpmpp_2m",
    steps: Number(compiled.find((item) => item.mode === mode)?.steps || 32),
    cfg: Number(compiled.find((item) => item.mode === mode)?.cfg || 6.5),
    seed: Number(seeds[mode] || 0),
    status: "completed",
    queued_at: now,
    running_at: now,
    completed_at: now,
    created_at: now,
  }));

  const modeResults = activeModes.map((mode) => {
    const compiledPrompt = compiled.find((item) => item.mode === mode) || null;
    const modeJob = modeJobs.find((item) => item.mode === mode) || null;
    return toSeededModeResult({
      runId,
      mode,
      seed: seeds[mode],
      status: "succeeded",
      rerunCount: 0,
      batchSize: outputBatchSize,
      compiledPrompt,
      modeJobId: modeJob?.id || null,
    });
  });

  run.status = computeRunStatus(modeResults);
  run.workflow_status = run.status === "ready_for_review" ? "completed" : "running";
  run.stage = run.status === "ready_for_review" ? "Review" : "Generate";
  const runtimeProvider = modeResults[0]?.provider || "provider-adapter";
  const runtimeModel = modeResults[0]?.model || "provider-managed";
  run.generation_runtime = {
    provider: runtimeProvider,
    model: runtimeModel,
    batch_size: outputBatchSize,
    persisted_to_job_folder: true,
  };

  await persistModeOutputsToJobFolder({
    job,
    run,
    modeResults,
  });

  const reviewSheet = buildReviewTemplate(runId);
  store.runs.push(run);
  store.mode_jobs.push(...modeJobs);
  store.mode_results.push(...modeResults);
  store.review_sheets.push(reviewSheet);

  job.status = "review";
  job.workflow_stage = "Review";
  job.controller_state = {
    ...(job.controller_state || {}),
    brief: "compiled",
    review: "ready",
    canon_decision: "pending",
    archive: "pending",
  };
  job.updated_at = now;

  store.lineage_metadata.push({
    id: randomUUID(),
    run_id: runId,
    job_id: job.id,
    brief_id: job.brief_id,
    archive_asset_id: null,
    proof_set_id: null,
    created_at: now,
  });

  if (generation_run_id) {
    const queueRun = store.generation_runs.find((item) => item.id === generation_run_id);
    if (queueRun) {
      queueRun.status = run.status === "attention" ? "failed" : "completed";
      queueRun.mikage_run_id = run.id;
      queueRun.updated_at = nowIso();
    }

    const variants = store.generation_variants.filter((item) => item.run_id === generation_run_id);
    for (const variant of variants) {
      const modeResult = modeResults.find((item) => item.mode === variant.variant_name);
      variant.status = modeResult?.status === "failed" ? "failed" : "completed";
      variant.mikage_mode = modeResult?.mode || variant.variant_name;
      variant.updated_at = nowIso();
    }
  }

  await writeStore(store);
  return summarizeRun(store, run);
}

export async function compileMikagePackageAndRun(input = {}) {
  console.log("[mikage.compile] start compile flow");
  const validated = normalizeIntake(input);
  if (!validated.ok) {
    console.log("[mikage.compile] validation failed", validated.errors);
    const error = new Error("Invalid compile payload");
    error.status = 400;
    error.body = { errors: validated.errors };
    throw error;
  }

  console.log("[mikage.compile] validation passed");
  const seed = Number.isInteger(input?.seed) ? Number(input.seed) : 110771;
  const jobBundle = await createMikageJob(validated.value);
  const jobId = jobBundle?.job?.id;
  if (!jobId) {
    console.log("[mikage.compile] failed to create job");
    const error = new Error("Failed to create Mikage job");
    error.status = 500;
    throw error;
  }

  console.log("[mikage.compile] job created", { jobId });
  const store = await readStore();
  const now = nowIso();
  const generationRunId = randomUUID();
  store.generation_runs.push({
    id: generationRunId,
    project: validated.value.project_title,
    client: validated.value.client_name,
    preset: validated.value.preset,
    variant_count: 3,
    status: "queued",
    seed,
    job_id: jobId,
    mikage_run_id: "",
    created_at: now,
    updated_at: now,
  });

  const variantNames = ["canon_core", "luminous_fan_appeal", "luxury_mystical_editorial"];
  for (const variantName of variantNames) {
    store.generation_variants.push({
      id: randomUUID(),
      run_id: generationRunId,
      variant_name: variantName,
      mikage_mode: variantName,
      status: "queued",
      created_at: now,
      updated_at: now,
    });
  }
  await writeStore(store);
  console.log("[mikage.compile] generation run queued", { generationRunId });

  try {
    const run = await runMikageThreeModes(jobId, {
      actor: toText(input?.actor, 80) || "operator",
      canon_seed: seed,
      generation_run_id: generationRunId,
    });
    console.log("[mikage.compile] run completed", { runId: run.id });
    return {
      success: true,
      run_id: generationRunId,
      mikage_run_id: run.id,
      job: jobBundle.job,
    };
  } catch (error) {
    const failedStore = await readStore();
    const queueRun = failedStore.generation_runs.find((item) => item.id === generationRunId);
    if (queueRun) {
      queueRun.status = "failed";
      queueRun.updated_at = nowIso();
    }
    const variants = failedStore.generation_variants.filter((item) => item.run_id === generationRunId);
    for (const variant of variants) {
      variant.status = "failed";
      variant.updated_at = nowIso();
    }
    await writeStore(failedStore);
    console.log("[mikage.compile] run failed", { generationRunId, message: error?.message });
    throw error;
  }
}

export async function executeMikageRunBatch(
  jobId,
  {
    actor = "operator",
    canon_seed,
    batch_size,
    variant_runs = 0,
    rerun_sequences = 0,
  } = {}
) {
  const variants = Math.max(0, Number(variant_runs) || 0);
  const reruns = Math.max(0, Number(rerun_sequences) || 0);
  const total = 1 + variants + reruns;
  const batchId = randomUUID();
  const createdAt = nowIso();

  const store = await readStore();
  const job = store.jobs.find((item) => item.id === String(jobId || ""));
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const batch = {
    id: batchId,
    job_id: job.id,
    actor,
    requested: {
      variant_runs: variants,
      rerun_sequences: reruns,
      canon_seed: Number.isInteger(canon_seed) ? canon_seed : null,
    },
    progress: {
      total,
      completed: 0,
      failed: 0,
      percent: 0,
    },
    status: "running",
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
    run_ids: [],
  };
  store.run_batches.push(batch);
  await writeStore(store);

  const createdRuns = [];
  let failed = 0;

  const tickBatch = async (runId, hadError = false) => {
    const latest = await readStore();
    const target = latest.run_batches.find((item) => item.id === batchId);
    if (!target) return;
    if (runId) target.run_ids.push(runId);
    target.progress.completed += 1;
    if (hadError) {
      target.progress.failed += 1;
      failed += 1;
    }
    target.progress.percent = Number(
      ((target.progress.completed / Math.max(1, target.progress.total)) * 100).toFixed(1)
    );
    target.updated_at = nowIso();
    if (target.progress.completed >= target.progress.total) {
      target.status = target.progress.failed > 0 ? "completed_with_errors" : "completed";
      target.completed_at = nowIso();
    }
    await writeStore(latest);
  };

  const createRunSafe = async ({ seed, kind, index }) => {
    try {
      const run = await runMikageThreeModes(job.id, {
        actor,
        canon_seed: seed,
        batch_size,
        batch_id: batchId,
        batch_kind: kind,
        batch_index: index,
      });
      createdRuns.push(run.id);
      await tickBatch(run.id, false);
      return run;
    } catch (error) {
      await tickBatch(null, true);
      throw error;
    }
  };

  const primary = await createRunSafe({
    seed: Number.isInteger(canon_seed) ? canon_seed : undefined,
    kind: "primary",
    index: 0,
  });

  for (let i = 0; i < variants; i += 1) {
    const seed = Number.isInteger(canon_seed)
      ? canon_seed + (i + 1) * 29
      : 110771 + Date.now() + i * 17;
    await createRunSafe({
      seed,
      kind: "variant",
      index: i + 1,
    });
  }

  let lastRunId = primary.id;
  for (let i = 0; i < reruns; i += 1) {
    try {
      const rerun = await rerunMikagePipeline(lastRunId, { actor });
      const rerunId = rerun?.run?.id || null;
      if (rerunId) {
        const latest = await readStore();
        const created = latest.runs.find((item) => item.id === rerunId);
        if (created) {
          created.batch_id = batchId;
          created.batch_kind = "rerun_sequence";
          created.batch_index = i + 1;
          await writeStore(latest);
        }
        createdRuns.push(rerunId);
        lastRunId = rerunId;
      }
      await tickBatch(rerunId, false);
    } catch (error) {
      await tickBatch(null, true);
      throw error;
    }
  }

  const finalStore = await readStore();
  const finalBatch = finalStore.run_batches.find((item) => item.id === batchId) || batch;

  return {
    batch: finalBatch,
    run_ids: createdRuns,
    failed,
  };
}

export async function listMikageRuns({ job_id } = {}) {
  const store = await readStore();
  const runs = store.runs
    .filter((item) => (job_id ? item.job_id === job_id : true))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return runs.map((item) => summarizeRun(store, item));
}

export async function getMikageRunById(runId) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) return null;
  return summarizeRun(store, run);
}

export async function rerunMikageMode(runId, mode, { actor = "operator" } = {}) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const modeKey = String(mode || "").trim();
  if (!MODE_DEFS.some((item) => item.mode === modeKey)) {
    const error = new Error("Invalid mode");
    error.status = 400;
    throw error;
  }

  const target = store.mode_results.find((item) => item.run_id === run.id && item.mode === modeKey);
  if (!target) {
    const error = new Error("Mode result not found");
    error.status = 404;
    throw error;
  }

  if (target.status !== "failed") {
    const error = new Error("Only failed mode can be rerun");
    error.status = 400;
    throw error;
  }

  const sourceJob = store.jobs.find((item) => item.id === run.job_id);
  if (!sourceJob) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const now = nowIso();
  const rerunJob = {
    id: randomUUID(),
    brief_id: sourceJob.brief_id,
    client_id: sourceJob.client_id || null,
    campaign_id: sourceJob.campaign_id || null,
    project_id: sourceJob.project_id || null,
    title: `${sourceJob.title} [rerun ${modeKey}]`,
    project_name: sourceJob.project_name || sourceJob.title,
    client_name: sourceJob.client_name,
    campaign_name: sourceJob.campaign_name || "default-campaign",
    collection: sourceJob.collection || "core",
    creative_direction: sourceJob.creative_direction || "Luxury visual workflow",
    environment: sourceJob.environment || "studio",
    status: "review",
    workflow_stage: "Review",
    controller_state: {
      brief: "compiled",
      review: "ready",
      canon_decision: "pending",
      archive: "pending",
    },
    created_at: now,
    updated_at: now,
    rerun_of_job_id: sourceJob.id,
    rerun_of_run_id: run.id,
    rerun_mode: modeKey,
  };

  const rerunRun = {
    id: randomUUID(),
    job_id: rerunJob.id,
    client_id: rerunJob.client_id,
    campaign_id: rerunJob.campaign_id,
    project_id: rerunJob.project_id,
    client_name: rerunJob.client_name,
    campaign_name: rerunJob.campaign_name,
    project_name: rerunJob.project_name,
    collection: rerunJob.collection,
    creative_direction: rerunJob.creative_direction,
    environment: rerunJob.environment,
    stage: "Generate",
    status: "running",
    triggered_by: actor,
    mode_seed_policy: {
      canon_core: "lock",
      luminous_fan_appeal: "reuse canon",
      luxury_mystical_editorial: "independent",
    },
    created_at: now,
    updated_at: now,
    rerun_of_run_id: run.id,
    rerun_mode: modeKey,
  };

  const priorModeMap = new Map(
    store.mode_results.filter((item) => item.run_id === run.id).map((item) => [item.mode, item])
  );

  const rerunModeResults = MODE_DEFS.map((def) => {
    const prior = priorModeMap.get(def.mode);
    if (!prior) {
      return toSeededModeResult({
        runId: rerunRun.id,
        mode: def.mode,
        seed: modeSeedMap(110771)[def.mode],
      });
    }
    if (def.mode !== modeKey) {
      return cloneModeResult({ source: prior, runId: rerunRun.id });
    }
    return toSeededModeResult({
      runId: rerunRun.id,
      mode: modeKey,
      seed: Number(prior.seed || 0),
      status: "succeeded",
      rerunCount: Number(prior.rerun_count || 0) + 1,
    });
  });

  rerunRun.status = computeRunStatus(rerunModeResults);
  rerunRun.stage = rerunRun.status === "ready_for_review" ? "Review" : "Generate";

  const review = buildReviewTemplate(rerunRun.id);
  review.next_action = "review";
  review.updated_at = now;

  store.jobs.push(rerunJob);
  store.runs.push(rerunRun);
  store.mode_results.push(...rerunModeResults);
  store.review_sheets.push(review);

  store.lineage_metadata.push({
    id: randomUUID(),
    run_id: rerunRun.id,
    job_id: rerunJob.id,
    brief_id: sourceJob.brief_id,
    archive_asset_id: null,
    proof_set_id: null,
    parent_run_id: run.id,
    parent_job_id: sourceJob.id,
    rerun_mode: modeKey,
    created_at: now,
  });

  await writeStore(store);
  return {
    actor,
    run: summarizeRun(store, rerunRun),
    job: summarizeJob(store, rerunJob),
  };
}

export async function updateMikageReviewSheet(runId, input = {}) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const review =
    store.review_sheets.find((item) => item.run_id === run.id) ||
    buildReviewTemplate(run.id);

  review.operator_notes = toText(input.operator_notes, 2400) || review.operator_notes || "";
  if (input?.qc && typeof input.qc === "object") {
    review.qc = {
      ...review.qc,
      ...input.qc,
    };
  }

  if (Array.isArray(input.scored_modes)) {
    review.scored_modes = input.scored_modes
      .map((item) => ({
        mode: toText(item?.mode, 80),
        score: Number(item?.score || 0),
      }))
      .filter((item) => item.mode)
      .slice(0, 8);
  }

  review.next_action = toText(input.next_action, 80) || review.next_action || "canon_gate";
  review.updated_at = nowIso();

  if (!store.review_sheets.some((item) => item.id === review.id)) {
    store.review_sheets.push(review);
  }

  run.stage = "Review";
  run.updated_at = review.updated_at;
  const job = store.jobs.find((item) => item.id === run.job_id);
  if (job) {
    job.controller_state = {
      ...(job.controller_state || {}),
      review: "completed",
      canon_decision: "ready",
    };
    job.updated_at = review.updated_at;
  }
  await writeStore(store);

  return review;
}

export async function decideMikageCanonGate(runId, input = {}) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const selectedMode = toText(input.selected_mode, 120);
  if (!MODE_DEFS.some((item) => item.mode === selectedMode)) {
    const error = new Error("selected_mode is invalid");
    error.status = 400;
    throw error;
  }

  const modeResult = store.mode_results.find(
    (item) => item.run_id === run.id && item.mode === selectedMode
  );
  if (!modeResult || !Array.isArray(modeResult.output_refs) || modeResult.output_refs.length < 1) {
    const error = new Error("Mode output not found");
    error.status = 400;
    throw error;
  }

  const selectedOutputId =
    toText(input.selected_output_id, 120) || modeResult.output_refs[0].id;
  const existing = store.canon_gate_decisions.find((item) => item.run_id === run.id);
  const now = nowIso();
  const decision = existing || {
    id: randomUUID(),
    run_id: run.id,
    created_at: now,
  };

  decision.selected_mode = selectedMode;
  decision.selected_output_id = selectedOutputId;
  decision.rationale = toText(input.rationale, 1200);
  decision.approved_by = toText(input.approved_by, 120) || "operator";
  decision.created_at = existing?.created_at || now;

  if (!existing) store.canon_gate_decisions.push(decision);

  run.stage = "Canon Gate";
  run.status = "canon_approved";
  run.workflow_status = "canonized";
  run.updated_at = now;

  const review = store.review_sheets.find((item) => item.run_id === run.id);
  if (review) {
    review.next_action = "archive";
    review.updated_at = now;
  }

  const job = store.jobs.find((item) => item.id === run.job_id);
  if (job) {
    job.controller_state = {
      ...(job.controller_state || {}),
      review: "completed",
      canon_decision: "approved",
      archive: "ready",
    };
    job.updated_at = now;
  }

  await writeStore(store);
  return decision;
}

export async function archiveMikageRun(runId, input = {}) {
  const store = await readStore();
  const run = store.runs.find((item) => item.id === String(runId || ""));
  if (!run) {
    const error = new Error("Run not found");
    error.status = 404;
    throw error;
  }

  const job = store.jobs.find((item) => item.id === run.job_id);
  if (!job) {
    const error = new Error("Job not found");
    error.status = 404;
    throw error;
  }

  const decision = store.canon_gate_decisions.find((item) => item.run_id === run.id);
  if (!decision) {
    const error = new Error("Canon gate decision required before archive");
    error.status = 400;
    throw error;
  }

  const existingAsset = store.archive_assets.find((item) => item.run_id === run.id);
  const now = nowIso();
  const requestedCanonStatus = Object.prototype.hasOwnProperty.call(input, "canon_status")
    ? normalizeClassificationValue(input.canon_status, {
        fieldName: "canon_status",
        rejectInvalid: true,
      })
    : "";
  const requestedClassification = Object.prototype.hasOwnProperty.call(input, "classification")
    ? normalizeClassificationValue(input.classification, {
        fieldName: "classification",
        rejectInvalid: true,
      })
    : "";
  const asset = existingAsset || {
    id: randomUUID(),
    run_id: run.id,
    job_id: job.id,
    client_id: job.client_id || null,
    campaign_id: job.campaign_id || null,
    client_name: job.client_name,
    campaign_name: job.campaign_name || "default-campaign",
    project_title: job.title,
    project_name: job.project_name || job.title,
    collection: job.collection || "core",
    archived_at: now,
  };

  const selectedModeResult = store.mode_results.find(
    (item) => item.run_id === run.id && item.mode === decision.selected_mode
  );
  const intake = store.intake_briefs.find((item) => item.id === job.brief_id) || null;

  asset.selected_mode = decision.selected_mode;
  asset.selected_output_id = decision.selected_output_id;
  asset.proof_worthy = input.proof_worthy !== false;
  asset.lineage_note = toText(input.lineage_note, 400) || "archived from canon gate";
  asset.canon_status = normalizeClassificationValue(requestedCanonStatus || asset.canon_status, {
    fallback: input.proof_worthy === false ? "interesting_but_non_canon" : "canon_candidate",
  });
  asset.featured = Boolean(input.featured || asset.featured);
  asset.reason_kept = toText(input.reason_kept, 1000) || asset.reason_kept || "";
  asset.tags = Array.isArray(input.tags)
    ? input.tags.map((item) => toText(item, 80)).filter(Boolean).slice(0, 16)
    : asset.tags || [];
  asset.reuse_notes = toText(input.reuse_notes, 1000) || asset.reuse_notes || "";
  asset.usage_target = toText(input.usage_target, 180) || asset.usage_target || "";
  asset.reuse_count = Number.isFinite(Number(input.reuse_count))
    ? Number(input.reuse_count)
    : Number(asset.reuse_count || 0);
  asset.character =
    toText(input.character, 120) ||
    intake?.archetype ||
    "the-porcelain-muse";
  asset.asset_intelligence = {
    mode: decision.selected_mode,
    seed: selectedModeResult?.seed ?? null,
    preset: intake?.preset || job.preset || null,
    environment: intake?.environment || job.environment || null,
    visual_theme:
      toText(input.visual_theme, 180) ||
      intake?.creative_direction ||
      job.creative_direction ||
      "Luxury visual workflow",
    generation_params: selectedModeResult?.generation_params || null,
    ...computeAssetIntelligenceScores({
      seed: selectedModeResult?.seed ?? 0,
      mode: decision.selected_mode,
      visualTheme:
        toText(input.visual_theme, 180) ||
        intake?.creative_direction ||
        job.creative_direction ||
        "Luxury visual workflow",
    }),
  };
  const canonicalSerial = String(store.archive_assets.length + 1).padStart(4, "0");
  const canonicalDate = now.slice(0, 10).replaceAll("-", "");
  asset.canon_id = asset.canon_id || `CANON-${canonicalDate}-${canonicalSerial}`;
  asset.review_decision = toText(input.review_decision, 40) || asset.review_decision || "keep";
  if (Object.prototype.hasOwnProperty.call(input, "fan_appeal_score")) {
    const nextScore = Number(input.fan_appeal_score);
    asset.fan_appeal_score = Number.isFinite(nextScore) ? Math.max(0, Math.min(10, nextScore)) : null;
  }
  asset.archived_at = now;

  const selectedOutput = selectedModeResult?.output_refs?.find(
    (output) => output.id === decision.selected_output_id
  ) || selectedModeResult?.output_refs?.[0] || null;
  const reviewScore = store.review_scores.find((item) => item.run_id === run.id) || null;
  asset.archive_id = asset.archive_id || randomUUID();
  asset.project = asset.project_title || asset.project_name || job.title;
  asset.mode = decision.selected_mode;
  asset.prompt = selectedModeResult?.prompt || "";
  asset.negative_prompt = selectedModeResult?.negative_prompt || "";
  asset.seed = Number(selectedModeResult?.seed || 0);
  asset.sampler = toText(selectedModeResult?.generation_params?.sampler, 120) || "dpmpp_2m";
  asset.steps = Number(selectedModeResult?.generation_params?.steps || 32);
  asset.cfg = Number(selectedModeResult?.generation_params?.cfg || 6.5);
  asset.review_score = Number(reviewScore?.total_score || 0);
  asset.classification = normalizeClassificationValue(
    requestedClassification ||
      toText(reviewScore?.classification, 120) ||
      toText(asset.canon_status, 120),
    {
      fallback: "usable_asset",
    }
  );
  asset.asset_url = toText(selectedOutput?.asset_url, 800) || toText(selectedOutput?.preview_url, 800);
  asset.thumbnail_url =
    toText(selectedOutput?.thumbnail_url, 800) || toText(selectedOutput?.preview_url, 800);
  asset.timestamp = toText(selectedOutput?.timestamp, 80) || now;

  if (!existingAsset) store.archive_assets.push(asset);

  let proof = store.proof_sets.find((item) => item.run_id === run.id);
  if (!proof) {
    proof = {
      id: randomUUID(),
      archive_asset_id: asset.id,
      run_id: run.id,
      case_study_title: `${job.title} Proof Set`,
      export_status: "ready",
      created_at: now,
    };
    store.proof_sets.push(proof);
  }

  const lineage = store.lineage_metadata.find((item) => item.run_id === run.id);
  if (lineage) {
    lineage.archive_asset_id = asset.id;
    lineage.proof_set_id = proof.id;
  }

  const existingArchiveRun = store.archive_runs.find((item) => item.run_id === run.id);
  const archiveRun = existingArchiveRun || {
    id: randomUUID(),
    run_id: run.id,
    created_at: now,
  };
  const runPrompts = store.mode_results
    .filter((item) => item.run_id === run.id)
    .map((item) => ({
      mode: item.mode,
      positive_prompt: item.prompt,
      negative_prompt: item.negative_prompt,
    }));
  const runParams = store.mode_results
    .filter((item) => item.run_id === run.id)
    .map((item) => ({
      mode: item.mode,
      sampler: item.generation_params?.sampler,
      steps: item.generation_params?.steps,
      cfg: item.generation_params?.cfg,
      seed: item.seed,
    }));
  const outputs = store.mode_results
    .filter((item) => item.run_id === run.id)
    .flatMap((item) =>
      (item.output_refs || []).map((output) => ({
        mode: item.mode,
        output_id: output.id,
        asset_url: output.preview_url,
        timestamp: output.receipt?.timestamp || now,
      }))
    );
  archiveRun.date = now;
  archiveRun.objective = toText(input.objective, 400) || job.title;
  archiveRun.modes = store.mode_results
    .filter((item) => item.run_id === run.id)
    .map((item) => item.mode);
  archiveRun.prompts = runPrompts;
  archiveRun.params = runParams;
  archiveRun.outputs = outputs;
  archiveRun.review_scores = reviewScore;
  archiveRun.classification = normalizeClassificationValue(
    requestedClassification || reviewScore?.classification || asset.classification,
    {
      fallback: "usable_asset",
    }
  );
  archiveRun.winner_mode = decision.selected_mode;
  archiveRun.notes = toText(input.lineage_note, 1200);
  archiveRun.next_run_recommendation =
    toText(input.next_run_recommendation, 500) ||
    "Iterate canon candidate with controlled seed policy and maintain luxury signal.";
  archiveRun.updated_at = now;

  if (!existingArchiveRun) {
    store.archive_runs.push(archiveRun);
  }

  run.stage = "Archive";
  run.status = "archived";
  run.workflow_status = "archived";
  run.updated_at = now;

  job.status = "archived";
  job.workflow_stage = "Archive";
  job.controller_state = {
    ...(job.controller_state || {}),
    archive: "completed",
  };
  job.updated_at = now;

  if (asset.classification === "canon_candidate") {
    upsertCanonAssetRecord(store, asset, reviewScore);
  } else {
    removeCanonAssetRecord(store, asset.id);
  }

  await writeStore(store);
  return {
    asset,
    proof_set: proof,
    lineage: lineage || null,
  };
}

export async function listMikageArchiveAssets(filters = {}) {
  const store = await readStore();
  const client = toText(filters.client, 120).toLowerCase();
  const campaign = toText(filters.campaign, 120).toLowerCase();
  const project = toText(filters.project, 180).toLowerCase();
  const character = toText(filters.character, 120).toLowerCase();
  const mode = toText(filters.mode, 120);
  const collection = toText(filters.collection, 120).toLowerCase();
  const preset = toText(filters.preset, 120).toLowerCase();
  const visualMood = toText(filters.visual_mood, 180).toLowerCase();
  const rankBy = toText(filters.rank_by, 40).toLowerCase();
  const proof = toText(filters.proof_worthy, 20).toLowerCase();
  const canonOnly = toText(filters.canon_only, 10).toLowerCase();

  const dateFrom = toText(filters.date_from, 80);
  const dateTo = toText(filters.date_to, 80);
  const fromMs = dateFrom ? Date.parse(dateFrom) : null;
  const toMs = dateTo ? Date.parse(dateTo) : null;

  return store.archive_assets.filter((item) => {
    if (client && !String(item.client_name || "").toLowerCase().includes(client)) return false;
    if (campaign && !String(item.campaign_name || "").toLowerCase().includes(campaign)) return false;
    if (project && !String(item.project_title || "").toLowerCase().includes(project)) return false;
    if (character && !String(item.character || "").toLowerCase().includes(character)) return false;
    if (mode && item.selected_mode !== mode) return false;
    if (collection && !String(item.collection || "").toLowerCase().includes(collection)) return false;
    if (
      preset &&
      !String(item.asset_intelligence?.preset || "").toLowerCase().includes(preset)
    ) {
      return false;
    }
    if (
      visualMood &&
      !String(item.asset_intelligence?.visual_theme || "").toLowerCase().includes(visualMood)
    ) {
      return false;
    }
    if (proof === "true" && !item.proof_worthy) return false;
    if (proof === "false" && item.proof_worthy) return false;
    if (canonOnly === "true" && !toText(item.canon_id, 120)) return false;
    const archivedMs = Date.parse(String(item.archived_at || ""));
    if (Number.isFinite(fromMs) && Number.isFinite(archivedMs) && archivedMs < fromMs) return false;
    if (Number.isFinite(toMs) && Number.isFinite(archivedMs) && archivedMs > toMs) return false;
    return true;
  }).map((asset) => {
    const run = store.runs.find((item) => item.id === asset.run_id) || null;
    const job = run ? store.jobs.find((item) => item.id === run.job_id) || null : null;
    const brief = job ? store.intake_briefs.find((item) => item.id === job.brief_id) || null : null;
    const modeResult = run
      ? store.mode_results.find(
          (item) => item.run_id === run.id && item.mode === asset.selected_mode
        ) || null
      : null;

    return {
      ...asset,
      run,
      job,
      intake_brief: brief,
      mode_result: modeResult,
      preview:
        modeResult?.output_refs?.find((output) => output.id === asset.selected_output_id) ||
        modeResult?.output_refs?.[0] ||
        null,
    };
  }).sort((a, b) => {
    if (!rankBy) return Date.parse(String(b.archived_at || "")) - Date.parse(String(a.archived_at || ""));
    const left = Number(a.asset_intelligence?.[rankBy] || 0);
    const right = Number(b.asset_intelligence?.[rankBy] || 0);
    return right - left;
  });
}

export async function listMikageProofSets() {
  const store = await readStore();
  return store.proof_sets.map((setItem) => {
    const asset = store.archive_assets.find((item) => item.id === setItem.archive_asset_id) || null;
    const run = store.runs.find((item) => item.id === setItem.run_id) || null;
    return {
      ...setItem,
      archive_asset: asset,
      run,
    };
  });
}

export async function createMikageProofSet(input = {}) {
  const store = await readStore();
  const assetIds = Array.isArray(input.archive_asset_ids)
    ? input.archive_asset_ids.map((item) => toText(item, 120)).filter(Boolean)
    : [];

  if (assetIds.length < 1) {
    const error = new Error("archive_asset_ids is required");
    error.status = 400;
    throw error;
  }

  const assets = store.archive_assets.filter((item) => assetIds.includes(item.id));
  if (assets.length < 1) {
    const error = new Error("No valid archive assets selected");
    error.status = 400;
    throw error;
  }

  const now = nowIso();
  const primary = assets[0];
  const run = store.runs.find((item) => item.id === primary.run_id) || null;
  const modeResult = run
    ? store.mode_results.find((item) => item.run_id === run.id && item.mode === primary.selected_mode) || null
    : null;

  const proofSet = {
    id: randomUUID(),
    archive_asset_id: primary.id,
    run_id: primary.run_id,
    case_study_title:
      toText(input.case_study_title, 180) || `${primary.project_title} Proof Set`,
    export_status: "ready",
    created_at: now,
    metadata: {
      client: toText(input.client, 120) || primary.client_name,
      campaign: toText(input.campaign, 120) || primary.campaign_name || "default-campaign",
      project: toText(input.project, 140) || primary.project_title,
      mode: toText(input.mode, 120) || primary.selected_mode,
      visual_theme: toText(input.visual_theme, 180) || "Mikage Zenith Visual Exploration",
      generation_params: modeResult?.generation_params || null,
      archive_asset_ids: assets.map((item) => item.id),
      workflow_timeline: [
        "Brief",
        "Compile",
        "Run Three Modes",
        "Review",
        "Canon Gate",
        "Archive",
        "Proof Set",
      ],
      studio_narrative:
        "Studio package generated from production lineage with canon-approved assets and ranked archive intelligence.",
    },
  };

  store.proof_sets.push(proofSet);

  const lineage = store.lineage_metadata.find((item) => item.run_id === proofSet.run_id);
  if (lineage) {
    lineage.proof_set_id = proofSet.id;
  }

  await writeStore(store);

  return {
    ...proofSet,
    archive_assets: assets,
  };
}
