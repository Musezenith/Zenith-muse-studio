import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { normalizeImageAssets, getImageAssetPreviewUrl } from "../lib/assetSchema";
import {
  getCaseStudyDraft,
  getJob,
  getJobProofPack,
  getJobTestimonial,
  generateJobProofPack,
  generateJobTestimonial,
  listJobAudit,
  updateJobProofPack,
  updateJobSla,
  updateJobStatus,
  updateJobTestimonial,
} from "../lib/jobsClient";
import { listQuotesByJob } from "../lib/quotesClient";
import { useToast } from "../components/ToastProvider";

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

export default function JobDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [audit, setAudit] = useState([]);
  const [nextStatus, setNextStatus] = useState("new brief");
  const [slaMilestones, setSlaMilestones] = useState({
    first_output_at: "",
    feedback_received_at: "",
    final_delivered_at: "",
    brief_received_at: "",
    breach_reason_code: "",
    breach_note: "",
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingSla, setUpdatingSla] = useState(false);
  const [caseStudyDraft, setCaseStudyDraft] = useState(null);
  const [loadingCaseStudy, setLoadingCaseStudy] = useState(false);
  const [caseStudyError, setCaseStudyError] = useState("");
  const [testimonial, setTestimonial] = useState(null);
  const [testimonialForm, setTestimonialForm] = useState({
    prompt: "",
    draft: "",
    status: "draft",
  });
  const [loadingTestimonial, setLoadingTestimonial] = useState(false);
  const [savingTestimonial, setSavingTestimonial] = useState(false);
  const [testimonialError, setTestimonialError] = useState("");
  const [proofPack, setProofPack] = useState(null);
  const [proofForm, setProofForm] = useState({
    hero_proof_summary: "",
    landing_page: "",
    sales_deck: "",
    outreach: "",
    social: "",
    turnaround_proof: "",
    testimonial_snippet: "",
    status: "draft",
  });
  const [loadingProofPack, setLoadingProofPack] = useState(false);
  const [savingProofPack, setSavingProofPack] = useState(false);
  const [proofPackError, setProofPackError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [next, quoteItems, auditItems, testimonialItem, proofPackItem] = await Promise.all([
          getJob(id),
          listQuotesByJob(id),
          listJobAudit(id),
          getJobTestimonial(id),
          getJobProofPack(id),
        ]);
        if (!mounted) return;
        setItem(next);
        setQuotes(quoteItems);
        setAudit(auditItems);
        setCaseStudyDraft(null);
        setCaseStudyError("");
        setTestimonial(testimonialItem);
        setTestimonialForm({
          prompt: testimonialItem?.prompt || "",
          draft: testimonialItem?.draft || "",
          status: testimonialItem?.status || "draft",
        });
        setTestimonialError("");
        setProofPack(proofPackItem);
        setProofForm({
          hero_proof_summary: proofPackItem?.hero_proof_summary || "",
          landing_page: proofPackItem?.snippets?.landing_page || "",
          sales_deck: proofPackItem?.snippets?.sales_deck || "",
          outreach: proofPackItem?.snippets?.outreach || "",
          social: proofPackItem?.snippets?.social || "",
          turnaround_proof: proofPackItem?.turnaround_proof || "",
          testimonial_snippet: proofPackItem?.testimonial_snippet || "",
          status: proofPackItem?.status || "draft",
        });
        setProofPackError("");
        if (next?.status) setNextStatus(next.status);
        setSlaMilestones({
          brief_received_at: toDatetimeInput(next?.brief_received_at),
          first_output_at: toDatetimeInput(next?.first_output_at),
          feedback_received_at: toDatetimeInput(next?.feedback_received_at),
          final_delivered_at: toDatetimeInput(next?.final_delivered_at),
          breach_reason_code: next?.breach_reason_code || "",
          breach_note: next?.breach_note || "",
        });
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
        Loading job...
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
          to="/intake/new"
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Back to Intake
        </Link>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5 text-sm text-neutral-400">
          Job not found.
        </div>
      </div>
    );
  }

  const referenceLinks = Array.isArray(item?.references?.links) ? item.references.links : [];
  const referenceUploads = normalizeImageAssets(item?.references?.uploads || []);
  const generationCost = item?.generation_cost || {
    run_count: 0,
    actual_runs: 0,
    estimated_runs: 0,
    total_cost: 0,
    actual_cost_total: 0,
    estimated_cost_total: 0,
  };
  const sla = item?.sla || {
    status: "unknown",
    brief_to_first_output: { status: "unknown", hours: null },
    feedback_to_final_delivery: { status: "unknown", hours: null },
  };

  const handleStatusUpdate = async () => {
    if (!item || !nextStatus || nextStatus === item.status) return;
    setUpdatingStatus(true);
    try {
      const updated = await updateJobStatus(item.id, nextStatus, "operator");
      setItem(updated);
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("Job status updated.");
    } catch (updateError) {
      toast.error(updateError.message || "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSlaUpdate = async () => {
    if (!item) return;
    setUpdatingSla(true);
    try {
      const updated = await updateJobSla(item.id, {
        brief_received_at: slaMilestones.brief_received_at || null,
        first_output_at: slaMilestones.first_output_at || null,
        feedback_received_at: slaMilestones.feedback_received_at || null,
        final_delivered_at: slaMilestones.final_delivered_at || null,
        breach_reason_code: slaMilestones.breach_reason_code || null,
        breach_note: slaMilestones.breach_note || null,
        allow_clear_breach: true,
        actor: "operator",
      });
      setItem(updated);
      setSlaMilestones({
        brief_received_at: toDatetimeInput(updated?.brief_received_at),
        first_output_at: toDatetimeInput(updated?.first_output_at),
        feedback_received_at: toDatetimeInput(updated?.feedback_received_at),
        final_delivered_at: toDatetimeInput(updated?.final_delivered_at),
        breach_reason_code: updated?.breach_reason_code || "",
        breach_note: updated?.breach_note || "",
      });
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("SLA milestones updated.");
    } catch (updateError) {
      toast.error(updateError.message || "Failed to update SLA milestones.");
    } finally {
      setUpdatingSla(false);
    }
  };

  const handleGenerateCaseStudy = async () => {
    if (!item) return;
    setLoadingCaseStudy(true);
    setCaseStudyError("");
    try {
      const draft = await getCaseStudyDraft(item.id);
      if (!draft) {
        setCaseStudyError("Case study draft is unavailable for this job.");
        return;
      }
      setCaseStudyDraft(draft);
      toast.success("Case study draft generated.");
    } catch (draftError) {
      setCaseStudyError(draftError.message || "Failed to generate case study draft.");
    } finally {
      setLoadingCaseStudy(false);
    }
  };

  const handleGenerateTestimonial = async () => {
    if (!item) return;
    setLoadingTestimonial(true);
    setTestimonialError("");
    try {
      const generated = await generateJobTestimonial(item.id, "operator");
      setTestimonial(generated);
      setTestimonialForm({
        prompt: generated?.prompt || "",
        draft: generated?.draft || "",
        status: generated?.status || "draft",
      });
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("Testimonial draft generated.");
    } catch (genError) {
      setTestimonialError(genError.message || "Failed to generate testimonial.");
    } finally {
      setLoadingTestimonial(false);
    }
  };

  const handleSaveTestimonial = async () => {
    if (!item) return;
    setSavingTestimonial(true);
    setTestimonialError("");
    try {
      const updated = await updateJobTestimonial(item.id, {
        prompt: testimonialForm.prompt,
        draft: testimonialForm.draft,
        status: testimonialForm.status,
        actor: "operator",
      });
      setTestimonial(updated);
      setTestimonialForm({
        prompt: updated?.prompt || "",
        draft: updated?.draft || "",
        status: updated?.status || "draft",
      });
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("Testimonial saved.");
    } catch (saveError) {
      setTestimonialError(saveError.message || "Failed to save testimonial.");
    } finally {
      setSavingTestimonial(false);
    }
  };

  const handleGenerateProofPack = async () => {
    if (!item) return;
    setLoadingProofPack(true);
    setProofPackError("");
    try {
      const generated = await generateJobProofPack(item.id, "operator");
      setProofPack(generated);
      setProofForm({
        hero_proof_summary: generated?.hero_proof_summary || "",
        landing_page: generated?.snippets?.landing_page || "",
        sales_deck: generated?.snippets?.sales_deck || "",
        outreach: generated?.snippets?.outreach || "",
        social: generated?.snippets?.social || "",
        turnaround_proof: generated?.turnaround_proof || "",
        testimonial_snippet: generated?.testimonial_snippet || "",
        status: generated?.status || "draft",
      });
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("Proof asset pack generated.");
    } catch (generateError) {
      setProofPackError(generateError.message || "Failed to generate proof pack.");
    } finally {
      setLoadingProofPack(false);
    }
  };

  const handleSaveProofPack = async () => {
    if (!item) return;
    setSavingProofPack(true);
    setProofPackError("");
    try {
      const updated = await updateJobProofPack(item.id, {
        hero_proof_summary: proofForm.hero_proof_summary,
        snippets: {
          landing_page: proofForm.landing_page,
          sales_deck: proofForm.sales_deck,
          outreach: proofForm.outreach,
          social: proofForm.social,
        },
        turnaround_proof: proofForm.turnaround_proof,
        testimonial_snippet: proofForm.testimonial_snippet,
        status: proofForm.status,
        actor: "operator",
      });
      setProofPack(updated);
      setProofForm({
        hero_proof_summary: updated?.hero_proof_summary || "",
        landing_page: updated?.snippets?.landing_page || "",
        sales_deck: updated?.snippets?.sales_deck || "",
        outreach: updated?.snippets?.outreach || "",
        social: updated?.snippets?.social || "",
        turnaround_proof: updated?.turnaround_proof || "",
        testimonial_snippet: updated?.testimonial_snippet || "",
        status: updated?.status || "draft",
      });
      const nextAudit = await listJobAudit(item.id);
      setAudit(nextAudit);
      toast.success("Proof asset pack saved.");
    } catch (saveError) {
      setProofPackError(saveError.message || "Failed to save proof pack.");
    } finally {
      setSavingProofPack(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap gap-2">
        <Link
          to="/intake/new"
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          New Intake
        </Link>
        <Link
          to={`/jobs/${id}/quotes/new`}
          className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Generate Quote
        </Link>
      </div>
      <article className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex flex-wrap gap-2">
          {item.is_pilot ? (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-200">
              pilot
            </span>
          ) : null}
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            {item.status}
          </span>
          <span className="rounded-full border border-neutral-700 bg-black px-2.5 py-1 text-xs text-neutral-300">
            Deadline {item.deadline}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">{item.brand}</h1>
        <p className="mt-1 text-sm text-neutral-400">Client: {item.client_name}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Created: {formatDate(item.created_at)} | Updated: {formatDate(item.updated_at)}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-black p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">SLA Status</div>
              <SlaBadge status={sla.status} />
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <SlaField
                label="Brief Received At"
                value={slaMilestones.brief_received_at}
                onChange={(value) =>
                  setSlaMilestones((prev) => ({ ...prev, brief_received_at: value }))
                }
              />
              <SlaField
                label="First Output At"
                value={slaMilestones.first_output_at}
                onChange={(value) =>
                  setSlaMilestones((prev) => ({ ...prev, first_output_at: value }))
                }
              />
              <SlaField
                label="Feedback Received At"
                value={slaMilestones.feedback_received_at}
                onChange={(value) =>
                  setSlaMilestones((prev) => ({ ...prev, feedback_received_at: value }))
                }
              />
              <SlaField
                label="Final Delivered At"
                value={slaMilestones.final_delivered_at}
                onChange={(value) =>
                  setSlaMilestones((prev) => ({ ...prev, final_delivered_at: value }))
                }
              />
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Brief to first output: {formatHours(sla?.brief_to_first_output?.hours)} (
              {sla?.brief_to_first_output?.status || "unknown"}) | Feedback to final:{" "}
              {formatHours(sla?.feedback_to_final_delivery?.hours)} (
              {sla?.feedback_to_final_delivery?.status || "unknown"})
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="block">
                <div className="text-[11px] text-neutral-500">Breach Reason Code</div>
                <input
                  type="text"
                  value={slaMilestones.breach_reason_code}
                  onChange={(event) =>
                    setSlaMilestones((prev) => ({
                      ...prev,
                      breach_reason_code: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                />
              </label>
              <label className="block">
                <div className="text-[11px] text-neutral-500">Breach Note</div>
                <input
                  type="text"
                  value={slaMilestones.breach_note}
                  onChange={(event) =>
                    setSlaMilestones((prev) => ({
                      ...prev,
                      breach_note: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                />
              </label>
            </div>
            <button
              onClick={handleSlaUpdate}
              disabled={updatingSla}
              className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              {updatingSla ? "Updating SLA..." : "Save SLA Milestones"}
            </button>
          </div>
          <Detail
            label="Generation Cost"
            value={
              generationCost.run_count > 0
                ? `Total: $${Number(generationCost.total_cost || 0).toFixed(2)}\nRuns: ${generationCost.run_count}\nActual: $${Number(
                    generationCost.actual_cost_total || 0
                  ).toFixed(2)} (${generationCost.actual_runs})\nEstimated fallback: $${Number(
                    generationCost.estimated_cost_total || 0
                  ).toFixed(2)} (${generationCost.estimated_runs})`
                : "No generation cost data yet."
            }
          />
          <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-black p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Update Status
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none"
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
              <button
                onClick={handleStatusUpdate}
                disabled={updatingStatus || nextStatus === item.status}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
              >
                {updatingStatus ? "Updating..." : "Apply Status"}
              </button>
            </div>
          </div>
          <Detail label="Contact Info" value={item.contact_info} />
          <Detail label="Use Case" value={item.use_case} />
          <Detail label="Mood / Style" value={item.mood_style || "Not provided"} />
          <Detail label="Deliverables" value={item.deliverables} />
          <Detail
            label="Pilot Permissions"
            value={
              item.is_pilot
                ? `Case study: ${item.case_study_permission ? "allowed" : "not allowed"}\nTestimonial: ${
                    item.testimonial_permission ? "allowed" : "not allowed"
                  }`
                : "Not a pilot job"
            }
          />
          <Detail label="Notes" value={item.notes || "Not provided"} className="md:col-span-2" />
          <Detail
            label="Reference Links"
            value={referenceLinks.length > 0 ? referenceLinks.join("\n") : "Not provided"}
            className="md:col-span-2"
          />
        </div>

        <section className="mt-4">
          <h2 className="text-sm font-semibold text-white">Uploaded References</h2>
          {referenceUploads.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">No uploaded references.</p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {referenceUploads.map((asset) => (
                <img
                  key={asset.id}
                  src={getImageAssetPreviewUrl(asset)}
                  alt={asset.id}
                  className="h-36 w-full rounded-lg border border-neutral-800 object-cover"
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-white">Quotes</h2>
          {quotes.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">No quote versions yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {quotes.map((quote) => (
                  <Link
                    key={quote.id}
                    to={`/quotes/${quote.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-black p-3 hover:border-neutral-700"
                  >
                    <div className="text-sm text-neutral-200">
                      v{quote.version} | {quote.package_type} | ${quote.price}
                      {quote.is_pilot ? " | pilot" : ""}
                    </div>
                    <div className="text-xs text-neutral-500">{quote.delivery_timeline}</div>
                  </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-white">Audit Timeline</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">No activity logged yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {audit.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-neutral-800 bg-black p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-neutral-200">{entry.action_type}</div>
                    <div className="text-xs text-neutral-500">{formatDate(entry.created_at)}</div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">actor: {entry.actor}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {summarizeMetadata(entry.metadata)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-neutral-800 bg-black p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Case Study Draft</h2>
            <button
              onClick={handleGenerateCaseStudy}
              disabled={loadingCaseStudy}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              {loadingCaseStudy ? "Generating..." : "Generate Draft"}
            </button>
          </div>
          {caseStudyError ? (
            <p className="mt-2 text-xs text-red-300">{caseStudyError}</p>
          ) : null}
          {!caseStudyDraft && !caseStudyError ? (
            <p className="mt-2 text-xs text-neutral-500">
              Generate a structured case study draft from job, quote, SLA, cost, audit, and asset metadata.
            </p>
          ) : null}
          {caseStudyDraft ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Detail label="Title" value={caseStudyDraft.title || "Untitled"} />
              <Detail
                label="Publish Eligibility"
                value={
                  caseStudyDraft?.publish_eligibility?.eligible
                    ? "eligible"
                    : `not eligible${
                        Array.isArray(caseStudyDraft?.publish_eligibility?.reasons) &&
                        caseStudyDraft.publish_eligibility.reasons.length > 0
                          ? `: ${caseStudyDraft.publish_eligibility.reasons.join(", ")}`
                          : ""
                      }`
                }
              />
              <Detail
                label="Client / Brand Summary"
                value={caseStudyDraft.client_brand_summary || "Not provided"}
                className="md:col-span-2"
              />
              <Detail label="Challenge" value={caseStudyDraft.challenge || "Not provided"} />
              <Detail
                label="Creative Approach"
                value={caseStudyDraft.creative_approach || "Not provided"}
              />
              <Detail label="Execution" value={caseStudyDraft.execution || "Not provided"} />
              <Detail label="Turnaround" value={caseStudyDraft.turnaround || "Not provided"} />
              <Detail label="Deliverables" value={caseStudyDraft.deliverables || "Not provided"} />
              <Detail
                label="Results / Notes"
                value={caseStudyDraft.results_notes || "Not provided"}
              />
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-neutral-800 bg-black p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Testimonial Capture</h2>
            <button
              onClick={handleGenerateTestimonial}
              disabled={loadingTestimonial}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              {loadingTestimonial ? "Generating..." : "Generate Testimonial Draft"}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Visibility: {testimonial?.visibility || "unknown"} | Eligibility:{" "}
            {testimonial?.eligible ? "eligible" : "not eligible"}
          </p>
          {testimonial?.permissions?.is_pilot ? (
            <p className="mt-1 text-xs text-neutral-500">
              Pilot testimonial permission:{" "}
              {testimonial?.permissions?.testimonial_permission ? "granted" : "not granted"}
            </p>
          ) : null}
          {testimonialError ? (
            <p className="mt-2 text-xs text-red-300">{testimonialError}</p>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-[11px] text-neutral-500">Testimonial Prompt</div>
              <textarea
                rows={3}
                value={testimonialForm.prompt}
                onChange={(event) =>
                  setTestimonialForm((prev) => ({ ...prev, prompt: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block md:col-span-2">
              <div className="text-[11px] text-neutral-500">Testimonial Draft</div>
              <textarea
                rows={5}
                value={testimonialForm.draft}
                onChange={(event) =>
                  setTestimonialForm((prev) => ({ ...prev, draft: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Status</div>
              <select
                value={testimonialForm.status}
                onChange={(event) =>
                  setTestimonialForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              >
                <option value="draft">draft</option>
                <option value="captured">captured</option>
                <option value="approved">approved</option>
                <option value="published">published</option>
              </select>
            </label>
          </div>
          <button
            onClick={handleSaveTestimonial}
            disabled={savingTestimonial}
            className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          >
            {savingTestimonial ? "Saving..." : "Save Testimonial"}
          </button>
        </section>

        <section className="mt-6 rounded-xl border border-neutral-800 bg-black p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Proof Asset Pack</h2>
            <button
              onClick={handleGenerateProofPack}
              disabled={loadingProofPack}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              {loadingProofPack ? "Generating..." : "Generate Proof Pack"}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Visibility: {proofPack?.visibility || "unknown"} | Eligibility:{" "}
            {proofPack?.eligible ? "eligible" : "not eligible"}
          </p>
          {proofPackError ? (
            <p className="mt-2 text-xs text-red-300">{proofPackError}</p>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-[11px] text-neutral-500">Hero Proof Summary</div>
              <textarea
                rows={3}
                value={proofForm.hero_proof_summary}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, hero_proof_summary: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Landing Page Snippet</div>
              <textarea
                rows={3}
                value={proofForm.landing_page}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, landing_page: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Sales Deck Snippet</div>
              <textarea
                rows={3}
                value={proofForm.sales_deck}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, sales_deck: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Outreach Snippet</div>
              <textarea
                rows={3}
                value={proofForm.outreach}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, outreach: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Social Snippet</div>
              <textarea
                rows={3}
                value={proofForm.social}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, social: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Turnaround Proof</div>
              <textarea
                rows={3}
                value={proofForm.turnaround_proof}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, turnaround_proof: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Testimonial Snippet</div>
              <textarea
                rows={3}
                value={proofForm.testimonial_snippet}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, testimonial_snippet: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-neutral-500">Status</div>
              <select
                value={proofForm.status}
                onChange={(event) =>
                  setProofForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              >
                <option value="draft">draft</option>
                <option value="ready">ready</option>
                <option value="approved">approved</option>
                <option value="published">published</option>
              </select>
            </label>
          </div>
          <button
            onClick={handleSaveProofPack}
            disabled={savingProofPack}
            className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          >
            {savingProofPack ? "Saving..." : "Save Proof Pack"}
          </button>
        </section>
      </article>
    </div>
  );
}

function toDatetimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function formatHours(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return `${Number(value).toFixed(1)}h`;
}

function SlaField({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
      />
    </label>
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

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "no metadata";
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  if (entries.length === 0) return "no metadata";
  return entries
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}
