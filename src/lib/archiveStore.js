const ARCHIVE_STORAGE_KEY = "musezenith.archive.v1";
const ARCHIVE_BACKEND_URL =
  import.meta.env.VITE_ARCHIVE_BACKEND_URL || "/api/archive/runs";

function readRawArchive() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Archive read failed:", error);
    return [];
  }
}

function isBackendArchiveEnabled() {
  return Boolean(import.meta.env.VITE_ARCHIVE_BACKEND_URL);
}

async function listFromBackend() {
  const response = await fetch(ARCHIVE_BACKEND_URL);
  if (!response.ok) {
    throw new Error(`Archive list failed (${response.status})`);
  }
  const body = await response.json();
  return Array.isArray(body.items) ? body.items : [];
}

async function saveToBackend(entry) {
  const response = await fetch(ARCHIVE_BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    throw new Error(`Archive save failed (${response.status})`);
  }
}

async function clearFromBackend() {
  const response = await fetch(ARCHIVE_BACKEND_URL, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Archive clear failed (${response.status})`);
  }
}

async function updateInBackend(entryId, entry) {
  const response = await fetch(`${ARCHIVE_BACKEND_URL}/${entryId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    throw new Error(`Archive update failed (${response.status})`);
  }
}

export async function listArchiveEntries() {
  if (isBackendArchiveEnabled()) {
    try {
      return await listFromBackend();
    } catch (error) {
      console.error("Archive backend list failed, using local fallback:", error);
    }
  }
  return readRawArchive();
}

export async function saveArchiveEntry(entry) {
  if (isBackendArchiveEnabled()) {
    try {
      await saveToBackend(entry);
      return;
    } catch (error) {
      console.error("Archive backend save failed, using local fallback:", error);
    }
  }
  const existing = readRawArchive();
  const next = [entry, ...existing];
  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
}

export async function clearArchiveEntries() {
  if (isBackendArchiveEnabled()) {
    try {
      await clearFromBackend();
      return;
    } catch (error) {
      console.error("Archive backend clear failed, using local fallback:", error);
    }
  }
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ARCHIVE_STORAGE_KEY);
}

export async function updateArchiveEntry(entryId, entry) {
  if (isBackendArchiveEnabled()) {
    try {
      await updateInBackend(entryId, entry);
      return;
    } catch (error) {
      console.error("Archive backend update failed, using local fallback:", error);
    }
  }

  const existing = readRawArchive();
  const next = existing.map((item) => (item.id === entryId ? entry : item));
  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
}
