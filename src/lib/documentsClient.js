function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "all") continue;
    query.set(key, trimmed);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export async function listDocuments(params = {}) {
  const response = await fetch(`/api/documents${buildQuery(params)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load documents (${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.items) ? body.items : [];
}

export async function getDocument(slug) {
  const response = await fetch(`/api/documents/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load document (${response.status})`);
  }
  const body = await response.json();
  return body.item || null;
}
