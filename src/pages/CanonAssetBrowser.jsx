import { useEffect, useMemo, useState } from "react";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatusPill from "../components/ui/StatusPill";
import { useToast } from "../components/ToastProvider";
import { listMikageCanonAssets, updateMikageCanonAsset } from "../lib/mikageClient";

const DEFAULT_FILTERS = {
  project: "",
  character: "",
  mode: "all",
  output_goal: "",
  canon_status: "",
  score: "",
  date_from: "",
  date_to: "",
  sort: "newest",
};

export default function CanonAssetBrowser() {
  const toast = useToast();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const next = await listMikageCanonAssets(filters);
      setItems(next);
      setSelectedId((current) => current || next[0]?.id || "");
    } catch (error) {
      toast.error(error.message || "Failed to load canon assets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.project, filters.character, filters.mode, filters.output_goal, filters.canon_status, filters.score, filters.sort, filters.date_from, filters.date_to]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const saveFeatured = async () => {
    if (!selected) return;
    try {
      const updated = await updateMikageCanonAsset(selected.id, {
        featured: !selected.featured,
        reason_kept: selected.reason_kept || "featured by browser",
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast.success("Asset updated.");
    } catch (error) {
      toast.error(error.message || "Failed to update asset.");
    }
  };

  const copyLineage = async () => {
    if (!selected) return;
    const text = [
      `asset_id: ${selected.id}`,
      `preset: ${selected.asset_intelligence?.preset || "n/a"}`,
      `mode: ${selected.selected_mode || "n/a"}`,
      `seed: ${selected.seed ?? "n/a"}`,
      `positive_prompt: ${selected.prompt_lineage?.positive_prompt || ""}`,
      `negative_prompt: ${selected.prompt_lineage?.negative_prompt || ""}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt/preset lineage copied.");
    } catch {
      toast.error("Copy failed.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <GlassPanel variant="hero" className="rounded-3xl p-6">
        <SectionHeader
          title="Canon Asset Browser"
          subtitle="Grid/list retrieval with lineage, score, compare, and featured controls"
          right={<StatusPill tone="success">/canon-assets</StatusPill>}
        />
      </GlassPanel>

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader title="Filters" subtitle="Project, character, mode, output goal, date, score, canon status, sort" />
        <div className="mt-3 grid gap-3 md:grid-cols-9">
          <input className="promptlab-input" placeholder="Project" value={filters.project} onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))} />
          <input className="promptlab-input" placeholder="Character" value={filters.character} onChange={(event) => setFilters((current) => ({ ...current, character: event.target.value }))} />
          <select className="promptlab-input" value={filters.mode} onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}>
            <option value="all">All modes</option>
            <option value="canon_core">canon_core</option>
            <option value="luminous_fan_appeal">luminous_fan_appeal</option>
            <option value="luxury_mystical_editorial">luxury_mystical_editorial</option>
          </select>
          <input className="promptlab-input" placeholder="Output goal" value={filters.output_goal} onChange={(event) => setFilters((current) => ({ ...current, output_goal: event.target.value }))} />
          <input className="promptlab-input" placeholder="Canon status" value={filters.canon_status} onChange={(event) => setFilters((current) => ({ ...current, canon_status: event.target.value }))} />
          <input className="promptlab-input" placeholder="Min score" value={filters.score} onChange={(event) => setFilters((current) => ({ ...current, score: event.target.value }))} />
          <input type="date" className="promptlab-input" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} />
          <input type="date" className="promptlab-input" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} />
          <select className="promptlab-input" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
            <option value="newest">Newest</option>
            <option value="best_score">Best score</option>
            <option value="most_reused">Most reused</option>
            <option value="top_fan_appeal">Top fan appeal</option>
          </select>
          <select className="promptlab-input" value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
        </div>
      </GlassPanel>

      <section className="grid gap-4 lg:grid-cols-5">
        <GlassPanel className="rounded-2xl p-4 lg:col-span-3">
          <SectionHeader title="Assets" subtitle="Select an asset to inspect full lineage" />
          {loading ? <div className="mt-3 text-sm text-neutral-400">Loading assets...</div> : null}
          {!loading && items.length < 1 ? <div className="mt-3 text-sm text-neutral-400">No assets found.</div> : null}
          <div className={`mt-3 ${viewMode === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-2"}`}>
            {items.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
                className={`rounded-xl border p-2 text-left ${selectedId === asset.id ? "border-cyan-300 bg-cyan-500/10" : "border-white/10 bg-black/30"}`}
              >
                <img
                  src={asset.preview?.preview_data_url || asset.preview?.preview_url || ""}
                  alt={asset.selected_mode}
                  className={`${viewMode === "grid" ? "h-28" : "h-20"} w-full rounded-lg object-cover`}
                />
                <div className="mt-2 text-xs text-neutral-300">{asset.project_title}</div>
                <div className="text-[11px] text-neutral-500">{asset.selected_mode}</div>
                <div className="text-[11px] text-neutral-400">score {asset.score_total || 0}</div>
              </button>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="rounded-2xl p-4 lg:col-span-2">
          <SectionHeader title="Detail" subtitle="Lineage, prompt reuse, compare context" />
          {!selected ? (
            <div className="mt-3 text-sm text-neutral-400">Select an asset.</div>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-neutral-300">
              <div className="text-white">{selected.project_title}</div>
              <div>Canon status: {selected.canon_status || "n/a"}</div>
              <div>Mode: {selected.selected_mode || "n/a"}</div>
              <div>Score total: {selected.score_total || 0}</div>
              <div>Fan appeal: {selected.fan_appeal_score || 0}</div>
              <div>Reuse count: {selected.reuse_count || 0}</div>
              <div>Output goal: {selected.output_goal || "n/a"}</div>
              <div>Asset id: {selected.id}</div>
              <div>Preset: {selected.asset_intelligence?.preset || "n/a"}</div>
              <div>Seed: {selected.seed ?? "n/a"}</div>
              <div>Archive source run: {selected.archive_source_run_id || "n/a"}</div>
              <div>Reason kept: {selected.reason_kept || "n/a"}</div>
              <div>Tags: {Array.isArray(selected.tags) && selected.tags.length > 0 ? selected.tags.join(", ") : "n/a"}</div>
              <div>Reuse notes: {selected.reuse_notes || "n/a"}</div>
              <div>Usage target: {selected.usage_target || "n/a"}</div>
              <div className="text-xs text-neutral-400">Prompt lineage: {selected.prompt_lineage?.positive_prompt || "n/a"}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="promptlab-btn-primary" onClick={saveFeatured}>
                  {selected.featured ? "Unfeature" : "Mark Featured"}
                </button>
                <button type="button" className="promptlab-btn-secondary" onClick={copyLineage}>
                  Copy Prompt/Preset Lineage
                </button>
                <a className="promptlab-btn-secondary" href="/image-factory">
                  Open Originating Run
                </a>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                <div className="mb-1 text-xs text-neutral-400">Sibling outputs from same batch</div>
                <div className="grid grid-cols-3 gap-2">
                  {(selected.sibling_outputs || []).slice(0, 6).map((sibling) => (
                    <img key={sibling.id} src={sibling.preview_data_url || sibling.preview_url || ""} alt={sibling.mode} className="h-16 w-full rounded object-cover" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </GlassPanel>
      </section>
    </div>
  );
}
