import { useEffect, useMemo, useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatusPill from "../components/ui/StatusPill";
import MetricCard from "../components/ui/MetricCard";
import JobReceipt from "../components/JobReceipt";
import StudioWorkflowStrip from "../components/ui/StudioWorkflowStrip";
import StudioPageGuide from "../components/ui/StudioPageGuide";
import { useToast } from "../components/ToastProvider";
import {
  archiveMikageRun,
  decideMikageCanonGate,
  getMikageOverview,
  getMikageRun,
  listMikageJobs,
  listMikageRuns,
  runMikageBatch,
  runMikageThreeModes,
  rerunMikagePipeline,
  rerunMikageMode,
  updateMikageReview,
} from "../lib/mikageClient";

const MODE_ORDER = [
  "canon_core",
  "luminous_fan_appeal",
  "luxury_mystical_editorial",
];

function queueLabel(runItem) {
  if (!runItem) return "queued";
  const live = String(runItem.live_status || runItem.workflow_status || "").toLowerCase();
  if (["queued", "running", "completed", "reviewed", "canonized", "archived"].includes(live)) {
    return live;
  }
  if (runItem.status === "archived") return "archived";
  if (runItem.status === "canon_approved") return "canonized";
  if (runItem.status === "ready_for_review") return "completed";
  if (String(runItem.stage || "").toLowerCase().includes("generate")) return "running";
  return "queued";
}

function queueTone(status) {
  if (status === "running") return "info";
  if (status === "queued") return "warning";
  if (status === "archived" || status === "canonized") return "success";
  if (status === "completed" || status === "reviewed") return "info";
  return "warning";
}

export default function ImageFactory() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [canonMode, setCanonMode] = useState("canon_core");
  const [canonAssetId, setCanonAssetId] = useState("");
  const [canonNotes, setCanonNotes] = useState("");
  const [timelineStage, setTimelineStage] = useState("Run Three Modes");
  const [clientFilter, setClientFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [receiptDrawer, setReceiptDrawer] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState({
    job_id: "",
    canon_seed: "110771",
    batch_size: "3",
    variant_runs: "2",
    rerun_sequences: "0",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [next, queueRuns, queueJobs] = await Promise.all([getMikageOverview(), listMikageRuns(), listMikageJobs()]);
      setOverview(next);
      setRuns(Array.isArray(queueRuns) ? queueRuns : []);
      const jobItems = Array.isArray(queueJobs) ? queueJobs : [];
      setJobs(jobItems);
      if (jobItems.length > 0) {
        setRuntimeConfig((current) => ({
          ...current,
          job_id: current.job_id || jobItems[0].id,
        }));
      }
      const runItems = Array.isArray(queueRuns) ? queueRuns : [];
      if (runItems.length > 0) {
        setSelectedRunId((current) => current || runItems[0].id);
      }
    } catch (error) {
      setError(error.message || "Failed to load production queue.");
      toast.error(error.message || "Failed to load production queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedRun = useMemo(
    () => runs.find((item) => item.id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  const run = selectedRunDetail || selectedRun;

  const filteredRuns = useMemo(() => {
    return runs.filter((item) => {
      const runClient = String(item?.job?.client_name || "").toLowerCase();
      const runProject = String(item?.job?.title || "").toLowerCase();
      const runCampaign = String(item?.job?.campaign_name || "").toLowerCase();
      const runCollection = String(item?.job?.collection || "").toLowerCase();
      const runModeList = Array.isArray(item?.mode_results)
        ? item.mode_results.map((modeItem) => modeItem.mode)
        : [];
      const runStatus = queueLabel(item);
      const runDate = String(item?.created_at || "").slice(0, 10);

      if (clientFilter.trim() && !runClient.includes(clientFilter.trim().toLowerCase())) {
        return false;
      }
      if (projectFilter.trim() && !runProject.includes(projectFilter.trim().toLowerCase())) {
        return false;
      }
      if (campaignFilter.trim() && !runCampaign.includes(campaignFilter.trim().toLowerCase())) {
        return false;
      }
      if (collectionFilter.trim() && !runCollection.includes(collectionFilter.trim().toLowerCase())) {
        return false;
      }
      if (modeFilter !== "all" && !runModeList.includes(modeFilter)) return false;
      if (statusFilter !== "all" && runStatus !== statusFilter) return false;
      if (dateFilter && runDate !== dateFilter) return false;
      return true;
    });
  }, [runs, clientFilter, campaignFilter, projectFilter, collectionFilter, modeFilter, statusFilter, dateFilter]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunDetail(null);
      return;
    }
    let mounted = true;
    getMikageRun(selectedRunId)
      .then((item) => {
        if (!mounted) return;
        setSelectedRunDetail(item);
      })
      .catch(() => {
        if (!mounted) return;
        setSelectedRunDetail(null);
      });

    return () => {
      mounted = false;
    };
  }, [selectedRunId]);

  useEffect(() => {
    setReviewNotes(run?.review_sheet?.operator_notes || "");
    const resolvedMode = run?.canon_gate_decision?.selected_mode || run?.mode_results?.[0]?.mode || "canon_core";
    setCanonMode(resolvedMode);
    const firstAsset = run?.mode_results
      ?.find((item) => item.mode === resolvedMode)
      ?.output_refs?.[0]?.id;
    setCanonAssetId(run?.canon_gate_decision?.selected_output_id || firstAsset || "");
    setCanonNotes(run?.canon_gate_decision?.rationale || "");
    const activeTimeline = Array.isArray(run?.timeline)
      ? run.timeline.find((item) => item.active)
      : null;
    setTimelineStage(activeTimeline?.label || "Run Three Modes");
  }, [run?.id]);

  const metrics = overview?.metrics || {
    runs_total: 0,
    mode_success_total: 0,
    mode_failed_total: 0,
    archive_assets_total: 0,
  };

  const selectedModeResult = useMemo(() => {
    if (!run?.mode_results) return null;
    return run.mode_results.find((item) => item.mode === canonMode) || null;
  }, [run?.mode_results, canonMode]);

  const selectedTimelineMetadata = useMemo(() => {
    if (!Array.isArray(run?.timeline)) return null;
    return run.timeline.find((item) => item.label === timelineStage) || null;
  }, [run?.timeline, timelineStage]);

  const selectedReviewClassification =
    run?.review_score?.classification || run?.archive_asset?.classification || "n/a";

  const selectedReviewScore =
    Number.isFinite(Number(run?.review_score?.total_score))
      ? Number(run.review_score.total_score)
      : "n/a";

  const rerunMode = async (mode) => {
    if (!run) return;
    setBusyAction(`rerun:${mode}`);
    try {
      await rerunMikageMode(run.id, mode, "operator");
      await load();
      toast.success(`Rerun complete for ${mode}.`);
    } catch (error) {
      toast.error(error.message || "Rerun failed.");
    } finally {
      setBusyAction("");
    }
  };

  const runSingle = async () => {
    if (!runtimeConfig.job_id) {
      toast.info("Select a job first.");
      return;
    }
    setBusyAction("run-single");
    try {
      const item = await runMikageThreeModes({
        job_id: runtimeConfig.job_id,
        actor: "operator",
        canon_seed: Number(runtimeConfig.canon_seed || 110771),
        batch_size: Number(runtimeConfig.batch_size || 3),
      });
      await load();
      if (item?.id) setSelectedRunId(item.id);
      toast.success("Generation run created.");
    } catch (error) {
      toast.error(error.message || "Failed to launch generation run.");
    } finally {
      setBusyAction("");
    }
  };

  const runBatch = async () => {
    if (!runtimeConfig.job_id) {
      toast.info("Select a job first.");
      return;
    }
    setBusyAction("run-batch");
    try {
      await runMikageBatch(runtimeConfig.job_id, {
        actor: "operator",
        canon_seed: Number(runtimeConfig.canon_seed || 110771),
        batch_size: Number(runtimeConfig.batch_size || 3),
        variant_runs: Number(runtimeConfig.variant_runs || 0),
        rerun_sequences: Number(runtimeConfig.rerun_sequences || 0),
      });
      await load();
      toast.success("Batch generation created.");
    } catch (error) {
      toast.error(error.message || "Failed to launch batch generation.");
    } finally {
      setBusyAction("");
    }
  };

  const rerunPipeline = async () => {
    if (!run) return;
    setBusyAction("rerun-pipeline");
    try {
      const result = await rerunMikagePipeline(run.id, "operator");
      await load();
      if (result?.run?.id) {
        setSelectedRunId(result.run.id);
      }
      toast.success("Pipeline rerun created as a new run.");
    } catch (error) {
      toast.error(error.message || "Failed to rerun full pipeline.");
    } finally {
      setBusyAction("");
    }
  };

  const saveReview = async () => {
    if (!run) return;
    setBusyAction("review");
    try {
      await updateMikageReview(run.id, {
        operator_notes: reviewNotes,
        next_action: "canon_gate",
      });
      await load();
      setSelectedRunDetail(await getMikageRun(run.id));
      toast.success("Review sheet updated.");
    } catch (error) {
      toast.error(error.message || "Failed to save review sheet.");
    } finally {
      setBusyAction("");
    }
  };

  const approveCanon = async () => {
    if (!run) return;
    setBusyAction("canon");
    try {
      await decideMikageCanonGate(run.id, {
        selected_mode: canonMode,
        selected_output_id: canonAssetId || undefined,
        rationale: canonNotes || "Approved for canon baseline.",
        approved_by: "operator",
      });
      await load();
      setSelectedRunDetail(await getMikageRun(run.id));
      toast.success("Canon selection approved.");
    } catch (error) {
      toast.error(error.message || "Canon approval failed.");
    } finally {
      setBusyAction("");
    }
  };

  const archiveRun = async () => {
    if (!run) return;
    setBusyAction("archive");
    try {
      await archiveMikageRun(run.id, {
        proof_worthy: true,
        lineage_note: "archived from Image Factory operator flow",
      });
      await load();
      setSelectedRunDetail(await getMikageRun(run.id));
      toast.success("Run archived with lineage metadata.");
    } catch (error) {
      toast.error(error.message || "Archive failed.");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="imagefactory-shell mx-auto w-full max-w-7xl min-w-0 space-y-6 overflow-x-hidden">
      <GlassPanel variant="hero" className="rounded-3xl p-6">
        <SectionHeader
          title="Image Factory"
          subtitle="Generate Outputs"
          right={<StatusPill tone="info">operator floor</StatusPill>}
        />
        <p className="imagefactory-sub mt-3">
          Review all three modes, choose canon, inspect timeline metadata, and archive with lineage.
        </p>
        <StudioWorkflowStrip
          currentStep={run?.stage === "Review" ? "Review" : run?.stage === "Canon Gate" ? "Canon" : run?.stage === "Archive" ? "Archive" : "Generate"}
          className="mt-4"
        />
        <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-neutral-300">
          This tab is the operator runtime for production decisions. Use it after compile. Next step: review mode comparison, then canon gate and archive.
        </div>
      </GlassPanel>

      <StudioPageGuide
        purpose="Execute generation runs and track runtime queue status."
        happensHere="You launch single or batch runs, inspect outputs, and control reruns by mode."
        nextStep="After generation, score and compare outputs in Review Outputs."
      />

      {error ? (
        <GlassPanel className="rounded-2xl p-4">
          <div className="text-sm text-red-200">{error}</div>
          <button type="button" onClick={load} className="promptlab-btn-secondary mt-3">
            Retry Runtime Sync
          </button>
        </GlassPanel>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Runs" value={metrics.runs_total} className="dashboard-card" />
        <MetricCard label="Mode Success" value={metrics.mode_success_total} className="dashboard-card" />
        <MetricCard label="Mode Failed" value={metrics.mode_failed_total} className="dashboard-card" />
        <MetricCard label="Archived" value={metrics.archive_assets_total} className="dashboard-card" />
      </section>

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader title="Generation Runtime" subtitle="model-connected launch for single and batch runs" />
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <select
            value={runtimeConfig.job_id}
            onChange={(event) => setRuntimeConfig((current) => ({ ...current, job_id: event.target.value }))}
            className="promptlab-input md:col-span-2"
          >
            {jobs.length < 1 ? <option value="">No jobs</option> : null}
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {(job.project_name || job.title || "Untitled")} | {(job.client_name || "Unknown")}
              </option>
            ))}
          </select>
          <input
            value={runtimeConfig.canon_seed}
            onChange={(event) => setRuntimeConfig((current) => ({ ...current, canon_seed: event.target.value }))}
            placeholder="Canon seed"
            className="promptlab-input"
          />
          <input
            value={runtimeConfig.batch_size}
            onChange={(event) => setRuntimeConfig((current) => ({ ...current, batch_size: event.target.value }))}
            placeholder="Batch size"
            className="promptlab-input"
          />
          <input
            value={runtimeConfig.variant_runs}
            onChange={(event) => setRuntimeConfig((current) => ({ ...current, variant_runs: event.target.value }))}
            placeholder="Variant runs"
            className="promptlab-input"
          />
          <input
            value={runtimeConfig.rerun_sequences}
            onChange={(event) => setRuntimeConfig((current) => ({ ...current, rerun_sequences: event.target.value }))}
            placeholder="Rerun sequences"
            className="promptlab-input"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={runSingle} disabled={Boolean(busyAction)} className="promptlab-btn-primary">
            {busyAction === "run-single" ? "Launching..." : "Run Three Modes"}
          </button>
          <button type="button" onClick={runBatch} disabled={Boolean(busyAction)} className="promptlab-btn-secondary">
            {busyAction === "run-batch" ? "Launching Batch..." : "Run Batch"}
          </button>
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          Outputs are persisted into job folders under data/job-assets for archive lineage and retrieval.
        </div>
      </GlassPanel>

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader title="Run Filters" subtitle="client / campaign / project / mode / status / date" />
        <div className="mt-3 grid gap-3 md:grid-cols-8">
          <input value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} placeholder="Client" className="promptlab-input" />
          <input value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} placeholder="Campaign" className="promptlab-input" />
          <input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Project" className="promptlab-input" />
          <input value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)} placeholder="Collection" className="promptlab-input" />
          <select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)} className="promptlab-input">
            <option value="all">All modes</option>
            <option value="canon_core">canon_core</option>
            <option value="luminous_fan_appeal">luminous_fan_appeal</option>
            <option value="luxury_mystical_editorial">luxury_mystical_editorial</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="promptlab-input">
            <option value="all">All status</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="reviewed">reviewed</option>
            <option value="canonized">canonized</option>
            <option value="archived">archived</option>
          </select>
          <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="promptlab-input" />
          <button
            type="button"
            className="promptlab-btn-secondary"
            onClick={() => {
              setClientFilter("");
              setCampaignFilter("");
              setProjectFilter("");
              setCollectionFilter("");
              setModeFilter("all");
              setStatusFilter("all");
              setDateFilter("");
            }}
          >
            Reset
          </button>
        </div>
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Queue" subtitle="queued / processing / completed / failed" />
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
                Loading runs and lineage...
              </div>
            ) : filteredRuns.length < 1 ? (
              <div className="rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
                No runs for current filters. Next step: open Brief Compiler and run three modes. Demo data appears after first backend seed initialization.
              </div>
            ) : (
              filteredRuns.map((item) => {
                const status = queueLabel(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedRunId(item.id)}
                    className={`archive-asset-card w-full text-left ${selectedRunId === item.id ? "active" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white">{item.id.slice(0, 12)}</div>
                      <StatusPill tone={queueTone(status)}>{status}</StatusPill>
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">{item?.job?.client_name || "n/a"}</div>
                    <div className="text-xs text-neutral-500">campaign {item?.job?.campaign_name || "default-campaign"}</div>
                    <div className="text-xs text-neutral-500">{item?.job?.title || "n/a"}</div>
                    <div className="text-[11px] text-neutral-500">collection {item?.job?.collection || "core"}</div>
                  </button>
                );
              })
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="rounded-2xl p-4 xl:col-span-2">
          <SectionHeader title="Run Detail" subtitle="Understand full pipeline in one panel" />
          {!run ? (
            <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
              Select a run to inspect timeline, review comparison, and lineage.
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Run Timeline</div>
                <div className="flex flex-wrap gap-2">
                  {(run.timeline || []).map((stage) => (
                    <button
                      key={stage.key}
                      type="button"
                      onClick={() => setTimelineStage(stage.label)}
                      className={`rounded-full border px-3 py-1 text-xs ${timelineStage === stage.label ? "border-cyan-400 bg-cyan-950/40 text-cyan-200" : "border-white/20 bg-black/30 text-neutral-300"}`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-white/15 bg-black/30 p-2 text-xs text-neutral-300">
                  <div className="mb-1 text-neutral-500">Stage metadata: {timelineStage}</div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-neutral-300">
                    {JSON.stringify(selectedTimelineMetadata?.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Batch Orchestration</div>
                {!run.batch ? (
                  <div className="text-xs text-neutral-400">This run was executed as a single pipeline.</div>
                ) : (
                  <div className="grid gap-2 text-xs text-neutral-300 md:grid-cols-2">
                    <div>batch id: {run.batch.id.slice(0, 12)}</div>
                    <div>status: {run.batch.status}</div>
                    <div>kind: {run.batch_kind || "primary"}</div>
                    <div>progress: {run.batch.progress?.completed || 0}/{run.batch.progress?.total || 0}</div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Review Comparison Grid</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {MODE_ORDER.map((mode) => {
                    const result = run.mode_results?.find((item) => item.mode === mode) || null;
                    return (
                      <div key={mode} className={`rounded-xl border p-3 ${canonMode === mode ? "border-cyan-400/60 bg-cyan-950/20" : "border-white/15 bg-black/30"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-white">{mode}</div>
                          <StatusPill tone={result?.status === "failed" ? "danger" : "success"}>{result?.status || "missing"}</StatusPill>
                        </div>
                        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                          {result?.output_refs?.[0]?.preview_data_url || result?.output_refs?.[0]?.preview_url ? (
                            <img
                              src={result.output_refs[0].preview_data_url || result.output_refs[0].preview_url}
                              alt={mode}
                              className="h-40 w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-40 place-items-center text-xs text-neutral-500">No image</div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-neutral-400">seed {result?.seed ?? "n/a"}</div>
                        <div className="mt-1 text-xs text-neutral-500">sampler {result?.generation_params?.sampler || "n/a"}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          steps {result?.generation_params?.steps ?? "n/a"} | cfg {result?.generation_params?.cfg ?? "n/a"}
                        </div>
                        <div className="mt-2">
                          <JobReceipt receipt={result?.output_refs?.[0]?.receipt || null} />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const output = result?.output_refs?.[0] || null;
                            setReceiptDrawer({
                              preset: run?.intake_brief?.preset || "mikage-porcelain-canon",
                              mode,
                              prompt: result?.prompt || output?.receipt?.positive_prompt || "",
                              negative_prompt:
                                result?.negative_prompt || output?.receipt?.negative_prompt || "",
                              sampler:
                                result?.generation_params?.sampler || output?.receipt?.sampler || "n/a",
                              steps:
                                result?.generation_params?.steps ?? output?.receipt?.steps ?? "n/a",
                              cfg: result?.generation_params?.cfg ?? output?.receipt?.cfg ?? "n/a",
                              seed: result?.seed ?? output?.receipt?.seed ?? "n/a",
                              asset_url:
                                output?.asset_url || output?.receipt?.asset_url || output?.preview_url || "",
                              review_score: selectedReviewScore,
                              classification: selectedReviewClassification,
                              timestamps: {
                                run_created_at: run?.created_at || "",
                                run_updated_at: run?.updated_at || "",
                                generated_at: output?.timestamp || output?.receipt?.timestamp || "",
                                reviewed_at: run?.review_score?.timestamp || "",
                                archived_at: run?.archive_asset?.archived_at || "",
                              },
                            });
                          }}
                          className="promptlab-btn-secondary mt-2"
                        >
                          Open Job Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => rerunMode(mode)}
                          disabled={Boolean(busyAction)}
                          className="promptlab-btn-secondary mt-3"
                        >
                          {busyAction === `rerun:${mode}` ? "Rerunning..." : "Rerun Failed Mode"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCanonMode(mode);
                            setCanonAssetId(result?.output_refs?.[0]?.id || "");
                            setCanonNotes((current) => current || `Promoted from ${mode}.`);
                          }}
                          className="promptlab-btn-primary mt-2"
                        >
                          Promote To Canon
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Review Sheet</div>
                  <div className="mb-2 rounded-xl border border-white/15 bg-black/30 p-2 text-xs text-neutral-400">
                    next action {run?.review_sheet?.next_action || "review"} | updated {run?.review_sheet?.updated_at ? new Date(run.review_sheet.updated_at).toLocaleString() : "n/a"}
                  </div>
                  <textarea
                    rows={6}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Operator review notes, QC findings, and next action"
                    className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
                  />
                  <button type="button" onClick={saveReview} disabled={busyAction === "review"} className="promptlab-btn-secondary mt-3">
                    {busyAction === "review" ? "Saving..." : "Save Review Sheet"}
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Canon Gate</div>
                    <div className="grid gap-2">
                      {MODE_ORDER.map((mode) => (
                        <label key={mode} className="rounded-lg border border-white/15 bg-black/30 p-2 text-xs text-neutral-200">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="canon_mode"
                              value={mode}
                              checked={canonMode === mode}
                              onChange={() => {
                                setCanonMode(mode);
                                const result = run.mode_results?.find((item) => item.mode === mode);
                                setCanonAssetId(result?.output_refs?.[0]?.id || "");
                              }}
                            />
                            <span>{mode}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-neutral-400">Winning asset</div>
                    <select value={canonAssetId} onChange={(event) => setCanonAssetId(event.target.value)} className="promptlab-input mt-1">
                      {(selectedModeResult?.output_refs || []).map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.label || asset.id.slice(0, 10)}</option>
                      ))}
                    </select>
                    <textarea
                      rows={3}
                      value={canonNotes}
                      onChange={(event) => setCanonNotes(event.target.value)}
                      placeholder="Canon rationale and notes"
                      className="mt-3 w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>

                  <button type="button" onClick={rerunPipeline} disabled={busyAction === "rerun-pipeline"} className="promptlab-btn-secondary w-full">
                    {busyAction === "rerun-pipeline" ? "Re-running..." : "Rerun Pipeline"}
                  </button>
                  <button type="button" onClick={approveCanon} disabled={busyAction === "canon"} className="promptlab-btn-primary w-full">
                    {busyAction === "canon" ? "Approving..." : "Mark As Canon"}
                  </button>
                  <button type="button" onClick={archiveRun} disabled={busyAction === "archive"} className="promptlab-btn-primary w-full">
                    {busyAction === "archive" ? "Archiving..." : "Send To Archive"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Seed Governance</div>
                <div className="grid gap-2 text-xs text-neutral-300 md:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2" title="Canon seed stays fixed across the run and is never drifted.">
                    canon seed: locked
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2" title="Luminous mode reuses canon seed so style shifts without seed drift.">
                    luminous seed: reused from canon
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2" title="Luxury mode uses independent seed for editorial exploration.">
                    luxury seed: independent
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Run Lineage Viewer</div>
                <div className="flex flex-wrap gap-2">
                  {(run.lineage_chain || []).map((node) => (
                    <div key={node.key} className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-neutral-200">
                      {node.label}: {node.state}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-neutral-400">
                  {"chain intake -> run-three-modes -> mode outputs -> rerun -> canon gate -> archive"}
                </div>
              </div>

              {receiptDrawer ? (
                <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
                    <span>Job Receipt Panel</span>
                    <button
                      type="button"
                      onClick={() => setReceiptDrawer(null)}
                      className="promptlab-btn-secondary"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid gap-2 text-xs text-neutral-300 md:grid-cols-2">
                    <div>preset: {receiptDrawer.preset || "n/a"}</div>
                    <div>mode: {receiptDrawer.mode || "n/a"}</div>
                    <div className="md:col-span-2">prompt: {receiptDrawer.prompt || "n/a"}</div>
                    <div className="md:col-span-2">negative: {receiptDrawer.negative_prompt || "n/a"}</div>
                    <div>sampler: {receiptDrawer.sampler || "n/a"}</div>
                    <div>steps: {receiptDrawer.steps}</div>
                    <div>cfg: {receiptDrawer.cfg}</div>
                    <div>seed: {receiptDrawer.seed}</div>
                    <div className="md:col-span-2">asset url: {receiptDrawer.asset_url || "n/a"}</div>
                    <div>review score: {receiptDrawer.review_score}</div>
                    <div>classification: {receiptDrawer.classification}</div>
                    <div>run created: {receiptDrawer.timestamps?.run_created_at || "n/a"}</div>
                    <div>run updated: {receiptDrawer.timestamps?.run_updated_at || "n/a"}</div>
                    <div>generated: {receiptDrawer.timestamps?.generated_at || "n/a"}</div>
                    <div>reviewed: {receiptDrawer.timestamps?.reviewed_at || "n/a"}</div>
                    <div>archived: {receiptDrawer.timestamps?.archived_at || "n/a"}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
