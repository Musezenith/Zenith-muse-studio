function encode(value) {
  return encodeURIComponent(String(value || "").trim());
}

function buildPreviewDataUrl({ mode, seed, rerun }) {
  const hue = Math.abs(Number(seed || 0)) % 360;
  const title = `${mode} | seed ${seed} | rerun ${rerun}`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1200" viewBox="0 0 960 1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 75% 45%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 120) % 360} 68% 20%)"/>
    </linearGradient>
  </defs>
  <rect width="960" height="1200" fill="url(#bg)"/>
  <rect x="56" y="56" width="848" height="1088" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
  <text x="80" y="132" font-family="IBM Plex Mono, monospace" font-size="38" fill="rgba(255,255,255,0.96)">${title}</text>
  <text x="80" y="188" font-family="IBM Plex Mono, monospace" font-size="22" fill="rgba(255,255,255,0.86)">MIKAGE ZENITH DEMO VISUAL</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateMockModeOutput({ run_id, mode, seed, rerun_count = 0 } = {}) {
  const safeMode = encode(mode || "unknown");
  const safeRun = encode(run_id || "run");
  const safeSeed = Number.isFinite(Number(seed)) ? Number(seed) : 0;
  const safeRerun = Number.isFinite(Number(rerun_count)) ? Number(rerun_count) : 0;

  return {
    provider: "mock-stub",
    request_id: `mock-${safeRun}-${safeMode}-${safeSeed}-${safeRerun}`,
    label: safeRerun > 0 ? `${mode}-rerun-${safeRerun}` : `${mode}-primary`,
    preview_url: `https://mock.mikage.local/runs/${safeRun}/${safeMode}/${safeSeed}?rerun=${safeRerun}`,
    preview_data_url: buildPreviewDataUrl({ mode: safeMode, seed: safeSeed, rerun: safeRerun }),
    seed: safeSeed,
  };
}
