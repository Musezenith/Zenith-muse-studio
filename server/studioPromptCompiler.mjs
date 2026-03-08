import { getStudioPresetById } from "./studioPresets.mjs";

/**
 * @typedef {Object} StudioPromptCompileInput
 * @property {string} preset
 * @property {string} subject
 * @property {string} wardrobe
 * @property {string} pose
 * @property {string} framing
 * @property {string} environment
 * @property {string} mood
 * @property {string|string[]} [restrictions]
 * @property {boolean} [identity_lock]
 */

const AGGRESSIVE_TOKEN_MAP = [
  [/aggressive/gi, "controlled"],
  [/extreme/gi, "balanced"],
  [/chaotic/gi, "structured"],
  [/harsh/gi, "refined"],
  [/abrasive/gi, "polished"],
  [/raw flash/gi, "controlled flash"],
];

function ensureText(value, field) {
  if (typeof value !== "string") {
    throw new Error(`compileStudioPrompt: ${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`compileStudioPrompt: ${field} is required`);
  }
  return normalized;
}

function normalizeRestrictions(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function softenAggressiveText(text) {
  let out = String(text || "");
  for (const [pattern, replacement] of AGGRESSIVE_TOKEN_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function buildRawLuxuryClause() {
  return [
    "raw luxury aesthetic",
    "preserve pores",
    "preserve micro skin texture",
    "avoid plastic skin",
    "real fabric physics with believable drape, tension, and fold behavior",
  ].join(", ");
}

function buildNegativeFromRestrictions(restrictions) {
  const base = [
    "plastic skin",
    "over-smoothed skin",
    "wax texture",
    "airbrushed face",
    "watermark",
    "logo",
    "text overlay",
    "deformed hands",
    "extra fingers",
    "bad anatomy",
  ];
  const mapped = restrictions.map((rule) => rule.toLowerCase());
  const unique = [...new Set([...base, ...mapped])];
  return unique.join(", ");
}

export function compileStudioPrompt(input) {
  if (!input || typeof input !== "object") {
    throw new Error("compileStudioPrompt: input must be an object");
  }

  const presetId = ensureText(input.preset, "preset");
  const preset = getStudioPresetById(presetId);
  if (!preset) {
    throw new Error(`compileStudioPrompt: unknown preset '${presetId}'`);
  }

  const subject = ensureText(input.subject, "subject");
  const wardrobe = ensureText(input.wardrobe, "wardrobe");
  const pose = ensureText(input.pose, "pose");
  const framing = ensureText(input.framing, "framing");
  const environment = ensureText(input.environment, "environment");
  const mood = ensureText(input.mood, "mood");
  const restrictions = normalizeRestrictions(input.restrictions);
  const identityLock = input.identity_lock === true;

  const styleText = identityLock
    ? softenAggressiveText(`${preset.positive_prompt_base}, ${mood}`)
    : `${preset.positive_prompt_base}, ${mood}`;
  const identityStrength = identityLock
    ? Math.min(1, Number(preset.identity_strength_default) + 0.1)
    : Number(preset.identity_strength_default);

  const sections = [
    // 1) subject & identity
    `subject and identity: ${subject}${
      identityLock
        ? ", identity-preserved face, stable facial geometry, low morphing variance"
        : ""
    }`,
    // 2) wardrobe & styling
    `wardrobe and styling: ${identityLock ? softenAggressiveText(wardrobe) : wardrobe}, ${styleText}`,
    // 3) pose & framing
    `pose and framing: ${pose}, ${framing}`,
    // 4) lighting recipe
    `lighting recipe: ${preset.lighting_recipe}`,
    // 5) environment
    `environment: ${identityLock ? softenAggressiveText(environment) : environment}`,
    // 6) camera look
    `camera look: ${preset.camera_profile}`,
    // 7) color grade & texture
    `color grade and texture: ${preset.color_grade}, ${buildRawLuxuryClause()}`,
  ];

  const positive_prompt = sections.join(" | ");
  const negative_prompt = [
    preset.negative_prompt_base,
    buildNegativeFromRestrictions(restrictions),
    identityLock ? "identity drift, face swap artifacts, over-stylized facial transformation" : "",
  ]
    .filter(Boolean)
    .join(", ");

  const params = {
    sampler: preset.sampler,
    steps: Number(preset.steps),
    cfg: Number(preset.cfg),
    aspect_ratio: preset.aspect_ratio,
    seed_policy: preset.seed_policy,
    identity_strength: identityStrength,
    preset_id: preset.id,
  };

  const qc_tags = [
    "identity_integrity",
    "raw_luxury_texture",
    "fabric_physics_realism",
    "no_plastic_skin",
    identityLock ? "identity_lock_strict" : "identity_lock_normal",
  ];

  return {
    positive_prompt,
    negative_prompt,
    params,
    qc_tags,
  };
}
