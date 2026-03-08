import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listDocuments } from "../lib/documentsClient";
import { deriveDocumentsMeta, filterDocuments } from "../lib/documentsFilter";

function statusBadgeClass(status) {
  if (status === "active") {
    return "border-emerald-700/70 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "deprecated") {
    return "border-amber-700/70 bg-amber-950/30 text-amber-200";
  }
  return "border-neutral-700 bg-black text-neutral-300";
}

function formatDate(dateText) {
  if (!dateText) return "Unknown";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

export default function DocsHub() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const items = await listDocuments();
        if (!isMounted) return;
        setDocuments(items);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError.message || "Failed to load documents.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const meta = useMemo(() => deriveDocumentsMeta(documents), [documents]);
  const filtered = useMemo(
    () => filterDocuments(documents, { query, category, status, tag }),
    [documents, query, category, status, tag]
  );

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-semibold text-white">Docs Hub</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Central operating documents for studio workflows.
        </p>
      </div>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, summary, tags..."
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none md:col-span-2"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All categories</option>
            {meta.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All statuses</option>
            {meta.statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none md:col-span-2"
          >
            <option value="all">All tags</option>
            {meta.tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div className="md:col-span-2 text-xs text-neutral-500 flex items-center">
            Showing {filtered.length} of {documents.length} documents
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          Loading documents...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/50 p-5 text-sm text-red-200">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          No documents match the current filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
                    {item.category || "uncategorized"}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs ${statusBadgeClass(
                      item.status
                    )}`}
                  >
                    {item.status || "draft"}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm text-neutral-300">{item.summary || "No summary"}</p>
                <div className="mt-3 text-xs text-neutral-500">
                  Owner: {item.owner || "unknown"} | Updated: {formatDate(item.updated_at)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.length > 0 ? (
                    tags.map((entry) => (
                      <span
                        key={`${item.slug}-${entry}`}
                        className="rounded-md border border-neutral-700 bg-black px-2 py-1 text-[11px] text-neutral-300"
                      >
                        #{entry}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-md border border-neutral-800 bg-black px-2 py-1 text-[11px] text-neutral-500">
                      no tags
                    </span>
                  )}
                </div>
                <Link
                  to={`/docs/${item.slug}`}
                  className="mt-4 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  Open document
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
