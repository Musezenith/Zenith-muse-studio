import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import MetricCard from "../components/ui/MetricCard";
import StatusPill from "../components/ui/StatusPill";
import StudioWorkflowStrip from "../components/ui/StudioWorkflowStrip";
import StudioPageGuide from "../components/ui/StudioPageGuide";
import { useToast } from "../components/ToastProvider";
import { listMikageArchive } from "../lib/mikageClient";

function clusterKey(asset, clusterBy) {
  if (clusterBy === "mode") return asset.selected_mode || "unknown";
  return asset.asset_intelligence?.visual_theme || "unclassified";
}

export default function Archive() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const clientSafe = searchParams.get("view") === "client";
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [project, setProject] = useState("");
  const [character, setCharacter] = useState("");
  const [collection, setCollection] = useState("all");
  const [preset, setPreset] = useState("");
  const [visualMood, setVisualMood] = useState("");
  const [mode, setMode] = useState("all");
  const [proof, setProof] = useState(clientSafe ? "true" : "all");
  const [rankBy, setRankBy] = useState(clientSafe ? "visual_score" : "");
  const [clusterBy, setClusterBy] = useState("visual_theme");
  const [canonOnly, setCanonOnly] = useState("false");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await listMikageArchive({
        campaign,
        project,
        character,
        mode,
        proof_worthy: proof,
        collection,
        preset,
        visual_mood: visualMood,
        rank_by: rankBy,
        canon_only: canonOnly,
      });
      setItems(next);
    } catch (loadError) {
      setError(loadError.message || "Failed to load archive lineage.");
      toast.error(loadError.message || "Failed to load archive lineage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [campaign, project, character, mode, proof, collection, preset, visualMood, rankBy, canonOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = items;
    if (q) {
      next = next.filter((item) => {
        const text = [
          item.client_name,
          item.campaign_name,
          item.project_title,
          item.selected_mode,
          item.lineage_note,
          item.asset_intelligence?.visual_theme,
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(q);
      });
    }
    if (clientSafe) {
      next = next
        .filter((item) => item.proof_worthy)
        .sort(
          (a, b) =>
            Number(b.asset_intelligence?.visual_score || 0) -
            Number(a.asset_intelligence?.visual_score || 0)
        )
        .slice(0, 24);
    }
    return next;
  }, [items, search, clientSafe]);

  useEffect(() => {
    if (filtered.length > 0) {
      setSelectedAssetId((current) => current || filtered[0].id);
    } else {
      setSelectedAssetId("");
    }
  }, [filtered]);

  const clusters = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const key = clusterKey(item, clusterBy);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(item);
    }
    return Array.from(map.entries()).map(([key, assets]) => ({ key, assets }));
  }, [filtered, clusterBy]);

  const selectedAsset = useMemo(
    () => filtered.find((item) => item.id === selectedAssetId) || null,
    [filtered, selectedAssetId]
  );

  const compared = useMemo(
    () => filtered.filter((item) => compareIds.includes(item.id)).slice(0, 3),
    [filtered, compareIds]
  );

  const toggleCompare = (id) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length >= 3) return [...current.slice(1), id];
      return [...current, id];
    });
  };

  return (
    <div className="archive-shell mx-auto w-full max-w-7xl min-w-0 space-y-6 overflow-x-hidden">
      <GlassPanel variant="hero" className="rounded-3xl p-6">
        <SectionHeader
          title="Archive"
          subtitle={
            clientSafe
              ? "Asset Library - client presentation mode with curated visual intelligence"
              : "Asset Library - searchable visual intelligence archive by campaign, mode, score, and lineage"
          }
          right={
            <StatusPill tone={clientSafe ? "info" : "success"}>
              {clientSafe ? "client presentation" : "operator intelligence"}
            </StatusPill>
          }
        />
        <StudioWorkflowStrip currentStep="Archive" className="mt-4" />
      </GlassPanel>

      <StudioPageGuide
        purpose="Browse canonized assets and production lineage for reuse."
        happensHere="You filter by project, mode, character, canon status, and compare shortlisted assets."
        nextStep="Reuse top assets in new briefs or package them into proof/case-study outputs."
      />

      {error ? (
        <GlassPanel className="rounded-2xl p-4">
          <div className="text-sm text-red-200">{error}</div>
          <button type="button" onClick={load} className="promptlab-btn-secondary mt-3">
            Retry Archive Sync
          </button>
        </GlassPanel>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Archive Assets" value={items.length} className="dashboard-card" />
        <MetricCard
          label="Proof-worthy"
          value={items.filter((item) => item.proof_worthy).length}
          className="dashboard-card"
        />
        <MetricCard
          label="Campaigns"
          value={new Set(items.map((item) => item.campaign_name || "default-campaign")).size}
          className="dashboard-card"
        />
        <MetricCard
          label="Clients"
          value={new Set(items.map((item) => item.client_name)).size}
          className="dashboard-card"
        />
      </section>

      {!clientSafe ? (
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Search Controls" subtitle="Operator retrieval and ranking" />
          <div className="mt-3 grid gap-3 md:grid-cols-8">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search client, campaign, project"
              className="promptlab-input md:col-span-2"
            />
            <input
              value={campaign}
              onChange={(event) => setCampaign(event.target.value)}
              placeholder="Campaign"
              className="promptlab-input"
            />
            <input
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="Project"
              className="promptlab-input"
            />
            <input
              value={character}
              onChange={(event) => setCharacter(event.target.value)}
              placeholder="Character"
              className="promptlab-input"
            />
            <input
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              placeholder="Preset"
              className="promptlab-input"
            />
            <input
              value={visualMood}
              onChange={(event) => setVisualMood(event.target.value)}
              placeholder="Visual mood"
              className="promptlab-input"
            />
            <input
              value={collection === "all" ? "" : collection}
              onChange={(event) => setCollection(event.target.value || "all")}
              placeholder="Collection"
              className="promptlab-input"
            />
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="promptlab-input">
              <option value="all">All modes</option>
              <option value="canon_core">canon_core</option>
              <option value="luminous_fan_appeal">luminous_fan_appeal</option>
              <option value="luxury_mystical_editorial">luxury_mystical_editorial</option>
            </select>
            <select value={proof} onChange={(event) => setProof(event.target.value)} className="promptlab-input">
              <option value="all">All proof states</option>
              <option value="true">Proof-worthy</option>
              <option value="false">Not proof-worthy</option>
            </select>
            <select value={rankBy} onChange={(event) => setRankBy(event.target.value)} className="promptlab-input">
              <option value="">Newest</option>
              <option value="visual_score">visual_score</option>
              <option value="composition_score">composition_score</option>
              <option value="novelty_score">novelty_score</option>
              <option value="brand_fit">brand_fit</option>
            </select>
            <select value={clusterBy} onChange={(event) => setClusterBy(event.target.value)} className="promptlab-input">
              <option value="visual_theme">Cluster by visual theme</option>
              <option value="mode">Cluster by mode</option>
            </select>
            <select value={canonOnly} onChange={(event) => setCanonOnly(event.target.value)} className="promptlab-input">
              <option value="false">All assets</option>
              <option value="true">Canon assets only</option>
            </select>
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader
          title="Visual Archive Explorer"
          subtitle={clientSafe ? "Curated showcase grid" : "Grid explorer with clustering and quick compare"}
        />
        {loading ? (
          <div className="mt-3 text-sm text-neutral-400">Loading archive...</div>
        ) : filtered.length < 1 ? (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-neutral-400">
            No archive items for current filters.
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {clusters.map((cluster) => (
              <div key={cluster.key}>
                <div className="mb-2 text-xs uppercase tracking-[0.15em] text-neutral-500">
                  Cluster: {cluster.key}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {cluster.assets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`archive-asset-card relative text-left ${selectedAssetId === asset.id ? "active" : ""}`}
                    >
                      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
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
                      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-cyan-200">
                        v {asset.asset_intelligence?.visual_score ?? "n/a"} | b {asset.asset_intelligence?.brand_fit ?? "n/a"}
                      </div>
                      <div className="mt-2 text-sm text-white">{asset.project_title}</div>
                      <div className="text-xs text-neutral-400">{asset.client_name}</div>
                      <div className="text-[11px] text-neutral-500">campaign {asset.campaign_name || "default-campaign"}</div>
                      <div className="text-[11px] text-neutral-500">character {asset.character || "n/a"}</div>
                      <div className="text-[11px] text-amber-200">canon {asset.canon_id || "pending"}</div>
                      {!clientSafe ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCompare(asset.id);
                          }}
                          className="promptlab-btn-secondary mt-2"
                        >
                          {compareIds.includes(asset.id) ? "Remove Compare" : "Quick Compare"}
                        </button>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {!clientSafe ? (
        <GlassPanel className="rounded-2xl p-4">
          <SectionHeader title="Quick Compare" subtitle="Side-by-side assets" />
          {compared.length < 2 ? (
            <div className="mt-2 text-sm text-neutral-400">Select at least 2 assets for compare.</div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {compared.map((asset) => (
                <div key={asset.id} className="rounded-xl border border-white/15 bg-black/30 p-2">
                  <img
                    src={asset.preview?.preview_data_url || asset.preview?.preview_url || ""}
                    alt={asset.selected_mode}
                    className="h-36 w-full rounded-lg object-cover"
                  />
                  <div className="mt-2 text-xs text-neutral-300">{asset.selected_mode}</div>
                  <div className="text-[11px] text-neutral-500">
                    visual {asset.asset_intelligence?.visual_score ?? "n/a"} | composition {asset.asset_intelligence?.composition_score ?? "n/a"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      ) : null}

      <GlassPanel className="rounded-2xl p-4">
        <SectionHeader title="Metadata Overlay" subtitle="Selected asset intelligence" />
        {!selectedAsset ? (
          <div className="mt-3 text-sm text-neutral-400">Select an asset from explorer.</div>
        ) : (
          <div className="mt-3 grid gap-2 text-xs text-neutral-300 md:grid-cols-2">
            <div>archive_id: {selectedAsset.archive_id || selectedAsset.id}</div>
            <div>client: {selectedAsset.client_name}</div>
            <div>campaign: {selectedAsset.campaign_name || "default-campaign"}</div>
            <div>project: {selectedAsset.project || selectedAsset.project_title}</div>
            <div>mode: {selectedAsset.mode || selectedAsset.selected_mode}</div>
            <div>seed: {selectedAsset.seed ?? selectedAsset.mode_result?.seed ?? "n/a"}</div>
            <div>sampler: {selectedAsset.sampler || selectedAsset.mode_result?.generation_params?.sampler || "n/a"}</div>
            <div>steps: {selectedAsset.steps ?? selectedAsset.mode_result?.generation_params?.steps ?? "n/a"}</div>
            <div>cfg: {selectedAsset.cfg ?? selectedAsset.mode_result?.generation_params?.cfg ?? "n/a"}</div>
            <div>review_score: {selectedAsset.review_score ?? selectedAsset.review_score?.total_score ?? "n/a"}</div>
            <div>classification: {selectedAsset.classification || selectedAsset.canon_status || "n/a"}</div>
            <div className="md:col-span-2">prompt: {selectedAsset.prompt || selectedAsset.mode_result?.prompt || "n/a"}</div>
            <div className="md:col-span-2">negative_prompt: {selectedAsset.negative_prompt || selectedAsset.mode_result?.negative_prompt || "n/a"}</div>
            <div className="md:col-span-2">asset_url: {selectedAsset.asset_url || selectedAsset.preview?.preview_url || "n/a"}</div>
            <div>timestamp: {selectedAsset.timestamp || selectedAsset.archived_at || "n/a"}</div>
            <div>visual_score: {selectedAsset.asset_intelligence?.visual_score ?? "n/a"}</div>
            <div>composition_score: {selectedAsset.asset_intelligence?.composition_score ?? "n/a"}</div>
            <div>novelty_score: {selectedAsset.asset_intelligence?.novelty_score ?? "n/a"}</div>
            <div>brand_fit: {selectedAsset.asset_intelligence?.brand_fit ?? "n/a"}</div>
            {!clientSafe ? <div>lineage: {selectedAsset.lineage_note || "n/a"}</div> : null}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
