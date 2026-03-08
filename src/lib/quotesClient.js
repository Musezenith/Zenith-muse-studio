async function readJson(response) {
  return response.json().catch(() => ({}));
}

function toError(body, fallback) {
  const error = new Error(body?.error?.message || fallback);
  error.details = body?.error?.details || null;
  return error;
}

export async function draftQuote(payload) {
  const response = await fetch("/api/quotes/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to draft quote.");
  return body.item;
}

export async function createQuote(payload) {
  const response = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to create quote.");
  return body.item;
}

export async function getQuote(quoteId) {
  const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`);
  if (response.status === 404) return null;
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load quote.");
  return body.item || null;
}

export async function listQuotesByJob(jobId) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/quotes`);
  const body = await readJson(response);
  if (!response.ok) throw toError(body, "Failed to load quotes.");
  return Array.isArray(body.items) ? body.items : [];
}
