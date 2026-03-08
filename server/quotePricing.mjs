const packageRules = {
  starter: {
    basePrice: 600,
    includedFinalImages: 4,
    includedDirections: 1,
    includedRevisionRounds: 1,
    extraImagePrice: 110,
    extraDirectionPrice: 220,
    extraRevisionPrice: 160,
    baseTimelineDays: 7,
    assumptions: [
      "Client provides approved brief and brand references before kickoff.",
      "One review checkpoint per direction is included.",
    ],
  },
  growth: {
    basePrice: 1200,
    includedFinalImages: 8,
    includedDirections: 2,
    includedRevisionRounds: 2,
    extraImagePrice: 95,
    extraDirectionPrice: 180,
    extraRevisionPrice: 140,
    baseTimelineDays: 10,
    assumptions: [
      "Production schedule assumes consolidated feedback per review round.",
      "Delivery includes web-resolution exports and source prompts.",
    ],
  },
  campaign: {
    basePrice: 2200,
    includedFinalImages: 16,
    includedDirections: 3,
    includedRevisionRounds: 3,
    extraImagePrice: 80,
    extraDirectionPrice: 170,
    extraRevisionPrice: 130,
    baseTimelineDays: 14,
    assumptions: [
      "Brand-side stakeholders are available for weekly review sessions.",
      "Complex retouching beyond standard polish is quoted separately.",
    ],
  },
};

const urgencyMultiplier = {
  standard: 1,
  rush: 1.25,
  urgent: 1.5,
};

const usageMultiplier = {
  internal: 1,
  digital: 1.15,
  omni: 1.35,
};

const pilotDiscountRate = 0.2;

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export function calculateQuoteDraft(input, job) {
  const packageType = String(input.package_type || "starter").toLowerCase();
  const rules = packageRules[packageType] || packageRules.starter;
  const numberOfFinalImages = Math.max(1, toInt(input.number_of_final_images, rules.includedFinalImages));
  const numberOfDirections = Math.max(1, toInt(input.number_of_directions, rules.includedDirections));
  const revisionRounds = Math.max(0, toInt(input.revision_rounds, rules.includedRevisionRounds));
  const deadlineUrgency = String(input.deadline_urgency || "standard").toLowerCase();
  const usageScope = String(input.usage_scope || "internal").toLowerCase();
  const isPilot =
    input.is_pilot === true ||
    input.is_pilot === 1 ||
    input.is_pilot === "1" ||
    input.is_pilot === "true" ||
    Boolean(job?.is_pilot);

  const extraImages = Math.max(0, numberOfFinalImages - rules.includedFinalImages);
  const extraDirections = Math.max(0, numberOfDirections - rules.includedDirections);
  const extraRevisions = Math.max(0, revisionRounds - rules.includedRevisionRounds);

  const subtotal =
    rules.basePrice +
    extraImages * rules.extraImagePrice +
    extraDirections * rules.extraDirectionPrice +
    extraRevisions * rules.extraRevisionPrice;

  const urgency = urgencyMultiplier[deadlineUrgency] || urgencyMultiplier.standard;
  const usage = usageMultiplier[usageScope] || usageMultiplier.internal;
  const discountedSubtotal = isPilot
    ? Math.round(subtotal * (1 - pilotDiscountRate))
    : subtotal;
  const price = Math.round(discountedSubtotal * urgency * usage);

  const timelineDays = Math.max(
    2,
    Math.round(rules.baseTimelineDays + (numberOfDirections - 1) * 2 + extraRevisions * 1.5)
  );
  const timelineAdjusted =
    deadlineUrgency === "urgent"
      ? Math.max(2, timelineDays - 4)
      : deadlineUrgency === "rush"
      ? Math.max(2, timelineDays - 2)
      : timelineDays;

  const scopeSummary = `${job?.brand || "Brand"} | ${numberOfFinalImages} final images across ${numberOfDirections} directions with ${revisionRounds} revision rounds.`;
  const deliveryTimeline = `${timelineAdjusted} business days from kickoff`;
  const pilotTerms = isPilot
    ? "Pilot terms: introductory scope, one consolidated feedback cycle, and internal/digital usage only unless extended."
    : "";
  const assumptions = [
    ...rules.assumptions,
    `Usage scope: ${usageScope}.`,
    `Client contact: ${job?.contact_info || "to be confirmed"}.`,
    pilotTerms,
  ].join("\n");

  const revisionLimit = isPilot ? Math.min(1, revisionRounds) : revisionRounds;

  return {
    package_type: packageType,
    number_of_final_images: numberOfFinalImages,
    number_of_directions: numberOfDirections,
    revision_rounds: revisionRounds,
    deadline_urgency: deadlineUrgency,
    usage_scope: usageScope,
    price,
    revision_limit: revisionLimit,
    scope_summary: scopeSummary,
    delivery_timeline: deliveryTimeline,
    assumptions,
    is_pilot: isPilot,
  };
}
