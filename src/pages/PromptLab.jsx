import { useMemo, useRef, useState } from "react";
import { PRESET_CONFIG } from "../lib/promptPresets";
import { autoSuggestPreset, buildPromptPackage } from "../lib/buildPromptPackage";
import { createPromptLabPayload } from "../lib/promptPayload";
import { generateImagesWithImagen } from "../lib/imagenClient";
import { saveArchiveEntry } from "../lib/archiveStore";
import { RUN_STATE } from "../lib/runState";
import { useToast } from "../components/ToastProvider";
import { getImageAssetPreviewUrl, normalizeImageAssets } from "../lib/assetSchema";
import BilingualText from "../components/BilingualText";

function scorePromptQuality({ brief, result }) {
  const text = `${brief} ${result.positivePrompt} ${result.negativePrompt}`.toLowerCase();

  let presetFit = 72;
  let luxury = 70;
  let identitySafety = 78;
  let cleanOutput = 76;

  if (
    text.includes("cinematic") ||
    text.includes("chiaroscuro") ||
    text.includes("dramatic editorial authority")
  ) {
    presetFit += 10;
  }

  if (
    text.includes("minimalist") ||
    text.includes("quiet luxury") ||
    text.includes("architectural")
  ) {
    presetFit += 8;
  }

  if (
    text.includes("raw luxury") ||
    text.includes("luxury styling") ||
    text.includes("heritage luxury") ||
    text.includes("refined luxury")
  ) {
    luxury += 12;
  }

  if (
    text.includes("preserved pores") ||
    text.includes("micro-texture") ||
    text.includes("natural skin texture") ||
    text.includes("fabric physics")
  ) {
    luxury += 8;
  }

  if (
    text.includes("identity-preserved face") ||
    text.includes("facial structure unchanged") ||
    result.params.identityStrength === "very high"
  ) {
    identitySafety += 14;
  }

  if (
    result.negativePrompt.includes("plastic skin") &&
    result.negativePrompt.includes("watermark") &&
    result.negativePrompt.includes("logo")
  ) {
    cleanOutput += 10;
  }

  if (
    result.negativePrompt.includes("extra fingers") ||
    result.negativePrompt.includes("deformed hands") ||
    result.negativePrompt.includes("bad anatomy")
  ) {
    cleanOutput += 6;
  }

  return {
    overall: Math.min(
      100,
      Math.round((presetFit + luxury + identitySafety + cleanOutput) / 4)
    ),
    presetFit: Math.min(100, presetFit),
    luxury: Math.min(100, luxury),
    identitySafety: Math.min(100, identitySafety),
    cleanOutput: Math.min(100, cleanOutput),
  };
}

