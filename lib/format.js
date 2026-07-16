// Shared --format parsing. One flag covers three spellings:
//   named   "square", "portrait", "wide", …   (each CLI maps per its API)
//   ratio   "2:3", "16:9"                     (forwarded verbatim to aspect-ratio APIs)
//   pixels  "1024x1280" or "1024*1280"        (used directly by pixel-size APIs)
// Conversions go both ways: ratio → pixels for pixel APIs, pixels/named →
// reduced ratio for aspect APIs. A ratio the user typed is NEVER round-tripped
// through pixels (that's what broke `--format 2:3` on seedream-v5-pro: the
// pixel map's 2732*4096 reduces to 683:1024, which the API rejects).

export const parseFormat = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).trim();
  let m = v.match(/^(\d+)\s*:\s*(\d+)$/);
  if (m) return { type: "ratio", ratio: `${+m[1]}:${+m[2]}`, w: +m[1], h: +m[2] };
  m = v.match(/^(\d+)\s*[x*×]\s*(\d+)$/i);
  if (m) return { type: "pixels", width: +m[1], height: +m[2] };
  return { type: "named", name: v.toLowerCase() };
};

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

export const reduceRatio = (w, h) => {
  if (!w || !h) return null;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
};

/** Largest width×height with the given ratio fitting inside a box×box square. */
export const fitRatioToBox = (rw, rh, box) => {
  const scale = box / Math.max(rw, rh);
  return { width: Math.round(rw * scale), height: Math.round(rh * scale) };
};

// Named formats for APIs that only take an aspect ratio (imagine, venice-video).
export const NAMED_RATIOS = {
  square: "1:1",
  portrait: "9:16",
  tall: "9:16",
  landscape: "16:9",
  wide: "16:9",
};

/**
 * Convert any --format spelling to an aspect-ratio string.
 * @param {string} value - the raw --format value
 * @param {Object} [pixelMap] - the CLI's named → "W*H" map, consulted for
 *   named formats before falling back to NAMED_RATIOS
 * @returns {string|null} - e.g. "2:3", or null when unresolvable
 */
export const toAspectRatio = (value, pixelMap = null) => {
  const f = parseFormat(value);
  if (!f) return null;
  if (f.type === "ratio") return f.ratio;
  if (f.type === "pixels") return reduceRatio(f.width, f.height);
  const px = pixelMap?.[f.name];
  if (typeof px === "string") {
    const [w, h] = px.split("*").map(Number);
    const reduced = reduceRatio(w, h);
    if (reduced) return reduced;
  }
  return NAMED_RATIOS[f.name] || null;
};
