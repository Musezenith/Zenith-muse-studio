import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { getJob } from "../lib/jobsClient";
import { createQuote, draftQuote } from "../lib/quotesClient";

const initialInputs = {
  package_type: "starter",
  number_of_final_images: 4,
  number_of_directions: 1,
  revision_rounds: 1,
  deadline_urgency: "standard",
  usage_scope: "internal",
  is_pilot: false,
};

export default function QuoteNew() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [job, setJob] = useState(null);
  const [inputs, setInputs] = useState(initialInputs);
  const [manual, setManual] = useState({
    price: "",
    scope_summary: "",
    delivery_timeline: "",
    assumptions: "",
    revision_limit: "",
  });
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const next = await getJob(id);
        if (!mounted) return;
        setJob(next);
        setInputs((prev) => ({ ...prev, is_pilot: Boolean(next?.is_pilot) }));
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || "Failed to load job.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const generateDraft = async () => {
    setDrafting(true);
    setError("");
    try {
      const next = await draftQuote({
        job_id: id,
        ...inputs,
      });
      setDraft(next);
      if (!manual.scope_summary) {
        setManual((prev) => ({
          ...prev,
          price: String(next.price),
          scope_summary: next.scope_summary,
          delivery_timeline: next.delivery_timeline,
          assumptions: next.assumptions,
          revision_limit: String(next.revision_limit),
        }));
      }
    } catch (draftError) {
      setError(draftError.message || "Failed to generate quote draft.");
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (!job) return;
    generateDraft();
  }, [
    job,
    inputs.package_type,
    inputs.number_of_final_images,
    inputs.number_of_directions,
    inputs.revision_rounds,
    inputs.deadline_urgency,
    inputs.usage_scope,
    inputs.is_pilot,
  ]);

  const saveQuote = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        job_id: id,
        ...inputs,
        manual: {
          price: manual.price === "" ? null : Number(manual.price),
          scope_summary: manual.scope_summary,
          delivery_timeline: manual.delivery_timeline,
          assumptions: manual.assumptions,
          revision_limit: manual.revision_limit === "" ? null : Number(manual.revision_limit),
        },
      };
      const created = await createQuote(payload);
      toast.success("Quote version saved.");
      navigate(`/quotes/${created.id}`);
    } catch (saveError) {
      setError(saveError.message || "Failed to save quote.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Loading job...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Job not found.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/jobs/${id}`}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Back to Job
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-semibold text-white">Quote Generator</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {job.brand} | {job.client_name}
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/50 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Inputs</h2>
          <SelectField
            label="Package Type"
            value={inputs.package_type}
            onChange={(value) => setInputs((prev) => ({ ...prev, package_type: value }))}
            options={[
              { value: "starter", label: "Starter" },
              { value: "growth", label: "Growth" },
              { value: "campaign", label: "Campaign" },
            ]}
          />
          <NumberField
            label="Number of Final Images"
            value={inputs.number_of_final_images}
            onChange={(value) =>
              setInputs((prev) => ({ ...prev, number_of_final_images: Number(value) || 1 }))
            }
          />
          <NumberField
            label="Number of Directions"
            value={inputs.number_of_directions}
            onChange={(value) =>
              setInputs((prev) => ({ ...prev, number_of_directions: Number(value) || 1 }))
            }
          />
          <NumberField
            label="Revision Rounds"
            value={inputs.revision_rounds}
            onChange={(value) =>
              setInputs((prev) => ({ ...prev, revision_rounds: Math.max(0, Number(value) || 0) }))
            }
          />
          <SelectField
            label="Deadline Urgency"
            value={inputs.deadline_urgency}
            onChange={(value) => setInputs((prev) => ({ ...prev, deadline_urgency: value }))}
            options={[
              { value: "standard", label: "Standard" },
              { value: "rush", label: "Rush" },
              { value: "urgent", label: "Urgent" },
            ]}
          />
          <SelectField
            label="Usage Scope"
            value={inputs.usage_scope}
            onChange={(value) => setInputs((prev) => ({ ...prev, usage_scope: value }))}
            options={[
              { value: "internal", label: "Internal" },
              { value: "digital", label: "Digital" },
              { value: "omni", label: "Omni-channel" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={inputs.is_pilot}
              onChange={(event) =>
                setInputs((prev) => ({ ...prev, is_pilot: event.target.checked }))
              }
            />
            Pilot quote mode
          </label>
          <button
            onClick={generateDraft}
            disabled={drafting}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          >
            {drafting ? "Generating..." : "Refresh Draft"}
          </button>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Manual Override</h2>
          <NumberField
            label="Quote Amount"
            value={manual.price}
            onChange={(value) => setManual((prev) => ({ ...prev, price: value }))}
          />
          <NumberField
            label="Revision Limit"
            value={manual.revision_limit}
            onChange={(value) => setManual((prev) => ({ ...prev, revision_limit: value }))}
          />
          <TextField
            label="Scope Summary"
            value={manual.scope_summary}
            onChange={(value) => setManual((prev) => ({ ...prev, scope_summary: value }))}
            rows={4}
          />
          <TextField
            label="Delivery Timeline"
            value={manual.delivery_timeline}
            onChange={(value) => setManual((prev) => ({ ...prev, delivery_timeline: value }))}
            rows={2}
          />
          <TextField
            label="Assumptions"
            value={manual.assumptions}
            onChange={(value) => setManual((prev) => ({ ...prev, assumptions: value }))}
            rows={5}
          />
        </section>
      </div>

      {draft ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
          <h2 className="text-sm font-semibold text-white">Draft Preview</h2>
          <div className="mt-2 text-xs text-neutral-400">
            Mode: {inputs.is_pilot ? "pilot" : "standard"}
          </div>
          <div className="mt-2 text-sm text-neutral-300">Recommended amount: ${draft.price}</div>
          <div className="mt-2 text-xs text-neutral-500 whitespace-pre-wrap">{draft.scope_summary}</div>
          <div className="mt-1 text-xs text-neutral-500">{draft.delivery_timeline}</div>
          {inputs.is_pilot ? (
            <div className="mt-1 text-xs text-amber-300">
              Pilot terms applied: introductory discount and reduced revision coverage.
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={saveQuote}
          disabled={saving}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Quote Version"}
        </button>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-200">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-200">{label}</div>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
      />
    </label>
  );
}

function TextField({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-200">{label}</div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
      />
    </label>
  );
}
