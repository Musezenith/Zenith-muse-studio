import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getQuote } from "../lib/quotesClient";

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function QuoteDetail() {
  const { id = "" } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const next = await getQuote(id);
        if (!mounted) return;
        setItem(next);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || "Failed to load quote.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Loading quote...
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
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Quote not found.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4 overflow-x-hidden quote-detail">
      <div className="flex flex-wrap gap-2 print-hidden">
        <Link
          to={`/jobs/${item.job_id}`}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Back to Job
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Print Quote
        </button>
      </div>

      <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 print-surface">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            Version {item.version}
          </span>
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            {item.status}
          </span>
          {item.is_pilot ? (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-200">
              pilot
            </span>
          ) : (
            <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
              standard
            </span>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Quote ${item.price}</h1>
        <p className="mt-1 text-sm text-neutral-400">Package: {item.package_type}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Created: {formatDate(item.created_at)} | Updated: {formatDate(item.updated_at)}
        </p>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <Detail label="Scope Summary" value={item.scope_summary} className="md:col-span-2" />
          <Detail label="Delivery Timeline" value={item.delivery_timeline} />
          <Detail label="Usage Scope" value={item.usage_scope} />
          <Detail label="Final Images" value={String(item.number_of_final_images)} />
          <Detail label="Directions" value={String(item.number_of_directions)} />
          <Detail label="Revision Rounds" value={String(item.revision_rounds)} />
          <Detail label="Revision Limit" value={String(item.revision_limit)} />
          <Detail label="Deadline Urgency" value={item.deadline_urgency} />
          <Detail
            label="Pilot Terms Summary"
            value={
              item.is_pilot
                ? "Introductory pilot scope with reduced revision coverage. Usage is limited to internal/digital until expanded."
                : "Standard production terms."
            }
            className="md:col-span-2"
          />
          <Detail label="Assumptions" value={item.assumptions} className="md:col-span-2" />
        </section>
      </article>
    </div>
  );
}

function Detail({ label, value, className = "" }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      <div className="mt-1 rounded-lg border border-neutral-800 bg-black p-3 text-sm text-neutral-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  );
}
