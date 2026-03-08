export async function createJob(payload) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to create job.");
    error.details = body?.error?.details || null;
    error.status = response.status;
    throw error;
  }
  return body.item;
}

export async function getJob(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load job.");
  }
  return body.item || null;
}

export async function getJobsOverview(limit = 25) {
  const response = await fetch(`/api/jobs/overview?limit=${encodeURIComponent(limit)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load jobs overview.");
  }
  return {
    summary: body.summary || {},
    recent: Array.isArray(body.recent) ? body.recent : [],
    generation_cost_summary: body.generation_cost_summary || null,
  };
}

export async function updateJobStatus(jobId, status, actor = "operator") {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, actor }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to update job status.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item;
}

export async function listJobAudit(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/audit`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load job audit.");
  }
  return Array.isArray(body.items) ? body.items : [];
}

export async function updateJobSla(jobId, payload) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/sla`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to update SLA milestones.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item;
}

export async function getCaseStudyDraft(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/case-study/draft`);
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load case study draft.");
  }
  return body.item || null;
}

export async function getJobTestimonial(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/testimonial`);
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load testimonial.");
  }
  return body.item || null;
}

export async function generateJobTestimonial(jobId, actor = "operator") {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/testimonial/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to generate testimonial.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item || null;
}

export async function updateJobTestimonial(jobId, payload) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/testimonial`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to update testimonial.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item || null;
}

export async function getJobProofPack(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/proof-pack`);
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "Failed to load proof pack.");
  }
  return body.item || null;
}

export async function generateJobProofPack(jobId, actor = "operator") {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/proof-pack/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to generate proof pack.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item || null;
}

export async function updateJobProofPack(jobId, payload) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/proof-pack`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Failed to update proof pack.");
    error.details = body?.error?.details || null;
    throw error;
  }
  return body.item || null;
}
