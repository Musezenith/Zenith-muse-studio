const MODE_LIBRARY = {
  canon_core: {
    positive_prompt:
      "Mikage porcelain canon portrait, balanced facial structure, premium skin fidelity, controlled luxury lighting",
    negative_prompt:
      "watermark, deformed anatomy, low-detail skin, noisy background, off-brand palette",
    sampler: "dpmpp_2m",
    steps: 32,
    cfg: 6.5,
    seed_policy: "lock",
    output_goal: "Canon-safe baseline assets for decision making",
  },
  luminous_fan_appeal: {
    positive_prompt:
      "Mikage luminous fan appeal, soft cinematic glow, emotional eye contact, social-first composition",
    negative_prompt:
      "harsh shadows, plastic skin, low contrast, cluttered frame, text overlays",
    sampler: "dpmpp_2m",
    steps: 30,
    cfg: 6.2,
    seed_policy: "reuse canon",
    output_goal: "High-attraction outputs for fan-facing channels",
  },
  luxury_mystical_editorial: {
    positive_prompt:
      "Mikage luxury mystical editorial, dramatic couture mood, premium texture rendering, art-direction framing",
    negative_prompt:
      "flat lighting, casual styling, low fabric detail, generic composition",
    sampler: "dpmpp_sde",
    steps: 36,
    cfg: 6.8,
    seed_policy: "independent",
    output_goal: "Editorial-grade hero candidates",
  },
};

export const DEFAULT_MIKAGE_MODES = [
  "canon_core",
  "luminous_fan_appeal",
  "luxury_mystical_editorial",
];

function toText(value, max = 2400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function compilePromptSet({ mode, runObjective = "", project = "Mikage" } = {}) {
  const key = String(mode || "").trim();
  const base = MODE_LIBRARY[key] || MODE_LIBRARY.canon_core;
  const objective = toText(runObjective, 220) || "production validation";

  return {
    mode: key || "canon_core",
    positive_prompt: `${base.positive_prompt}; objective: ${objective}; project: ${project}`,
    negative_prompt: base.negative_prompt,
    sampler: base.sampler,
    steps: base.steps,
    cfg: base.cfg,
    seed_policy: base.seed_policy,
    output_goal: base.output_goal,
  };
}

export function compilePromptSetsForModes({
  modes = DEFAULT_MIKAGE_MODES,
  runObjective = "",
  project = "Mikage",
} = {}) {
  return modes.map((mode) => compilePromptSet({ mode, runObjective, project }));
}
