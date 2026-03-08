function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyHeading(text, used = new Map()) {
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function renderInline(text = "") {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function listItemText(line) {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
}

export function renderMarkdownDocument(content = "") {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  const headings = [];
  const usedHeadingIds = new Map();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const codeMatch = line.match(/^```(\w+)?\s*$/);
    if (codeMatch) {
      const lang = codeMatch[1] ? ` class="language-${escapeHtml(codeMatch[1])}"` : "";
      i += 1;
      const block = [];
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        block.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      chunks.push(`<pre><code${lang}>${escapeHtml(block.join("\n"))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = slugifyHeading(text, usedHeadingIds);
      headings.push({ level, text, id });
      chunks.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      chunks.push("<hr />");
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      chunks.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(listItemText(lines[i]))}</li>`);
        i += 1;
      }
      chunks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(listItemText(lines[i]))}</li>`);
        i += 1;
      }
      chunks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#{1,6})\s+/)) {
      if (
        lines[i].match(/^```/) ||
        lines[i].match(/^>\s?/) ||
        lines[i].match(/^[-*]\s+/) ||
        lines[i].match(/^\d+\.\s+/) ||
        lines[i].trim().match(/^---+$/)
      ) {
        break;
      }
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length > 0) {
      chunks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    } else {
      i += 1;
    }
  }

  return {
    html: chunks.join("\n"),
    headings,
  };
}

function normalizedTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
}

export function getRelatedDocuments(currentDoc, allDocuments = [], limit = 4) {
  if (!currentDoc || !currentDoc.slug) return [];
  const currentTags = new Set(normalizedTags(currentDoc.tags));
  const currentCategory = currentDoc.category || "";

  return allDocuments
    .filter((item) => item && item.slug && item.slug !== currentDoc.slug)
    .map((item) => {
      let score = 0;
      if (item.category && item.category === currentCategory) score += 3;
      const tags = normalizedTags(item.tags);
      const sharedTagCount = tags.filter((tag) => currentTags.has(tag)).length;
      score += sharedTagCount * 2;
      if (item.status === "active") score += 1;
      return { item, score, sharedTagCount };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.sharedTagCount !== a.sharedTagCount) return b.sharedTagCount - a.sharedTagCount;
      return String(a.item.title || "").localeCompare(String(b.item.title || ""));
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.item);
}
