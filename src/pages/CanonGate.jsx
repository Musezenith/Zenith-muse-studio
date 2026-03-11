import { useEffect, useMemo, useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatusPill from "../components/ui/StatusPill";
import StudioWorkflowStrip from "../components/ui/StudioWorkflowStrip";
import StudioPageGuide from "../components/ui/StudioPageGuide";
import { useToast } from "../components/ToastProvider";
import {
  archiveMikageRun,
  decideMikageCanonGate,
  getMikageOverview,
  getMikageRun,
} from "../lib/mikageClient";

const MODES = [
  "canon_core",
  "luminous_fan_appeal",
  "luxury_mystical_editorial",
];

export default function CanonGate() {
  const toast = useToast();
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedMode, setSelectedMode] = useState("canon_core");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [rationale, setRationale] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const overview = await getMikageOverview();
      const items = Array.isArray(overview?.recent_runs) ? overview.recent_runs : [];
      setRuns(items);
      if (items.length > 0) {
        const candidate = items.find((item) => item.status !== "archived") || items[0];
        setSelectedRunId((current) => current || candidate.id);
      }
    } catch (error) {
      toast.error(error.message || "Failed to load canon gate queue.");
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

  const selectableModes = useMemo(() => {
    if (!selectedRun?.mode_results) return MODES;
    return selectedRun.mode_results.map((item) => item.mode);
  }, [selectedRun]);

  const modeAssets = useMemo(() => {
    const selected = selectedRun?.mode_results?.find((item) => item.mode === selectedMode);
    return Array.isArray(selected?.output_refs) ? selected.output_refs : [];
  }, [selectedRun, selectedMode]);

  useEffect(() => {
    const selected = selectedRun?.mode_results?.find((item) => item.mode === selectedMode);
    const defaultAsset = selected?.output_refs?.[0]?.id || "";
    setSelectedAssetId(defaultAsset);
    setRationale(selectedRun?.canon_gate_decision?.rationale || "");
  }, [selectedRun?.id, selectedMode]);

  const submitDecision = async () => {
    if (!selectedRun) return;
    setSaving(true);
    try {
      await decideMikageCanonGate(selectedRun.id, {
        selected_mode: selectedMode,
        selected_output_id: selectedAssetId || undefined,
        rationale,
        approved_by: "operator",
      });
      const next = await getMikageRun(selectedRun.id);
      setRuns((current) => current.map((item) => (item.id === selectedRun.id ? next : item)));
      toast.success("Canon gate decision saved.");
    } catch (error) {
      toast.error(error.message || "Failed to save canon decision.");
    } finally {
      setSaving(false);
    }
  };

  const approveAndArchive = async () => {
    if (!selectedRun) return;
    setSaving(true);
    try {
      await decideMikageCanonGate(selectedRun.id, {
        selected_mode: selectedMode,
        selected_output_id: selectedAssetId || undefined,
        rationale,
        approved_by: "operator",
      });
      await archiveMikageRun(selectedRun.id, {
        proof_worthy: true,
        lineage_note: "approved and archived from canon gate",
        canon_status: "canon_candidate",
      });
      const next = await getMikageRun(selectedRun.id);
      setRuns((current) => current.map((item) => (item.id === selectedRun.id ? next : item)));
      toast.success("Canon approved and archived.");
    } catch (error) {
      toast.error(error.message || "Failed to approve and archive.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6 overflow-x-hidden">
      <GlassPanel variant="hero" className="rounded-3xl p-6">
        <SectionHeader
          title="Canon Gate"
          subtitle="Approve as Canon"
          right={<StatusPill tone="warning">gate control</StatusPill>}
        />
        <p className="archive-sub mt-3">
          Select the canon output for each run, capture rationale, and pass only approved outputs to archive.
        </p>
        <StudioWorkflowStrip currentStep="Canon" className="mt-4" />
      </GlassPanel>

      <StudioPageGuide
        purpose="Finalize which output becomes canonical production lineage."
        happensHere="You approve a winning mode/output, assign rationale, and lock canon decision."
        nextStep="Archive the approved asset so it can be searched and reused from Asset Library."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <GlassPanel className="rounded-2xl p-4 xl:col-span-1">
          <SectionHeader title="Runs Awaiting Gate" subtitle="Select a run" />
          {loading ? (
            <div className="mt-3 text-sm text-neutral-400">Loading runs...</div>
          ) : runs.length < 1 ? (
            <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
              No runs available.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`archive-asset-card w-full text-left ${selectedRunId === run.id ? "active" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-white">{run.id.slice(0, 10)}</div>
                    <StatusPill tone={run.status === "archived" ? "success" : "warning"}>{run.status}</StatusPill>
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">job {run.job_id?.slice(0, 8) || "n/a"}</div>
                </button>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="rounded-2xl p-4 xl:col-span-2">
          <SectionHeader title="Decision Sheet" subtitle="Mode selection and rationale" />
          {!selectedRun ? (
            <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
              Select a run to evaluate canon candidates.
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {selectableModes.map((mode) => (
                  <label key={mode} className="rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-neutral-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="canon_mode"
                        value={mode}
                        checked={selectedMode === mode}
                        onChange={() => setSelectedMode(mode)}
                      />
                      <span>{mode}</span>
                    </div>
                  </label>
                ))}
              </div>
              <textarea
                rows={5}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                placeholder="Why this mode is canon-approved for production and archive lineage..."
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
              />
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-xs text-neutral-300">
                preset linkage: {selectedRun?.intake_brief?.preset || selectedRun?.job?.preset || "n/a"}
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">Winning asset</div>
                <select
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                  className="promptlab-input"
                >
                  {modeAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label || asset.id.slice(0, 10)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={submitDecision}
                disabled={saving}
                className="promptlab-btn-primary"
              >
                {saving ? "Saving..." : "Approve Canon Selection"}
              </button>
              <button
                type="button"
                onClick={approveAndArchive}
                disabled={saving}
                className="promptlab-btn-secondary"
              >
                {saving ? "Processing..." : "Approve and Archive"}
              </button>
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
