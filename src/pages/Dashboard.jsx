import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getJobsOverview } from "../lib/jobsClient";
import BilingualText from "../components/BilingualText";

const STAGES = [
  "new brief",
  "in production",
  "awaiting feedback",
  "final selected",
  "exported",
  "archived",
];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function Dashboard() {
  const [summary, setSummary] = useState({});
  const [recent, setRecent] = useState([]);
  const [costSummary, setCostSummary] = useState(null);
  const [slaFilter, setSlaFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const payload = await getJobsOverview(25);
        if (!mounted) return;
        setSummary(payload.summary || {});
        setRecent(payload.recent || []);
        setCostSummary(payload.generation_cost_summary || null);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || "Failed to load dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredRecent = recent.filter((job) => {
    if (slaFilter === "all") return true;
    return (job?.sla?.status || "unknown") === slaFilter;
  });

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BilingualText
          as="h1"
          title="Operations Dashboard"
          subtitle="Bảng điều hành vận hành và khối lượng công việc gần đây."
          titleClassName="text-3xl font-semibold text-white"
          subtitleClassName="text-sm text-neutral-400"
        />
        <Link
          to="/intake/new"
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          New Intake
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/50 p-5 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((stage) => (
          <article
            key={stage}
            className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{stage}</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {Number(summary[stage] || 0)}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
          <BilingualText
            title="Weekly Cost"
            subtitle="Chi phí 7 ngày gần nhất"
            titleClassName="text-xs uppercase tracking-[0.2em] text-neutral-500"
          />
          <div className="mt-2 text-2xl font-semibold text-white">
            ${Number(costSummary?.weekly?.total_cost || 0).toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {Number(costSummary?.weekly?.actual_runs || 0)} actual,{" "}
            {Number(costSummary?.weekly?.estimated_runs || 0)} estimated
          </div>
        </article>
        <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
          <BilingualText
            title="Monthly Cost"
            subtitle="Chi phí 30 ngày gần nhất"
            titleClassName="text-xs uppercase tracking-[0.2em] text-neutral-500"
          />
          <div className="mt-2 text-2xl font-semibold text-white">
            ${Number(costSummary?.monthly?.total_cost || 0).toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {Number(costSummary?.monthly?.actual_runs || 0)} actual,{" "}
            {Number(costSummary?.monthly?.estimated_runs || 0)} estimated
          </div>
        </article>
        <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
          <BilingualText
            title="All-Time Cost"
            subtitle="Tổng chi phí tích lũy"
            titleClassName="text-xs uppercase tracking-[0.2em] text-neutral-500"
          />
          <div className="mt-2 text-2xl font-semibold text-white">
            ${Number(costSummary?.total?.total_cost || 0).toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {Number(costSummary?.total?.run_count || 0)} runs tracked
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BilingualText
            as="h2"
            title="Recent Jobs"
            subtitle="Công việc mới cập nhật"
            titleClassName="text-lg font-semibold text-white"
          />
          <select
            value={slaFilter}
            onChange={(event) => setSlaFilter(event.target.value)}
            className="rounded-lg border border-neutral-700 bg-black px-2 py-1 text-xs text-neutral-200"
          >
            <option value="all">All SLA</option>
            <option value="on-time">On-time</option>
            <option value="at-risk">At-risk</option>
            <option value="overdue">Overdue</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-neutral-400">Loading jobs...</p>
        ) : filteredRecent.length === 0 ? (
          <div className="mt-3 rounded-xl border border-neutral-800 bg-black p-4 text-sm text-neutral-500">
            No jobs match this SLA filter.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm text-neutral-200">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.15em] text-neutral-500">
                  <th className="px-2 py-2">Job</th>
                  <th className="px-2 py-2">Client / Brand</th>
                  <th className="px-2 py-2">Deadline</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">SLA</th>
                  <th className="px-2 py-2">Updated</th>
                  <th className="px-2 py-2">Quote</th>
                  <th className="px-2 py-2">Gen Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.map((job) => (
                  <tr key={job.id} className="border-t border-neutral-800">
                    <td className="px-2 py-2">
                      <Link to={`/jobs/${job.id}`} className="text-amber-300 hover:underline">
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <div>{job.client_name || "Unknown client"}</div>
                      <div className="text-xs text-neutral-500">
                        {job.brand || "Unknown brand"}
                        {job.is_pilot ? " | pilot" : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2">{job.deadline || "Unknown"}</td>
                    <td className="px-2 py-2">{job.status}</td>
                    <td className="px-2 py-2">
                      <SlaBadge status={job?.sla?.status || "unknown"} />
                    </td>
                    <td className="px-2 py-2">{formatDate(job.updated_at)}</td>
                    <td className="px-2 py-2">
                      {job.latest_quote_version
                        ? `v${job.latest_quote_version} (${job.quote_count})`
                        : "none"}
                    </td>
                    <td className="px-2 py-2">${Number(job.generation_cost_total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SlaBadge({ status }) {
  if (status === "overdue") {
    return (
      <span className="rounded-full border border-red-800 bg-red-950/50 px-2 py-0.5 text-xs text-red-200">
        overdue
      </span>
    );
  }
  if (status === "at-risk") {
    return (
      <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs text-amber-200">
        at-risk
      </span>
    );
  }
  if (status === "on-time") {
    return (
      <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-200">
        on-time
      </span>
    );
  }
  return (
    <span className="rounded-full border border-neutral-700 bg-black px-2 py-0.5 text-xs text-neutral-400">
      unknown
    </span>
  );
}
