import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDocument, listDocuments } from "../lib/documentsClient";
import { useToast } from "../components/ToastProvider";
import { getRelatedDocuments, renderMarkdownDocument } from "../lib/documentsDetail";

function formatDate(dateText) {
  if (!dateText) return "Unknown";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export default function DocDetail() {
  const { slug = "" } = useParams();
  const [item, setItem] = useState(null);
  const [allDocuments, setAllDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const [next, all] = await Promise.all([getDocument(slug), listDocuments()]);
        if (!isMounted) return;
        setItem(next);
        setAllDocuments(all);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError.message || "Failed to load document.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const markdown = useMemo(
    () => renderMarkdownDocument(item?.content || ""),
    [item?.content]
  );

  const relatedDocs = useMemo(
    () => getRelatedDocuments(item, allDocuments, 4),
    [item, allDocuments]
  );

  async function copyLink() {
    const target = `${window.location.origin}/docs/${encodeURIComponent(slug)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(target);
      } else {
        const input = document.createElement("textarea");
        input.value = target;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.focus();
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      toast.success("Document link copied.");
    } catch (copyError) {
      toast.error("Copy failed. Please copy from address bar.");
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Loading document...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-900/60 bg-red-950/50 p-5 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Link
          to="/docs"
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Back to Docs Hub
        </Link>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          Document not found.
        </div>
      </div>
    );
  }

  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 overflow-x-hidden doc-detail">
      <div className="flex flex-wrap items-center gap-2 print-hidden">
        <Link
          to="/docs"
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Back to Docs Hub
        </Link>
        <button
          onClick={copyLink}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Copy link
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Print
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 print-surface">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
              {item.category || "uncategorized"}
            </span>
            <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
              {item.status || "draft"}
            </span>
            <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
              v{item.version || 1}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{item.title}</h1>
          <p className="mt-2 text-sm text-neutral-300">{item.summary || "No summary"}</p>
          <div className="mt-3 text-xs text-neutral-500">
            Owner: {item.owner || "unknown"} | Updated: {formatDate(item.updated_at)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <span
                  key={`${item.slug}-${tag}`}
                  className="rounded-md border border-neutral-700 bg-black px-2 py-1 text-[11px] text-neutral-300"
                >
                  #{tag}
                </span>
              ))
            ) : (
              <span className="rounded-md border border-neutral-800 bg-black px-2 py-1 text-[11px] text-neutral-500">
                no tags
              </span>
            )}
          </div>

          <div
            className="docs-markdown mt-5 rounded-xl border border-neutral-800 bg-black p-4 text-sm text-neutral-100"
            dangerouslySetInnerHTML={{
              __html: markdown.html || "<p>No content</p>",
            }}
          />
        </article>

        <aside className="space-y-4 print-hidden">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <h2 className="text-sm font-semibold text-white">Table of Contents</h2>
            {markdown.headings.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                No section headings were found in this document.
              </p>
            ) : (
              <nav className="mt-3 space-y-1">
                {markdown.headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className="block rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white"
                    style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 10 + 8}px` }}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <h2 className="text-sm font-semibold text-white">Related Documents</h2>
            {relatedDocs.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                No related documents found.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {relatedDocs.map((doc) => (
                  <Link
                    key={doc.slug}
                    to={`/docs/${doc.slug}`}
                    className="block rounded-lg border border-neutral-800 bg-black p-2 hover:border-neutral-700"
                  >
                    <div className="text-xs text-neutral-400">{doc.category || "uncategorized"}</div>
                    <div className="mt-1 text-sm text-neutral-200">{doc.title}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
