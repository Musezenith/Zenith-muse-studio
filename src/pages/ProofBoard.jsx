import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import MetricCard from "../components/ui/MetricCard";
import StatusPill from "../components/ui/StatusPill";
import StudioWorkflowStrip from "../components/ui/StudioWorkflowStrip";
import StudioPageGuide from "../components/ui/StudioPageGuide";
import { useToast } from "../components/ToastProvider";
import {
  createMikageProofSet,
  listMikageArchive,
  listMikageProofSets,
  updateMikageCanonAsset,
  updateMikageReviewScore,
} from "../lib/mikageClient";

function downloadJson(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function ProofBoard() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const clientSafe = searchParams.get("view") === "client";
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [visualTheme, setVisualTheme] = useState("Mikage Zenith Visual Exploration");
  const [creating, setCreating] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [scoring, setScoring] = useState({
    soul_fidelity: 8,
    visual_attraction: 8,
    luxury_editorial: 8,
    usable_asset: 8,
    canon_potential: 8,
    classification: "",
    notes: "",
  });
  const [savingScore, setSavingScore] = useState(false);
  const [assetActionBusyId, setAssetActionBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [proofSets, archiveAssets] = await Promise.all([
        listMikageProofSets(),
        listMikageArchive({ proof_worthy: "true" }),
      ]);
      setSets(proofSets);
      setAssets(archiveAssets);
    } catch (error) {
      setError(error.message || "Failed to load proof sets.");
      toast.error(error.message || "Failed to load proof sets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => sets.filter((item) => selectedIds.includes(item.id)),
    [sets, selectedIds]
  );
  const focusedSet = useMemo(
    () => sets.find((item) => item.id === selectedSetId) || sets[0] || null,
    [sets, selectedSetId]
  );
  const autoClassification =
    Number(scoring.soul_fidelity || 0) +
      Number(scoring.visual_attraction || 0) +
      Number(scoring.luxury_editorial || 0) +
    Number(scoring.usable_asset || 0) +
      Number(scoring.canon_potential || 0) >=
    40
      ? "canon_candidate"
      : "usable_asset";

  useEffect(() => {
    if (sets.length > 0) {
      setSelectedSetId((current) => current || sets[0].id);
    } else {
      setSelectedSetId("");
    }
  }, [sets]);

  const exportBundle = () => {
    if (selected.length < 1) {
      toast.info("Select at least one proof set.");
      return;
    }
    const payload = {
      exported_at: new Date().toISOString(),
      type: "mikage-proof-bundle",
      items: selected,
    };
    downloadJson(`mikage-proof-bundle-${Date.now()}.json`, payload);
    toast.success("Proof bundle exported.");
  };

  const exportCaseStudyPack = () => {
    if (selected.length < 1) {
      toast.info("Select at least one proof set.");
      return;
    }
    const primary = selected[0];
    const hero = primary.archive_asset || null;
    const alternates = selected.slice(1).map((item) => item.archive_asset).filter(Boolean);

    const pack = {
      exported_at: new Date().toISOString(),
      type: "case-study-pack",
      client: primary.metadata?.client || hero?.client_name || "Unknown",
      campaign: primary.metadata?.campaign || hero?.campaign_name || "default-campaign",
      project: primary.metadata?.project || hero?.project_title || "Untitled",
      mode: primary.metadata?.mode || hero?.selected_mode || "n/a",
      visual_theme: primary.metadata?.visual_theme || "Mikage Zenith Visual Exploration",
      hero: hero,
      alternates,
      workflow_timeline: [
        { stage: "Brief", status: "completed" },
        { stage: "Compile", status: "completed" },
        { stage: "Run Three Modes", status: "completed" },
        { stage: "Review", status: "completed" },
        { stage: "Canon Gate", status: "completed" },
        { stage: "Archive", status: "completed" },
        { stage: "Proof Set", status: "completed" },
      ],
      generation_metadata: {
        primary: primary.metadata?.generation_params || null,
        alternates: alternates.map((item) => item?.mode_result?.generation_params || null),
      },
      studio_narrative:
        "Studio orchestrated campaign-safe output through controlled seeding, canon governance, archive intelligence scoring, and curated proof packaging.",
      proof_set_ids: selected.map((item) => item.id),
    };

    const markdown = [
      `# Case Study Pack: ${pack.project}`,
      "",
      `- Client: ${pack.client}`,
      `- Campaign: ${pack.campaign}`,
      `- Mode: ${pack.mode}`,
      `- Visual Theme: ${pack.visual_theme}`,
      `- Exported At: ${pack.exported_at}`,
      "",
      "## Hero Asset",
      `- Run: ${hero?.run_id || "n/a"}`,
      `- Mode: ${hero?.selected_mode || "n/a"}`,
      `- Proof-Worthy: ${hero?.proof_worthy ? "yes" : "no"}`,
      "",
      "## Workflow Summary",
      ...pack.workflow_timeline.map((line) => `- ${line.stage}: ${line.status}`),
      "",
      "## Generation Metadata",
      "```json",
      JSON.stringify(pack.generation_metadata || {}, null, 2),
      "```",
      "",
      "## Studio Narrative",
      pack.studio_narrative,
    ].join("\n");

    downloadJson(`case-study-pack-${Date.now()}.json`, pack);
    downloadText(`case-study-pack-${Date.now()}.md`, markdown);
    toast.success("Case study pack exported (JSON + markdown).");
  };

  const toggleSet = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const toggleAsset = (id) => {
    setSelectedAssetIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const selectedAssets = useMemo(
    () => assets.filter((item) => selectedAssetIds.includes(item.id)),
    [assets, selectedAssetIds]
  );

  const createProofSetFromAssets = async () => {
    if (selectedAssets.length < 1) {
      toast.info("Select archive assets first.");
      return;
    }
    const first = selectedAssets[0];
    setCreating(true);
    try {
      await createMikageProofSet({
        archive_asset_ids: selectedAssets.map((item) => item.id),
        client: first.client_name,
        campaign: first.campaign_name || "default-campaign",
        project: first.project_title,
        mode: first.selected_mode,
        visual_theme: visualTheme,
        case_study_title: `${first.project_title} Proof Set`,
      });
      toast.success("Proof set created from selected archive assets.");
      setSelectedAssetIds([]);
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to create proof set.");
    } finally {
      setCreating(false);
    }
  };

  const submitReviewScore = async () => {
    if (!focusedSet?.run_id) {
      toast.info("Select a proof set linked to a run.");
      return;
    }
    setSavingScore(true);
    try {
      await updateMikageReviewScore(focusedSet.run_id, {
        soul_fidelity: Number(scoring.soul_fidelity),
        visual_attraction: Number(scoring.visual_attraction),
        luxury_editorial: Number(scoring.luxury_editorial),
        usable_asset: Number(scoring.usable_asset),
        canon_potential: Number(scoring.canon_potential),
        classification: scoring.classification || autoClassification,
        notes: scoring.notes,
        reviewer: "proof.operator",
      });
      toast.success("Review scoring saved.");
      await load();
    } catch (error) {
      toast.error(error.message || "Failed to save review scoring.");
    } finally {
      setSavingScore(false);
    }
  };

  const applyAssetDecision = async (asset, next) => {
    if (!asset?.id) return;
    setAssetActionBusyId(asset.id);
    try {
      await updateMikageCanonAsset(asset.id, next);
      await load();
      toast.success("Asset review updated.");
    } catch (error) {
      toast.error(error.message || "Failed to update asset review.");
    } finally {
      setAssetActionBusyId("");
    }
  };

  return (
    <div className="proof-shell mx-auto w-full max-w-7xl min-w-0 space-y-6 overflow-x-hidden">
      <GlassPanel variant="hero" className="rounded-3xl p-6">
        <SectionHeader
          title="Proof Board"
          subtitle="Review Outputs"
          right={<StatusPill tone={clientSafe ? "info" : "success"}>{clientSafe ? "client-safe view" : "evidence-backed"}</StatusPill>}
        />
        <p className="archive-sub mt-3">
          Convert archive-approved outputs into case-study ready proof sets for commercial delivery.
        </p>
        <StudioWorkflowStrip currentStep="Review" className="mt-4" />
        <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-neutral-300">
          Use this tab when operators package proof evidence for sales, case-study, or client delivery. Next step: select archive assets and create proof set.
        </div>
      </GlassPanel>

      <StudioPageGuide
        purpose="Review generated outputs and decide what should move forward."
        happensHere="You keep or reject assets, score quality, tag fan appeal, and promote canon candidates."
        nextStep="Send approved candidates to Approve as Canon for final gate decision."
      />

      {error ? (
        <GlassPanel className="rounded-2xl p-4">
          <div className="text-sm text-red-200">{error}</div>
          <button type="button" onClick={load} className="promptlab-btn-secondary mt-3">
            Retry Proof Sync
          </button>
        </GlassPanel>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Proof Sets" value={sets.length} className="dashboard-card" />
        <MetricCard label="Selected" value={selected.length} className="dashboard-card" />
        <MetricCard label="Export Ready" value={sets.filter((item) => item.export_status === "ready").length} className="dashboard-card" />
      </section>

      {!clientSafe ? (
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Review Board Scoring" subtitle="1-10 scoring and canon classification" />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              ["soul_fidelity", "Soul Fidelity"],
              ["visual_attraction", "Visual Attraction"],
              ["luxury_editorial", "Luxury Editorial"],
              ["usable_asset", "Usable Asset"],
              ["canon_potential", "Canon Potential"],
            ].map(([key, label]) => (
              <label key={key} className="text-xs text-neutral-300">
                {label}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scoring[key]}
                  onChange={(event) =>
                    setScoring((current) => ({
                      ...current,
                      [key]: Math.max(1, Math.min(10, Number(event.target.value || 1))),
                    }))
                  }
                  className="promptlab-input mt-1"
                />
              </label>
            ))}
            <label className="text-xs text-neutral-300 md:col-span-2">
              Classification
              <select
                value={scoring.classification || autoClassification}
                onChange={(event) =>
                  setScoring((current) => ({
                    ...current,
                    classification: event.target.value,
                  }))
                }
                className="promptlab-input mt-1"
              >
                <option value="reject">reject</option>
                <option value="interesting_but_non_canon">interesting_but_non_canon</option>
                <option value="usable_asset">usable_asset</option>
                <option value="canon_candidate">canon_candidate</option>
              </select>
            </label>
            <div className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-300">
              total_score: {Number(scoring.soul_fidelity || 0) + Number(scoring.visual_attraction || 0) + Number(scoring.luxury_editorial || 0) + Number(scoring.usable_asset || 0) + Number(scoring.canon_potential || 0)}
              <br />
              suggested: {autoClassification}
            </div>
            <label className="text-xs text-neutral-300 md:col-span-3">
              Notes
              <textarea
                rows={2}
                value={scoring.notes}
                onChange={(event) =>
                  setScoring((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </label>
            <button type="button" onClick={submitReviewScore} disabled={savingScore} className="promptlab-btn-primary md:col-span-3">
              {savingScore ? "Saving score..." : "Save Review Score + Classification"}
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {!clientSafe ? (
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Review Board Grid" subtitle="keep / reject / score / fan appeal / canon promotion" />
          {assets.length < 1 ? (
            <div className="mt-3 text-sm text-neutral-400">No archive assets available for review.</div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assets.slice(0, 18).map((asset) => (
                <div key={asset.id} className="rounded-xl border border-white/15 bg-black/30 p-3">
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40">
                    {asset.preview?.preview_data_url || asset.preview?.preview_url ? (
                      <img
                        src={asset.preview?.preview_data_url || asset.preview?.preview_url}
                        alt={asset.selected_mode}
                        className="h-36 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-36 place-items-center text-xs text-neutral-500">No preview</div>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-white">{asset.project_title}</div>
                  <div className="text-xs text-neutral-400">{asset.selected_mode} | canon {asset.canon_id || "pending"}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={assetActionBusyId === asset.id}
                      className="promptlab-btn-secondary"
                      onClick={() => applyAssetDecision(asset, { review_decision: "keep", canon_status: asset.canon_status || "usable_asset" })}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={assetActionBusyId === asset.id}
                      className="promptlab-btn-secondary"
                      onClick={() => applyAssetDecision(asset, { review_decision: "reject", canon_status: "interesting_but_non_canon" })}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={assetActionBusyId === asset.id}
                      className="promptlab-btn-secondary"
                      onClick={() => applyAssetDecision(asset, {
                        fan_appeal_score: Math.max(8, Number(asset.fan_appeal_score || 0)),
                        tags: Array.from(new Set([...(asset.tags || []), "fan_appeal"])),
                      })}
                    >
                      Tag Fan Appeal
                    </button>
                    <button
                      type="button"
                      disabled={assetActionBusyId === asset.id}
                      className="promptlab-btn-primary"
                      onClick={() => applyAssetDecision(asset, { canon_status: "canon_candidate", review_decision: "keep" })}
                    >
                      Promote Canon
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      ) : null}

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader
          title="Proof Board Integration"
          subtitle="Select archive assets and create proof sets"
          right={!clientSafe ? (
            <button type="button" onClick={createProofSetFromAssets} disabled={creating} className="promptlab-btn-primary">
              {creating ? "Creating..." : "Create Proof Set"}
            </button>
          ) : null}
        />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.15em] text-neutral-500">Archive Assets</div>
            {loading ? (
              <div className="rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
                Loading archive assets...
              </div>
            ) : assets.length < 1 ? (
              <div className="rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
                No archive assets available. Next step: archive canon-approved runs from Image Factory.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      if (!clientSafe) toggleAsset(asset.id);
                    }}
                    className={`archive-asset-card text-left ${selectedAssetIds.includes(asset.id) ? "active" : ""}`}
                  >
                    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      {asset.preview?.preview_data_url || asset.preview?.preview_url ? (
                        <img
                          src={asset.preview?.preview_data_url || asset.preview?.preview_url}
                          alt={asset.selected_mode}
                          className="h-28 w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-28 place-items-center text-xs text-neutral-500">No preview</div>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-white">{asset.project_title}</div>
                    <div className="text-xs text-neutral-400">{asset.client_name}</div>
                    <div className="text-xs text-neutral-500">mode {asset.selected_mode}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.15em] text-neutral-500">Proof Set Metadata</div>
            <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-neutral-300 space-y-2">
              <div>client: {selectedAssets[0]?.client_name || "n/a"}</div>
              <div>project: {selectedAssets[0]?.project_title || "n/a"}</div>
              <div>mode: {selectedAssets[0]?.selected_mode || "n/a"}</div>
              <div>
                generation params: {selectedAssets[0]?.mode_result?.generation_params?.sampler || "n/a"} / {selectedAssets[0]?.mode_result?.generation_params?.steps ?? "n/a"} / {selectedAssets[0]?.mode_result?.generation_params?.cfg ?? "n/a"}
              </div>
              <label className="block">
                <span className="text-neutral-400">visual theme</span>
                <input
                  value={visualTheme}
                  onChange={(event) => setVisualTheme(event.target.value)}
                  className="promptlab-input mt-1"
                />
              </label>
            </div>
          </div>
        </div>
      </GlassPanel>

      {clientSafe ? (
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Client Presentation" subtitle="Curated case study showcase" />
          {sets.length < 1 ? (
            <div className="mt-3 text-sm text-neutral-400">No curated proof sets available yet.</div>
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                {sets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSetId(item.id)}
                    className={`archive-asset-card w-full text-left ${selectedSetId === item.id ? "active" : ""}`}
                  >
                    <div className="text-sm text-white">{item.case_study_title || "Untitled"}</div>
                    <div className="text-xs text-neutral-500">{item.metadata?.client || item.archive_asset?.client_name || "Unknown"}</div>
                  </button>
                ))}
              </div>
              <div className="lg:col-span-2 rounded-xl border border-white/15 bg-black/30 p-3">
                {(() => {
                  const focused = sets.find((item) => item.id === selectedSetId) || sets[0];
                  const hero = focused?.archive_asset || null;
                  return !focused ? null : (
                    <>
                      <div className="text-xs uppercase tracking-[0.15em] text-neutral-500">Case Study</div>
                      <div className="mt-1 text-xl text-white">{focused.case_study_title}</div>
                      <div className="text-sm text-neutral-400">
                        {(focused.metadata?.client || hero?.client_name || "Unknown client")} | {(focused.metadata?.campaign || hero?.campaign_name || "default-campaign")}
                      </div>
                      {hero?.preview?.preview_data_url || hero?.preview?.preview_url ? (
                        <img
                          src={hero.preview?.preview_data_url || hero.preview?.preview_url}
                          alt={hero?.selected_mode || "hero"}
                          className="mt-3 h-72 w-full rounded-xl object-cover"
                        />
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </GlassPanel>
      ) : null}

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader
          title="Proof Packaging"
          subtitle="Select sets for comparison and export"
          right={clientSafe ? null : (
            <div className="flex gap-2">
              <button type="button" onClick={exportBundle} className="promptlab-btn-primary">
                Export Proof Bundle
              </button>
              <button type="button" onClick={exportCaseStudyPack} className="promptlab-btn-secondary">
                Export Case Study Pack
              </button>
            </div>
          )}
        />
        {loading ? (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
            Loading proof sets...
          </div>
        ) : sets.length < 1 ? (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
            No proof sets yet. Create one from archive assets above.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!clientSafe) toggleSet(item.id);
                }}
                className={`archive-asset-card text-left ${selectedIds.includes(item.id) ? "active" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-white">{item.case_study_title || "Untitled proof set"}</div>
                  <StatusPill tone={item.export_status === "ready" ? "success" : "warning"}>{item.export_status}</StatusPill>
                </div>
                <div className="mt-2 text-xs text-neutral-400">run {item.run_id?.slice(0, 10)}</div>
                <div className="mt-1 text-xs text-neutral-500">mode {item.archive_asset?.selected_mode || "n/a"}</div>
                <div className="mt-1 text-[11px] text-neutral-500">theme {item.metadata?.visual_theme || "n/a"}</div>
              </button>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
