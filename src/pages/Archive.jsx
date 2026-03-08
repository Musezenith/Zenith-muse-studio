import { useEffect, useMemo, useState } from "react";
import {
  clearArchiveEntries,
  listArchiveEntries,
  saveArchiveEntry,
  updateArchiveEntry,
} from "../lib/archiveStore";
import { generateImagesWithImagen } from "../lib/imagenClient";
import { RUN_STATE } from "../lib/runState";
import { useToast } from "../components/ToastProvider";
import { downloadArchiveRunBundle } from "../lib/archiveExport";
import {
  getImageAssetPreviewUrl,
  normalizeImageAssets,
} from "../lib/assetSchema";

function getRunScore(item) {
  return item?.payload?.quality?.overall ?? item?.exportPayload?.scores?.overall ?? 0;
}

function getBrief(item) {
  return item?.payload?.prompt?.brief || "No brief";
}

function getModel(item) {
  return item?.payload?.generation?.model || "imagen";
}

function getFinalSelection(item) {
  return {
    runFinal: Boolean(item?.finalSelection?.runFinal),
    imageIds: Array.isArray(item?.finalSelection?.imageIds)
      ? item.finalSelection.imageIds
      : [],
  };
}

function getRunAssets(item) {
  const fromAssets = Array.isArray(item?.generation?.assets)
    ? normalizeImageAssets(item.generation.assets)
    : [];
  if (fromAssets.length > 0) return fromAssets;
  const legacy = Array.isArray(item?.generation?.images) ? item.generation.images : [];
  return normalizeImageAssets(legacy);
}

function resolveCompareTarget(entries, target) {
  if (!target?.entryId) return null;
  const entry = entries.find((item) => item.id === target.entryId);
  if (!entry) return null;

  const assets = getRunAssets(entry);
  const image = target.imageId
    ? assets.find((item) => item.id === target.imageId) || null
    : assets[0] || null;

  return {
    entry,
    image,
    title: getBrief(entry),
    subtitle: `${entry.type} | ${new Date(entry.createdAt).toLocaleString()}`,
  };
}

function CompareSlot({ label, target, onClear }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800 bg-black p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</div>
        <button
          onClick={onClear}
          className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-900"
        >
          Clear
        </button>
      </div>
      {target ? (
        <div className="space-y-2">
          <div className="text-xs text-neutral-300 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {target.title}
          </div>
          <div className="text-[11px] text-neutral-500">{target.subtitle}</div>
          {target.image ? (
            <img
              src={getImageAssetPreviewUrl(target.image)}
              alt={target.image.id}
              className="h-44 w-full rounded-lg border border-neutral-800 object-cover"
            />
          ) : (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-5 text-xs text-neutral-500">
              No image in this run.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-5 text-xs text-neutral-500">
          Select a run/image for comparison.
        </div>
      )}
    </div>
  );
}

function ArchiveCard({
  item,
  rerunning,
  onRerun,
  onOpen,
  onCompareLeft,
  onCompareRight,
  onToggleRunFinal,
}) {
  const finalSelection = getFinalSelection(item);

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            {item.type}
          </div>
          <div className="mt-1 text-sm text-neutral-300">
            {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            {item.runState || RUN_STATE.IDLE}
          </span>
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            {getModel(item)}
          </span>
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            score {getRunScore(item)}
          </span>
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            final images {finalSelection.imageIds.length}
          </span>
          {finalSelection.runFinal && (
            <span className="rounded-full border border-emerald-700 bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-200">
              run final
            </span>
          )}
          <button
            onClick={onCompareLeft}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Compare L
          </button>
          <button
            onClick={onCompareRight}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Compare R
          </button>
          <button
            onClick={onToggleRunFinal}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            {finalSelection.runFinal ? "Unmark final" : "Mark final"}
          </button>
          <button
            onClick={onOpen}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Open
          </button>
          <button
            onClick={onRerun}
            disabled={rerunning}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rerunning ? "Re-running..." : "Re-run"}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-neutral-800 bg-black p-3 text-sm text-neutral-100">
        {getBrief(item)}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {getRunAssets(item).map((image) => (
          <img
            key={image.id}
            src={getImageAssetPreviewUrl(image)}
            alt={image.id}
            className="h-40 w-full rounded-lg border border-neutral-800 object-cover"
          />
        ))}
      </div>

      {item.generationError && (
        <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {item.generationError}
        </div>
      )}
    </article>
  );
}

