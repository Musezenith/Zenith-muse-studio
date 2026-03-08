/**
 * @typedef {Object} StudioPreset
 * @property {string} id
 * @property {string} label
 * @property {string} positive_prompt_base
 * @property {string} negative_prompt_base
 * @property {string} sampler
 * @property {number} steps
 * @property {number} cfg
 * @property {string} aspect_ratio
 * @property {string} seed_policy
 * @property {number} identity_strength_default
 * @property {string} lighting_recipe
 * @property {string} camera_profile
 * @property {string} color_grade
 */

const REQUIRED_KEYS = [
  "id",
  "label",
  "positive_prompt_base",
  "negative_prompt_base",
  "sampler",
  "steps",
  "cfg",
  "aspect_ratio",
  "seed_policy",
  "identity_strength_default",
  "lighting_recipe",
  "camera_profile",
  "color_grade",
];

const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);
const ALLOWED_SEED_POLICIES = new Set(["locked", "semi_locked", "free"]);

/** @type {StudioPreset[]} */
const PRESETS = [
  {
    id: "vogue_cover",
    label: "Vogue Cover",
    positive_prompt_base:
      "high-fashion magazine cover portrait, couture styling, commanding eye contact, premium editorial composition",
    negative_prompt_base:
      "watermark, logo, text overlay, lowres, extra limbs, distorted hands, plastic skin, over-sharpened artifacts",
    sampler: "dpmpp_2m_karras",
    steps: 32,
    cfg: 6.5,
    aspect_ratio: "3:4",
    seed_policy: "locked",
    identity_strength_default: 0.85,
    lighting_recipe: "front beauty dish + soft overhead fill + subtle rim separation",
    camera_profile: "85mm portrait prime, medium compression, center-weighted framing",
    color_grade: "rich contrast, controlled skin highlights, editorial neutral blacks",
  },
  {
    id: "dior_chiaroscuro",
    label: "Dior Chiaroscuro",
    positive_prompt_base:
      "cinematic luxury portrait, deep shadows, sculpted face planes, dramatic chiaroscuro mood",
    negative_prompt_base:
      "flat lighting, noisy shadows, overexposed forehead, text artifacts, watermark, messy background",
    sampler: "dpmpp_2m_karras",
    steps: 34,
    cfg: 7,
    aspect_ratio: "3:4",
    seed_policy: "locked",
    identity_strength_default: 0.88,
    lighting_recipe: "single hard key at 45 degrees + negative fill + narrow rim",
    camera_profile: "105mm portrait lens simulation, shallow depth, low-angle elegance",
    color_grade: "deep bronze shadows, warm highlights, refined film grain touch",
  },
  {
    id: "prada_intellectual",
    label: "Prada Intellectual",
    positive_prompt_base:
      "minimalist high-fashion portrait, intellectual styling, restrained emotion, architectural posture",
    negative_prompt_base:
      "gaudy accessories, loud makeup, crowded scene, neon clutter, over-saturated skin, watermark",
    sampler: "euler_a",
    steps: 30,
    cfg: 6,
    aspect_ratio: "4:3",
    seed_policy: "semi_locked",
    identity_strength_default: 0.82,
    lighting_recipe: "soft side key + broad fill, clean studio gradient backdrop",
    camera_profile: "50mm editorial framing, symmetrical composition bias",
    color_grade: "cool neutrals, matte blacks, subtle desaturation",
  },
  {
    id: "balenciaga_raw_flash",
    label: "Balenciaga Raw Flash",
    positive_prompt_base:
      "raw street-luxury portrait, direct flash punch, intentional harshness, anti-polish fashion energy",
    negative_prompt_base:
      "overly smooth skin, dreamy haze, watercolor texture, text overlay, corporate look",
    sampler: "euler_a",
    steps: 28,
    cfg: 5.8,
    aspect_ratio: "1:1",
    seed_policy: "free",
    identity_strength_default: 0.78,
    lighting_recipe: "on-axis hard flash + minimal ambient spill",
    camera_profile: "35mm close-up with slight perspective aggression",
    color_grade: "high-contrast flash whites, gritty midtones, muted palette",
  },
  {
    id: "kpop_glow",
    label: "K-Pop Glow",
    positive_prompt_base:
      "beauty-forward idol portrait, luminous skin, glossy fashion editorial, energetic pop styling",
    negative_prompt_base:
      "muddy skin tones, lifeless eyes, posterization, text artifacts, watermark, over-noise",
    sampler: "dpmpp_2m_karras",
    steps: 30,
    cfg: 6.2,
    aspect_ratio: "9:16",
    seed_policy: "semi_locked",
    identity_strength_default: 0.8,
    lighting_recipe: "large soft key + edge lights + controlled practical glows",
    camera_profile: "70mm beauty framing, slight top-down angle",
    color_grade: "clean pastel highlights, vibrant accents, polished skin tonality",
  },
  {
    id: "minimal",
    label: "Minimal",
    positive_prompt_base:
      "clean studio portrait, minimal wardrobe and set, modern restrained styling, precise subject focus",
    negative_prompt_base:
      "busy props, cluttered background, excessive color cast, extreme vignette, watermark",
    sampler: "dpmpp_2m_karras",
    steps: 26,
    cfg: 5.5,
    aspect_ratio: "1:1",
    seed_policy: "locked",
    identity_strength_default: 0.84,
    lighting_recipe: "broad soft key + neutral fill + seamless background",
    camera_profile: "50mm normal lens simulation, balanced eye-level framing",
    color_grade: "neutral whites, low-sat palette, smooth tonal rolloff",
  },
  {
    id: "avant_garde",
    label: "Avant-Garde",
    positive_prompt_base:
      "experimental haute couture portrait, bold silhouette, conceptual styling, art-forward visual narrative",
    negative_prompt_base:
      "generic commercial look, bland wardrobe, compression artifacts, text overlay, watermark",
    sampler: "euler_a",
    steps: 36,
    cfg: 7.4,
    aspect_ratio: "4:3",
    seed_policy: "free",
    identity_strength_default: 0.76,
    lighting_recipe: "multi-source sculpting with colored accents and hard edge separation",
    camera_profile: "40mm dynamic framing with intentional asymmetry",
    color_grade: "high-fashion stylized contrast with selective color emphasis",
  },
];

