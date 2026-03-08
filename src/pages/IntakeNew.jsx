import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { createJob } from "../lib/jobsClient";
import { validateIntakeForm } from "../lib/intakeValidation";

function readAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function IntakeNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    client_name: "",
    brand: "",
    contact_info: "",
    use_case: "",
    mood_style: "",
    deliverables: "",
    deadline: "",
    references: "",
    notes: "",
    is_pilot: false,
    case_study_permission: false,
    testimonial_permission: false,
  });
  const [uploads, setUploads] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    try {
      const next = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const dataUri = await readAsDataUri(file);
        next.push({
          fileName: file.name,
          mimeType: file.type || "image/png",
          dataUri,
        });
      }
      setUploads((existing) => [...existing, ...next].slice(0, 12));
      setErrors((prev) => ({ ...prev, reference_uploads: "" }));
    } catch (error) {
      toast.error(error.message || "Failed to process selected files.");
    } finally {
      event.target.value = "";
    }
  };

  const removeUpload = (index) => {
    setUploads((existing) => existing.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validated = validateIntakeForm(form, uploads);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const item = await createJob(validated.value);
      toast.success("Job created.");
      navigate(`/jobs/${item.id}`);
    } catch (error) {
      const details = error?.details?.errors;
      if (details && typeof details === "object") {
        setErrors(details);
      }
      toast.error(error.message || "Failed to create job.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-semibold text-white">New Client Intake</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Standardized intake form to create a new production job.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-xl border border-neutral-800 bg-black p-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={form.is_pilot}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    is_pilot: checked,
                    case_study_permission: checked ? prev.case_study_permission : false,
                    testimonial_permission: checked ? prev.testimonial_permission : false,
                  }));
                }}
              />
              Mark as Pilot project
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  disabled={!form.is_pilot}
                  checked={form.case_study_permission}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      case_study_permission: event.target.checked,
                    }))
                  }
                />
                Case study permission
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  disabled={!form.is_pilot}
                  checked={form.testimonial_permission}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      testimonial_permission: event.target.checked,
                    }))
                  }
                />
                Testimonial permission
              </label>
            </div>
          </div>
          <Field
            label="Client Name"
            value={form.client_name}
            onChange={(value) => handleChange("client_name", value)}
            error={errors.client_name}
          />
          <Field
            label="Brand"
            value={form.brand}
            onChange={(value) => handleChange("brand", value)}
            error={errors.brand}
          />
          <Field
            label="Contact Info"
            value={form.contact_info}
            onChange={(value) => handleChange("contact_info", value)}
            error={errors.contact_info}
          />
          <Field
            label="Deadline"
            type="date"
            value={form.deadline}
            onChange={(value) => handleChange("deadline", value)}
            error={errors.deadline}
          />
          <TextArea
            label="Use Case"
            value={form.use_case}
            onChange={(value) => handleChange("use_case", value)}
            error={errors.use_case}
            className="md:col-span-2"
          />
          <TextArea
            label="Mood / Style"
            value={form.mood_style}
            onChange={(value) => handleChange("mood_style", value)}
            error={errors.mood_style}
            className="md:col-span-2"
          />
          <TextArea
            label="Deliverables"
            value={form.deliverables}
            onChange={(value) => handleChange("deliverables", value)}
            error={errors.deliverables}
            className="md:col-span-2"
          />
          <TextArea
            label="References (links)"
            value={form.references}
            onChange={(value) => handleChange("references", value)}
            error={errors.references}
            className="md:col-span-2"
          />
          <TextArea
            label="Notes"
            value={form.notes}
            onChange={(value) => handleChange("notes", value)}
            error={errors.notes}
            className="md:col-span-2"
          />
        </div>

        <div className="mt-4 rounded-xl border border-neutral-800 bg-black p-3">
          <label className="text-sm text-neutral-200">Reference Images</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="mt-2 block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-xs text-neutral-300"
          />
          {errors.reference_uploads && (
            <div className="mt-2 text-xs text-red-300">{errors.reference_uploads}</div>
          )}
          {uploads.length === 0 ? (
            <div className="mt-2 text-xs text-neutral-500">No images selected.</div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {uploads.map((upload, index) => (
                <div key={`${upload.fileName}-${index}`} className="rounded border border-neutral-800 bg-neutral-950 p-2">
                  <img src={upload.dataUri} alt={upload.fileName} className="h-24 w-full rounded object-cover" />
                  <div className="mt-1 truncate text-[11px] text-neutral-400">{upload.fileName}</div>
                  <button
                    type="button"
                    onClick={() => removeUpload(index)}
                    className="mt-1 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-900"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            disabled={submitting}
            type="submit"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating job..." : "Create Job"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, error }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-neutral-200">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
      />
      {error ? <div className="mt-1 text-xs text-red-300">{error}</div> : null}
    </label>
  );
}

function TextArea({ label, value, onChange, error, className = "" }) {
  return (
    <label className={className}>
      <div className="mb-1 text-sm text-neutral-200">{label}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none"
      />
      {error ? <div className="mt-1 text-xs text-red-300">{error}</div> : null}
    </label>
  );
}
