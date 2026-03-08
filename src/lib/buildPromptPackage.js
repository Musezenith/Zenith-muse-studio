import { PRESET_CONFIG } from "./promptPresets";

export function autoSuggestPreset(brief, currentPreset = "Dior Chiaroscuro") {
  const t = brief.toLowerCase();

  if (
    t.includes("dark") ||
    t.includes("tối") ||
    t.includes("cinematic") ||
    t.includes("quyền lực") ||
    t.includes("dramatic") ||
    t.includes("shadow")
  ) {
    return "Dior Chiaroscuro";
  }

  if (
    t.includes("minimal") ||
    t.includes("tối giản") ||
    t.includes("intellectual") ||
    t.includes("architectural") ||
    t.includes("quiet luxury")
  ) {
    return "Prada Intellectual";
  }

  if (
    t.includes("idol") ||
    t.includes("beauty") ||
    t.includes("kpop") ||
    t.includes("k-pop") ||
    t.includes("glow")
  ) {
    return "K-pop Glow";
  }

  if (
    t.includes("raw") ||
    t.includes("flash") ||
    t.includes("brutalist") ||
    t.includes("street")
  ) {
    return "Balenciaga Raw Flash";
  }

  return currentPreset;
}

function extractRestrictions(brief) {
  const t = brief.toLowerCase();

  return {
    noText: t.includes("no text") || t.includes("không chữ") || t.includes("no typography"),
    noLogo: t.includes("no logo") || t.includes("không logo"),
    noProps: t.includes("no props") || t.includes("không đạo cụ"),
    noJewelry: t.includes("no jewelry") || t.includes("không trang sức"),
    keepFace: t.includes("keep the face") || t.includes("identity lock") || t.includes("giữ mặt"),
  };
}

export function buildPromptPackage(brief, selectedPreset) {
  const preset = PRESET_CONFIG[selectedPreset];
  const restrictions = extractRestrictions(brief);

  const subjectBlock = `subject and identity: ${brief}`;
  const wardrobeBlock =
    "wardrobe and styling: luxurious fashion styling, realistic textile behavior, visible fabric physics, refined silhouette, premium material separation";
  const poseBlock =
    "pose and framing: confident editorial body language, composed high-fashion posture, clean framing, elegant hand placement";
  const lightingBlock = `lighting recipe: ${preset.lighting.join(", ")}`;
  const environmentBlock = `environment: ${preset.environment.join(", ")}`;
  const cameraBlock = `camera look: ${preset.camera.join(", ")}`;
  const colorBlock =
    "color grade and texture: " +
    `${preset.color.join(", ")}, raw luxury skin detail, preserved pores, no plastic smoothing`;

  const restrictionTokens = [];
  const negativeRestrictions = [];
  const qcRestrictionItems = [];

  if (restrictions.noText) {
    restrictionTokens.push("no text elements in frame");
    negativeRestrictions.push("text", "typography");
    qcRestrictionItems.push("Không có text trong ảnh");
  }

  if (restrictions.noLogo) {
    restrictionTokens.push("no logos or branded marks");
    negativeRestrictions.push("logo", "brand mark");
    qcRestrictionItems.push("Không có logo hoặc brand mark");
  }

  if (restrictions.noProps) {
    restrictionTokens.push("no props");
    negativeRestrictions.push("props", "extra objects");
    qcRestrictionItems.push("Không có props hoặc vật thể thừa");
  }

  if (restrictions.noJewelry) {
    restrictionTokens.push("no jewelry");
    negativeRestrictions.push("necklace", "earrings", "bracelet", "rings", "jewelry");
    qcRestrictionItems.push("Không có trang sức");
  }

  const positivePrompt = [
    ...preset.styleTokens,
    subjectBlock,
    wardrobeBlock,
    poseBlock,
    lightingBlock,
    environmentBlock,
    cameraBlock,
    colorBlock,
    ...restrictionTokens,
    restrictions.keepFace
      ? "identity-preserved face, facial structure unchanged, hairstyle unchanged unless explicitly requested"
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const negativePrompt = [...preset.negative, ...negativeRestrictions]
    .filter(Boolean)
    .join(", ");

  const params = {
    sampler: preset.params.sampler,
    steps: preset.params.steps,
    cfg: restrictions.keepFace ? Math.min(preset.params.cfg, 6) : preset.params.cfg,
    aspectRatio: preset.params.aspectRatio,
    seedPolicy: restrictions.keepFace
      ? "lock seed strictly for identity consistency"
      : preset.params.seedPolicy,
    identityStrength: restrictions.keepFace ? "very high" : preset.params.identityStrength,
  };

  const qcChecklist = [
    `Preset đúng tinh thần: ${selectedPreset}`,
    "Da còn texture thật, không plastic skin",
    "Chất liệu vải đọc được rõ và có fabric physics",
    "Ánh sáng đúng mood editorial",
    "Pose sạch, tay không lỗi",
    "Background không rối, không vật thể thừa",
    restrictions.keepFace ? "Khuôn mặt được giữ đúng identity" : null,
    ...qcRestrictionItems,
  ].filter(Boolean);

  return {
    preset: selectedPreset,
    rationale: preset.rationale,
    positivePrompt,
    negativePrompt,
    params,
    qcChecklist,
  };
}