function RunDetailDrawer({
  item,
  onClose,
  onExport,
  onToggleRunFinal,
  onToggleImageFinal,
  onCompareImage,
}) {
  if (!item) return null;

  const prompt = item.payload?.prompt || {};
  const generation = item.payload?.generation || {};
  const assets = getRunAssets(item);
  const finalSelection = getFinalSelection(item);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <button className="h-full flex-1 cursor-default" onClick={onClose} />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Run Detail</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onExport}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Export bundle
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-neutral-800 bg-black p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Metadata</div>
            <div className="mt-2 text-sm text-neutral-200">
              <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
              <div>Type: {item.type}</div>
              <div>State: {item.runState || RUN_STATE.IDLE}</div>
              <div>Model: {getModel(item)}</div>
              <div>Score: {getRunScore(item)}</div>
              <div>Run final: {finalSelection.runFinal ? "yes" : "no"}</div>
              <div>Final images: {finalSelection.imageIds.length}</div>
            </div>
            <button
              onClick={onToggleRunFinal}
              className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              {finalSelection.runFinal ? "Unmark run final" : "Mark run as final"}
            </button>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-black p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Prompt</div>
            <div className="mt-2 text-sm text-neutral-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {prompt.brief || "No brief"}
            </div>
            <div className="mt-3 text-xs text-neutral-400">Positive</div>
            <div className="mt-1 text-xs text-neutral-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {prompt.positivePrompt || "N/A"}
            </div>
            <div className="mt-3 text-xs text-neutral-400">Negative</div>
            <div className="mt-1 text-xs text-neutral-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {prompt.negativePrompt || "N/A"}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-black p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Result</div>
            <div className="mt-2 text-sm text-neutral-200">
              <div>Variants: {generation.variants || 0}</div>
              <div>Seed policy: {generation.seedPolicy || "n/a"}</div>
              <div>Aspect ratio: {generation.aspectRatio || "n/a"}</div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {assets.map((image) => {
                const isFinal = finalSelection.imageIds.includes(image.id);
                return (
                  <div
                    key={image.id}
                    className={`overflow-hidden rounded-lg border ${
                      isFinal ? "border-emerald-600" : "border-neutral-800"
                    }`}
                  >
                    <img
                      src={getImageAssetPreviewUrl(image)}
                      alt={image.id}
                      className="h-40 w-full object-cover"
                    />
                    <div className="flex flex-wrap gap-2 bg-neutral-950 p-2">
                      <button
                        onClick={() => onToggleImageFinal(image.id)}
                        className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-900"
                      >
                        {isFinal ? "Unmark final" : "Mark final"}
                      </button>
                      <button
                        onClick={() => onCompareImage("left", image.id)}
                        className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-900"
                      >
                        Compare L
                      </button>
                      <button
                        onClick={() => onCompareImage("right", image.id)}
                        className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-900"
                      >
                        Compare R
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {item.generationError && (
              <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                {item.generationError}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-800 bg-black p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Raw JSON</div>
            <pre className="mt-2 max-h-72 overflow-auto text-xs text-neutral-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {JSON.stringify(item, null, 2)}
            </pre>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function Archive() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rerunningId, setRerunningId] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [compareLeft, setCompareLeft] = useState(null);
  const [compareRight, setCompareRight] = useState(null);
  const toast = useToast();

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const loaded = await listArchiveEntries();
      setEntries(loaded);
    } catch (error) {
      console.error("Archive load failed:", error);
      toast.error("Failed to load Archive entries.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const selectedEntry = useMemo(
    () => entries.find((item) => item.id === selectedEntryId) || null,
    [entries, selectedEntryId]
  );

  const compareLeftResolved = useMemo(
    () => resolveCompareTarget(entries, compareLeft),
    [entries, compareLeft]
  );
  const compareRightResolved = useMemo(
    () => resolveCompareTarget(entries, compareRight),
    [entries, compareRight]
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byFilter = entries.filter((item) => {
      if (stateFilter === "all") return true;
      return (item.runState || RUN_STATE.IDLE) === stateFilter;
    });

    const bySearch = byFilter.filter((item) => {
      if (!q) return true;
      const text = [
        getBrief(item),
        item.type,
        item.runState || RUN_STATE.IDLE,
        getModel(item),
        item?.payload?.prompt?.preset || "",
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });

    const sorted = [...bySearch];
    if (sortBy === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === "score-desc") {
      sorted.sort((a, b) => getRunScore(b) - getRunScore(a));
    } else if (sortBy === "score-asc") {
      sorted.sort((a, b) => getRunScore(a) - getRunScore(b));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [entries, search, stateFilter, sortBy]);

  const persistEntryUpdate = async (nextEntry) => {
    await updateArchiveEntry(nextEntry.id, nextEntry);
    setEntries((existing) =>
      existing.map((item) => (item.id === nextEntry.id ? nextEntry : item))
    );
  };

  const handleToggleRunFinal = async (item) => {
    const selection = getFinalSelection(item);
    const nextEntry = {
      ...item,
      finalSelection: {
        ...selection,
        runFinal: !selection.runFinal,
      },
    };
    try {
      await persistEntryUpdate(nextEntry);
      toast.success(nextEntry.finalSelection.runFinal ? "Run marked final." : "Run unmarked.");
    } catch (error) {
      console.error("Run final update failed:", error);
      toast.error("Failed to update final run selection.");
    }
  };

  const handleToggleImageFinal = async (item, imageId) => {
    const selection = getFinalSelection(item);
    const ids = new Set(selection.imageIds);
    if (ids.has(imageId)) {
      ids.delete(imageId);
    } else {
      ids.add(imageId);
    }

    const nextEntry = {
      ...item,
      finalSelection: {
        ...selection,
        imageIds: Array.from(ids),
      },
    };

    try {
      await persistEntryUpdate(nextEntry);
      toast.success(ids.has(imageId) ? "Image marked final." : "Image unmarked.");
    } catch (error) {
      console.error("Image final update failed:", error);
      toast.error("Failed to update final image selection.");
    }
  };

  const handleRerun = async (item) => {
    if (!item?.payload || rerunningId) return;
    setRerunningId(item.id);
    toast.info("Re-running archived payload...");
    try {
      let generation = null;
      let generationError = "";
      let runState = RUN_STATE.SUCCESS;
      try {
        generation = await generateImagesWithImagen(item.payload);
      } catch (error) {
        generationError = error.message || "Image generation failed";
        runState = RUN_STATE.ERROR;
      }

      await saveArchiveEntry({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "prompt-lab-rerun",
        runState,
        finalSelection: {
          runFinal: false,
          imageIds: [],
        },
        payload: item.payload,
        exportPayload: item.exportPayload || null,
        generation,
        generationError: generationError || null,
      });
      if (generationError) {
        toast.error(generationError);
      } else {
        toast.success("Archive re-run completed.");
      }
      await loadEntries();
    } finally {
      setRerunningId("");
    }
  };

  const handleExportBundle = (item) => {
    try {
      downloadArchiveRunBundle(item);
      toast.success("Archive bundle exported.");
    } catch (error) {
      console.error("Archive bundle export failed:", error);
      toast.error("Failed to export archive bundle.");
    }
  };

  const setCompareTarget = (side, entryId, imageId = null) => {
    const target = { entryId, imageId };
    if (side === "left") {
      setCompareLeft(target);
    } else {
      setCompareRight(target);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">Archive</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Stored Prompt Lab outputs and Imagen generations
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await clearArchiveEntries();
              await loadEntries();
              setSelectedEntryId("");
              setCompareLeft(null);
              setCompareRight(null);
              toast.success("Archive cleared.");
            } catch (error) {
              console.error("Archive clear failed:", error);
              toast.error("Failed to clear Archive.");
            }
          }}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Clear archive
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search brief/model/state..."
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none md:col-span-2"
          />
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All states</option>
            <option value={RUN_STATE.SUCCESS}>Success</option>
            <option value={RUN_STATE.ERROR}>Error</option>
            <option value={RUN_STATE.CANCELLED}>Cancelled</option>
            <option value={RUN_STATE.GENERATING}>Generating</option>
            <option value={RUN_STATE.BUILDING}>Building</option>
            <option value={RUN_STATE.IDLE}>Idle</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="score-desc">Score high to low</option>
            <option value="score-asc">Score low to high</option>
          </select>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Showing {filteredEntries.length} of {entries.length} runs
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CompareSlot label="Compare Left" target={compareLeftResolved} onClear={() => setCompareLeft(null)} />
        <CompareSlot
          label="Compare Right"
          target={compareRightResolved}
          onClear={() => setCompareRight(null)}
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          Loading archive...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          No runs match current search/filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((item) => (
            <ArchiveCard
              key={item.id}
              item={item}
              rerunning={rerunningId === item.id}
              onRerun={() => handleRerun(item)}
              onOpen={() => setSelectedEntryId(item.id)}
              onCompareLeft={() => setCompareTarget("left", item.id)}
              onCompareRight={() => setCompareTarget("right", item.id)}
              onToggleRunFinal={() => handleToggleRunFinal(item)}
            />
          ))}
        </div>
      )}

      <RunDetailDrawer
        item={selectedEntry}
        onClose={() => setSelectedEntryId("")}
        onExport={() => selectedEntry && handleExportBundle(selectedEntry)}
        onToggleRunFinal={() => selectedEntry && handleToggleRunFinal(selectedEntry)}
        onToggleImageFinal={(imageId) =>
          selectedEntry && handleToggleImageFinal(selectedEntry, imageId)
        }
        onCompareImage={(side, imageId) =>
          selectedEntry && setCompareTarget(side, selectedEntry.id, imageId)
        }
      />
    </div>
  );
}
