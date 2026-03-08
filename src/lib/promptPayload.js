function buildVariantSeeds({ variants, seedPolicy, baseSeed }) {
  if (!Number.isInteger(variants) || variants < 1) return [];
  if (seedPolicy === "random") return Array.from({ length: variants }, () => null);

  const normalizedBaseSeed =
    Number.isInteger(baseSeed) && baseSeed >= 0
      ? baseSeed
      : Math.floor(Math.random() * 1000000000);

  if (seedPolicy === "incremental") {
    return Array.from({ length: variants }, (_, index) => normalizedBaseSeed + index);
  }

  return Array.from({ length: variants }, () => normalizedBaseSeed);
}

export function createPromptLabPayload({
  brief,
  result,
  scores,
  generation = {},
  appVersion = "v1",
}) {
  const variants =
    Number.isInteger(generation.variants) && generation.variants > 0
      ? generation.variants
      : 1;
  const seedPolicy = generation.seedPolicy || "locked";
  const seeds = buildVariantSeeds({
    variants,
    seedPolicy,
    baseSeed: generation.baseSeed,
  });

  return {
    schemaVersion: "2026-03-08",
    source: {
      app: "Musezenith Studio",
      module: "Prompt Lab",
      version: appVersion,
    },
    prompt: {
      brief,
      preset: result.preset,
      rationale: result.rationale,
      positivePrompt: result.positivePrompt,
      negativePrompt: result.negativePrompt,
      params: result.params,
      qcChecklist: result.qcChecklist,
    },
    quality: scores,
    generation: {
      provider: generation.provider || "vertex-imagen",
      model: generation.model || "imagen",
      variants,
      seedPolicy,
      seeds,
      aspectRatio: result.params.aspectRatio,
      cfg: result.params.cfg,
      steps: result.params.steps,
    },
    createdAt: new Date().toISOString(),
  };
}