function getScoreBarClass(score) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-green-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function ScoreBar({ label, score }) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-neutral-400">{label}</span>
        <span className="shrink-0 font-medium text-white">{score}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-2 rounded-full ${getScoreBarClass(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function CopyButton({ onClick, copied, label = "Copy" }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function TextBlock({ children }) {
  return (
    <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl border border-neutral-800 bg-black p-4 text-sm leading-7 text-neutral-100">
      {children}
    </div>
  );
}

function getGenerationAssets(generation) {
  const assets = Array.isArray(generation?.assets) ? generation.assets : [];
  if (assets.length > 0) return normalizeImageAssets(assets);
  const legacy = Array.isArray(generation?.images) ? generation.images : [];
  return normalizeImageAssets(legacy);
}

export default function PromptLab() {
  const [brief, setBrief] = useState("");
  const [preset, setPreset] = useState("Dior Chiaroscuro");
  const [output, setOutput] = useState(null);
  const [copiedField, setCopiedField] = useState("");
  const [activeTab, setActiveTab] = useState("positive");
  const [variants, setVariants] = useState(2);
  const [seedPolicy, setSeedPolicy] = useState("locked");
  const [baseSeed, setBaseSeed] = useState(777777);
  const [model, setModel] = useState("imagen-3.0-generate-002");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [lastStructuredPayload, setLastStructuredPayload] = useState(null);
  const [runState, setRunState] = useState(RUN_STATE.IDLE);
  const generateControllerRef = useRef(null);
  const toast = useToast();

  const presetOptions = useMemo(() => Object.keys(PRESET_CONFIG), []);

  const runGeneration = async (structuredPayload) => {
    const controller = new AbortController();
    generateControllerRef.current = controller;
    try {
      return await generateImagesWithImagen(structuredPayload, {
        signal: controller.signal,
      });
    } finally {
      if (generateControllerRef.current === controller) {
        generateControllerRef.current = null;
      }
    }
  };

  const persistRun = ({
    result,
    scores,
    exportPayload,
    structuredPayload,
    generation,
    generationError,
    runState,
  }) => {
    const archiveEntry = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: "prompt-lab-run",
      runState,
      payload: structuredPayload,
      exportPayload,
      generation,
      generationError: generationError || null,
    };
    saveArchiveEntry(archiveEntry).catch((error) => {
      console.error("Archive save failed:", error);
      toast.error("Could not persist run to Archive backend, kept local fallback.");
    });

    setOutput({
      ...result,
      scores,
      exportPayload: {
        ...exportPayload,
        generation,
        generationError: generationError || null,
      },
      structuredPayload,
      generation,
      runState,
    });
    setLastStructuredPayload(structuredPayload);
    setActiveTab("positive");
  };

  const handleGenerate = async () => {
    if (!brief.trim() || isGenerating) return;

    setIsGenerating(true);
    setRunState(RUN_STATE.BUILDING);
    setGenerateError("");
    toast.info("Generating prompt package...");
    try {
      const finalPreset = autoSuggestPreset(brief, preset);
      const result = buildPromptPackage(brief, finalPreset);
      const scores = scorePromptQuality({ brief, result });
      const structuredPayload = createPromptLabPayload({
        brief,
        result,
        scores,
        generation: {
          provider: "vertex-imagen",
          model,
          variants: Number(variants),
          seedPolicy,
          baseSeed: Number(baseSeed),
        },
      });

      const exportPayload = {
        brief,
        preset: result.preset,
        rationale: result.rationale,
        positivePrompt: result.positivePrompt,
        negativePrompt: result.negativePrompt,
        params: result.params,
        qcChecklist: result.qcChecklist,
        scores,
        meta: {
          app: "Musezenith Studio",
          module: "Prompt Lab",
          version: "v1",
        },
        request: structuredPayload.generation,
      };

      let generation = null;
      let generationError = "";
      try {
        setRunState(RUN_STATE.GENERATING);
        toast.info("Sending request to Imagen backend...");
        generation = await runGeneration(structuredPayload);
      } catch (error) {
        if (error.message === "Generation cancelled") {
          setRunState(RUN_STATE.CANCELLED);
          setGenerateError("Generation cancelled.");
          toast.info("Generation cancelled.");
          return;
        }
        generationError = error.message || "Image generation failed";
        setGenerateError(generationError);
        setRunState(RUN_STATE.ERROR);
        toast.error(generationError);
      }

      persistRun({
        result,
        scores,
        exportPayload,
        structuredPayload,
        generation,
        generationError,
        runState: generationError ? RUN_STATE.ERROR : RUN_STATE.SUCCESS,
      });
      if (generationError) {
        setRunState(RUN_STATE.ERROR);
      } else {
        setRunState(RUN_STATE.SUCCESS);
        toast.success("Generation completed.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = async () => {
    if (!output || !lastStructuredPayload || isGenerating) return;

    setIsGenerating(true);
    setRunState(RUN_STATE.GENERATING);
    setGenerateError("");
    toast.info("Retrying generation...");
    try {
      let generation = null;
      let generationError = "";
      try {
        generation = await runGeneration(lastStructuredPayload);
      } catch (error) {
        if (error.message === "Generation cancelled") {
          setRunState(RUN_STATE.CANCELLED);
          setGenerateError("Generation cancelled.");
          toast.info("Generation cancelled.");
          return;
        }
        generationError = error.message || "Image generation failed";
        setGenerateError(generationError);
        setRunState(RUN_STATE.ERROR);
        toast.error(generationError);
      }

      persistRun({
        result: {
          preset: output.preset,
          rationale: output.rationale,
          positivePrompt: output.positivePrompt,
          negativePrompt: output.negativePrompt,
          params: output.params,
          qcChecklist: output.qcChecklist,
        },
        scores: output.scores,
        exportPayload: {
          ...output.exportPayload,
          request: lastStructuredPayload.generation,
        },
        structuredPayload: lastStructuredPayload,
        generation,
        generationError,
        runState: generationError ? RUN_STATE.ERROR : RUN_STATE.SUCCESS,
      });
      if (generationError) {
        setRunState(RUN_STATE.ERROR);
      } else {
        setRunState(RUN_STATE.SUCCESS);
        toast.success("Retry completed.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    generateControllerRef.current?.abort();
  };

  const copyText = async (value, fieldName) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(""), 1200);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden">
      <div className="min-w-0">
        <BilingualText
          as="h1"
          title="Prompt Lab"
          subtitle="Tạo prompt package sẵn sàng cho sản xuất editorial thời trang."
          titleClassName="text-4xl font-semibold tracking-tight text-white"
          subtitleClassName="text-sm text-neutral-400"
        />
      </div>

      <Card>
        <div className="space-y-4 min-w-0">
          <BilingualText
            title="Creative Brief"
            subtitle="Mô tả mục tiêu, mood, ràng buộc để hệ thống dựng prompt."
            titleClassName="text-xs uppercase tracking-[0.2em] text-neutral-500"
          />
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ví dụ: nữ da đen châu Phi, váy ngắn, dark studio, cinematic lighting, mood quyền lực, no logo, no jewelry, keep the face"
            className="min-h-[160px] w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-500"
          />

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-black px-4 py-2.5 text-sm text-white outline-none"
            >
              {presetOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={seedPolicy}
              onChange={(e) => setSeedPolicy(e.target.value)}
              className="rounded-xl border border-neutral-700 bg-black px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="locked">Seed: Locked</option>
              <option value="incremental">Seed: Incremental</option>
              <option value="random">Seed: Random</option>
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-black px-3 py-2.5 text-sm text-neutral-200">
              Variants
              <input
                type="number"
                min={1}
                max={8}
                value={variants}
                onChange={(e) => setVariants(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 border-0 bg-transparent text-right text-white outline-none"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-black px-3 py-2.5 text-sm text-neutral-200">
              Base seed
              <input
                type="number"
                min={0}
                value={baseSeed}
                disabled={seedPolicy === "random"}
                onChange={(e) => setBaseSeed(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 border-0 bg-transparent text-right text-white outline-none disabled:text-neutral-500"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-black px-3 py-2.5 text-sm text-neutral-200">
              Model
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-44 border-0 bg-transparent text-white outline-none"
              />
            </label>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isGenerating ? "Generating..." : "Generate Prompt + Images"}
            </button>

            <button
              onClick={handleRetry}
              disabled={isGenerating || !lastStructuredPayload}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry
            </button>

            <button
              onClick={handleCancel}
              disabled={!isGenerating}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          {generateError && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">
              {generateError}
            </div>
          )}

          <div className="text-xs text-neutral-500">
            Run state: <span className="uppercase">{runState}</span>
          </div>
        </div>
      </Card>

      {output && (
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {[
                { key: "positive", label: "Positive" },
                { key: "negative", label: "Negative" },
                { key: "params", label: "Params" },
                { key: "qc", label: "QC" },
                { key: "json", label: "JSON" },
                { key: "score", label: "Score" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    activeTab === tab.key
                      ? "border-white bg-white text-black"
                      : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "positive" && (
              <section className="min-w-0">
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Preset + rationale
                </div>
                <p className="mb-3 text-xs text-neutral-500">Preset và lý do chọn preset</p>
                <div className="text-lg font-medium text-white">{output.preset}</div>
                <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-neutral-300">
                  {output.rationale}
                </p>
                <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Positive prompt
                    </div>
                    <p className="text-xs text-neutral-500">Prompt dương để tạo ảnh</p>
                  </div>
                  <CopyButton
                    copied={copiedField === "positive"}
                    onClick={() => copyText(output.positivePrompt, "positive")}
                  />
                </div>
                <TextBlock>{output.positivePrompt}</TextBlock>
              </section>
            )}

            {activeTab === "negative" && (
              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Negative prompt
                    </div>
                    <p className="text-xs text-neutral-500">Prompt âm để chặn lỗi thường gặp</p>
                  </div>
                  <CopyButton
                    copied={copiedField === "negative"}
                    onClick={() => copyText(output.negativePrompt, "negative")}
                  />
                </div>
                <TextBlock>{output.negativePrompt}</TextBlock>
              </section>
            )}

            {activeTab === "params" && (
              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Params
                    </div>
                    <p className="text-xs text-neutral-500">Thông số sinh ảnh (steps, cfg, seed...)</p>
                  </div>
                  <CopyButton
                    copied={copiedField === "params"}
                    onClick={() =>
                      copyText(
                        `sampler: ${output.params.sampler} / steps: ${output.params.steps} / CFG: ${output.params.cfg} / aspect ratio: ${output.params.aspectRatio} / seed policy: ${output.params.seedPolicy} / identity strength: ${output.params.identityStrength}`,
                        "params"
                      )
                    }
                  />
                </div>
                <TextBlock>
                  {`sampler: ${output.params.sampler} / steps: ${output.params.steps} / CFG: ${output.params.cfg} / aspect ratio: ${output.params.aspectRatio} / seed policy: ${output.params.seedPolicy} / identity strength: ${output.params.identityStrength}`}
                </TextBlock>
              </section>
            )}

            {activeTab === "qc" && (
              <section className="min-w-0">
                <div className="mb-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
                  QC checklist
                </div>
                <p className="mb-3 text-xs text-neutral-500">Danh sách kiểm tra chất lượng đầu ra</p>
                <div className="min-w-0 rounded-xl border border-neutral-800 bg-black p-4">
                  <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-100">
                    {output.qcChecklist.map((item) => (
                      <li key={item} className="break-words [overflow-wrap:anywhere]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {activeTab === "json" && (
              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      JSON export payload
                    </div>
                    <p className="text-xs text-neutral-500">Payload chuẩn để lưu trữ hoặc tích hợp</p>
                  </div>
                  <CopyButton
                    copied={copiedField === "json"}
                    label="Copy JSON"
                    onClick={() =>
                      copyText(JSON.stringify(output.exportPayload, null, 2), "json")
                    }
                  />
                </div>
                <pre className="min-w-0 max-h-[26rem] overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl border border-neutral-800 bg-black p-4 text-xs leading-6 text-neutral-100">
                  {JSON.stringify(
                    {
                      ...output.exportPayload,
                      payload: output.structuredPayload,
                    },
                    null,
                    2
                  )}
                </pre>
              </section>
            )}

            {activeTab === "score" && (
              <section className="min-w-0">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                      Prompt Score Panel
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">Bảng điểm chất lượng prompt</p>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      Overall Score: {output.scores.overall}/100
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-neutral-700 bg-black px-3 py-1 text-sm text-neutral-200">
                    {output.preset}
                  </div>
                </div>
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <ScoreBar label="Preset fit score" score={output.scores.presetFit} />
                  <ScoreBar label="Luxury score" score={output.scores.luxury} />
                  <ScoreBar
                    label="Identity safety score"
                    score={output.scores.identitySafety}
                  />
                  <ScoreBar
                    label="Clean-output score"
                    score={output.scores.cleanOutput}
                  />
                </div>
              </section>
            )}
          </Card>

          {getGenerationAssets(output.generation).length > 0 && (
            <Card className="overflow-hidden">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Imagen variants ({getGenerationAssets(output.generation).length})
                </div>
                <div className="text-xs text-neutral-400">
                  Model: {output.generation.model}
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {getGenerationAssets(output.generation).map((image) => (
                  <div
                    key={image.id}
                    className="overflow-hidden rounded-xl border border-neutral-800 bg-black"
                  >
                    <img
                      src={getImageAssetPreviewUrl(image)}
                      alt={image.id}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