function clonePreset(preset) {
  return { ...preset };
}

function validatePresetShape(preset, index) {
  if (!preset || typeof preset !== "object") {
    throw new Error(`Preset at index ${index} must be an object`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in preset)) {
      throw new Error(`Preset ${preset?.id || index} missing required key: ${key}`);
    }
  }
  for (const key of REQUIRED_KEYS) {
    const value = preset[key];
    if (["steps", "cfg", "identity_strength_default"].includes(key)) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        throw new Error(`Preset ${preset.id} key ${key} must be numeric`);
      }
      continue;
    }
    if (typeof value !== "string" || value.trim().length < 1) {
      throw new Error(`Preset ${preset.id} key ${key} must be a non-empty string`);
    }
  }
  const steps = Number(preset.steps);
  const cfg = Number(preset.cfg);
  const identityStrength = Number(preset.identity_strength_default);
  if (steps < 1 || steps > 100) throw new Error(`Preset ${preset.id} steps out of range`);
  if (cfg < 1 || cfg > 20) throw new Error(`Preset ${preset.id} cfg out of range`);
  if (identityStrength < 0 || identityStrength > 1) {
    throw new Error(`Preset ${preset.id} identity_strength_default must be within [0,1]`);
  }
  if (!ALLOWED_ASPECT_RATIOS.has(String(preset.aspect_ratio))) {
    throw new Error(`Preset ${preset.id} has unsupported aspect_ratio`);
  }
  if (!ALLOWED_SEED_POLICIES.has(String(preset.seed_policy))) {
    throw new Error(`Preset ${preset.id} has unsupported seed_policy`);
  }
}

export function validateStudioPresetRegistry(presets = PRESETS) {
  if (!Array.isArray(presets) || presets.length < 1) {
    throw new Error("Studio preset registry must be a non-empty array");
  }
  const ids = new Set();
  for (let index = 0; index < presets.length; index += 1) {
    const preset = presets[index];
    validatePresetShape(preset, index);
    if (ids.has(preset.id)) {
      throw new Error(`Duplicate preset id: ${preset.id}`);
    }
    ids.add(preset.id);
  }
  return true;
}

validateStudioPresetRegistry(PRESETS);

const PRESETS_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

export function listStudioPresets() {
  return PRESETS.map(clonePreset);
}

export function getStudioPresetById(id) {
  if (!id) return null;
  const item = PRESETS_BY_ID.get(String(id));
  return item ? clonePreset(item) : null;
}
