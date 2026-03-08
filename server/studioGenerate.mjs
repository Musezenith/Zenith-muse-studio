import { compileStudioPrompt } from "./studioPromptCompiler.mjs";
import { getStudioPresetById } from "./studioPresets.mjs";

const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);
const ALLOWED_SEED_POLICIES = new Set(["locked", "incremental", "random"]);

function ensureText(value, field, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) return "";
    throw new Error(`${field} is required`);
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized && required) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeAspectRatio(value, fallback) {
  if (!value) return fallback;
  const normalized = String(value).trim();
  if (!ALLOWED_ASPECT_RATIOS.has(normalized)) {
    throw new Error("aspect_ratio is invalid");
  }
  return normalized;
}

function normalizeSeedPolicy(value, fallback) {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!ALLOWED_SEED_POLICIES.has(normalized)) {
    throw new Error("seed_policy is invalid");
  }
  return normalized;
}

function hashStringToSeed(text) {
  const source = String(text || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function buildVariantSeeds({ variants, seedPolicy, baseSeed }) {
  if (!Number.isInteger(variants) || variants < 1) return [];
  if (seedPolicy === "random") return Array.from({ length: variants }, () => null);
  if (seedPolicy === "incremental") {
    return Array.from({ length: variants }, (_, index) => baseSeed + index);
  }
  return Array.from({ length: variants }, () => baseSeed);
}

function deriveFramingFromAspect(aspectRatio) {
  if (aspectRatio === "9:16") return "vertical editorial portrait framing";
  if (aspectRatio === "16:9") return "cinematic horizontal editorial framing";
  if (aspectRatio === "4:3") return "balanced three-quarter portrait framing";
  if (aspectRatio === "3:4") return "portrait cover framing";
  return "centered editorial portrait framing";
}

export function normalizeStudioGenerateInput(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("payload must be an object");
  }
  const presetId = ensureText(rawInput.preset_id, "preset_id");
  const preset = getStudioPresetById(presetId);
  if (!preset) {
    throw new Error("preset_id not found");
  }
  const subject = ensureText(rawInput.subject, "subject");
  const wardrobe = ensureText(rawInput.wardrobe, "wardrobe");
  const pose = ensureText(rawInput.pose, "pose");
  const environment = ensureText(rawInput.environment, "environment");
  const identityId = ensureText(rawInput.identity_id, "identity_id", { required: false });
  const aspectRatio = normalizeAspectRatio(rawInput.aspect_ratio, preset.aspect_ratio);
  const seedPolicy = normalizeSeedPolicy(rawInput.seed_policy, "locked");
  return {
    preset,
    preset_id: preset.id,
    subject,
    wardrobe,
    pose,
    environment,
    aspect_ratio: aspectRatio,
    identity_id: identityId || null,
    seed_policy: seedPolicy,
  };
}

export function buildStudioGenerationRequest(input) {
  const normalized = normalizeStudioGenerateInput(input);
  const identityLock = Boolean(normalized.identity_id);
  const compileInput = {
    preset: normalized.preset_id,
    subject: normalized.subject,
    wardrobe: normalized.wardrobe,
    pose: normalized.pose,
    framing: deriveFramingFromAspect(normalized.aspect_ratio),
    environment: normalized.environment,
    mood: `${normalized.preset.label} raw luxury editorial mood`,
    restrictions: ["no logo", "no watermark", "no text"],
    identity_lock: identityLock,
  };
  const compiled = compileStudioPrompt(compileInput);
  const baseSeed = normalized.identity_id
    ? hashStringToSeed(normalized.identity_id)
    : hashStringToSeed(`${normalized.subject}:${normalized.preset_id}`);
  const seeds = buildVariantSeeds({
    variants: 1,
    seedPolicy: normalized.seed_policy,
    baseSeed,
  });
  const paramsReceipt = {
    preset_id: normalized.preset_id,
    aspect_ratio: normalized.aspect_ratio,
    sampler: compiled.params.sampler,
    steps: compiled.params.steps,
    cfg: compiled.params.cfg,
    seed_policy: normalized.seed_policy,
    identity_strength: compiled.params.identity_strength,
    identity_id: normalized.identity_id,
    variants: 1,
    seeds,
  };

  const lowLevelPayload = {
    schemaVersion: "2026-03-10",
    source: {
      app: "Musezenith Studio",
      module: "Studio API",
      version: "v1",
    },
    prompt: {
      brief: `${normalized.subject}; ${normalized.wardrobe}; ${normalized.pose}; ${normalized.environment}`,
      preset: normalized.preset.label,
      rationale: "Compiled from Studio Preset Library and Studio Prompt Compiler",
      positivePrompt: compiled.positive_prompt,
      negativePrompt: compiled.negative_prompt,
      params: {
        cfg: compiled.params.cfg,
        steps: compiled.params.steps,
        aspectRatio: normalized.aspect_ratio,
      },
      qcChecklist: compiled.qc_tags,
    },
    generation: {
      provider: "vertex-imagen",
      model: process.env.STUDIO_GENERATION_MODEL || "imagen-3.0-generate-002",
      variants: 1,
      seedPolicy: normalized.seed_policy,
      seeds,
      aspectRatio: normalized.aspect_ratio,
      cfg: compiled.params.cfg,
      steps: compiled.params.steps,
    },
    studio: {
      preset_id: normalized.preset_id,
      identity_id: normalized.identity_id,
      subject: normalized.subject,
      wardrobe: normalized.wardrobe,
      pose: normalized.pose,
      environment: normalized.environment,
      compiled_prompt: compiled,
      params_receipt: paramsReceipt,
    },
    createdAt: new Date().toISOString(),
  };

  return {
    normalized_input: normalized,
    compiled_prompt: compiled,
    params_receipt: paramsReceipt,
    low_level_payload: lowLevelPayload,
  };
}
