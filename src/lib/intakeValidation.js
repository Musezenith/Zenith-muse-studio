function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dateOnly(value) {
  const normalized = text(value);
  if (!normalized.match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  return normalized;
}

function todayDateOnly() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function validateIntakeForm(form, uploads = []) {
  const isPilot =
    form?.is_pilot === true || form?.is_pilot === "true" || form?.is_pilot === 1;
  const caseStudyPermission =
    form?.case_study_permission === true ||
    form?.case_study_permission === "true" ||
    form?.case_study_permission === 1;
  const testimonialPermission =
    form?.testimonial_permission === true ||
    form?.testimonial_permission === "true" ||
    form?.testimonial_permission === 1;

  const errors = {};
  const value = {
    client_name: text(form.client_name),
    brand: text(form.brand),
    contact_info: text(form.contact_info),
    use_case: text(form.use_case),
    mood_style: text(form.mood_style),
    deliverables: text(form.deliverables),
    deadline: dateOnly(form.deadline),
    references: text(form.references),
    notes: text(form.notes),
    is_pilot: isPilot,
    case_study_permission: caseStudyPermission,
    testimonial_permission: testimonialPermission,
    reference_uploads: Array.isArray(uploads) ? uploads : [],
  };

  if (!value.client_name) errors.client_name = "Client name is required.";
  if (!value.brand) errors.brand = "Brand is required.";
  if (!value.contact_info) errors.contact_info = "Contact info is required.";
  if (!value.use_case) errors.use_case = "Use case is required.";
  if (!value.deliverables) errors.deliverables = "Deliverables are required.";
  if (!value.deadline) {
    errors.deadline = "Deadline is required (YYYY-MM-DD).";
  } else if (value.deadline < todayDateOnly()) {
    errors.deadline = "Deadline cannot be in the past.";
  }

  if (value.reference_uploads.length > 12) {
    errors.reference_uploads = "Maximum 12 reference uploads.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value,
  };
}
