function toSearchableTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
}

export function deriveDocumentsMeta(documents = []) {
  const categories = new Set();
  const statuses = new Set();
  const tags = new Set();

  for (const item of documents) {
    if (typeof item?.category === "string" && item.category) categories.add(item.category);
    if (typeof item?.status === "string" && item.status) statuses.add(item.status);
    for (const tag of toSearchableTags(item?.tags)) tags.add(tag);
  }

  return {
    categories: Array.from(categories).sort(),
    statuses: Array.from(statuses).sort(),
    tags: Array.from(tags).sort(),
  };
}

export function filterDocuments(documents = [], filters = {}) {
  const query = (filters.query || "").trim().toLowerCase();
  const category = filters.category || "all";
  const status = filters.status || "all";
  const tag = filters.tag || "all";

  return documents.filter((item) => {
    const itemTags = toSearchableTags(item?.tags);
    if (category !== "all" && item?.category !== category) return false;
    if (status !== "all" && item?.status !== status) return false;
    if (tag !== "all" && !itemTags.includes(tag)) return false;
    if (!query) return true;

    const searchable = [
      item?.title || "",
      item?.summary || "",
      itemTags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}
