// Civitai chart plumbing for chart-art: fetch the top-reacted images from
// the public API, extract their generation prompts, and clean the Stable
// Diffusion syntax (weights, lora tags, quality boilerplate) that
// natural-language models handle poorly.
//
// API notes (verified 2026-08-05): no auth needed; `withMeta=true` is
// load-bearing — without it `meta` comes back null on every item. Roughly
// half to three quarters of a 100-item page carries a usable prompt.

import { readFile } from "fs/promises";

const API_URL = "https://civitai.com/api/v1/images";
const FETCH_TIMEOUT_MS = 30_000;
export const MIN_PROMPT_CHARS = 40;

// CLI flag value → API enum.
export const PERIODS = { day: "Day", week: "Week", month: "Month", year: "Year", all: "AllTime" };

// Civitai's browsingLevel numbering (the site's movie-style ratings). The
// public v1 API can't filter on it server-side — its legacy `nsfw` param is
// a coarse ceiling (None ⊂ Soft ⊂ Mature ⊂ X, verified 2026-08-05) — so we
// request the smallest legacy ceiling that covers the wanted range and
// filter exactly on each item's browsingLevel client-side.
export const BROWSING_LEVELS = { pg: 1, pg13: 2, r: 4, x: 8, xxx: 16 };
export const LEVEL_LABELS = { 1: "PG", 2: "PG13", 4: "R", 8: "X", 16: "XXX" };

// Smallest legacy nsfw ceiling that includes a given browsingLevel.
const legacyCeilingFor = (level) =>
  level <= 1 ? "None" : level <= 2 ? "Soft" : level <= 4 ? "Mature" : "X";

// Civitai browsingLevel → aiwdm rating; unknown levels fail safe to R.
export const aiwdmRatingFor = (browsingLevel) => {
  if (browsingLevel === 1) return "PG";
  if (browsingLevel === 2) return "PG13";
  return "R";
};

// Comma-separated tokens that are model-conditioning boilerplate, not image
// content. Matched case-insensitively against the whole token.
const BOILERPLATE_TOKEN = new RegExp(
  "^(" +
    [
      "score_\\d+(_up)?",
      "source_\\w+",
      "masterpiece",
      "(best|amazing|top|high(est)?) quality",
      "very aesthetic",
      "absurdres",
      "highres",
      "(extremely|ultra|highly|super|insanely) detailed",
      "intricate details?",
      "ultra realistic",
      "photorealistic",
      "\\d+k",
      "uhd",
      "hdr",
      "raw photo",
      "sharp focus",
    ].join("|") +
    ")$",
  "i",
);

/**
 * Strip Stable Diffusion prompt syntax down to plain content:
 * <lora:…>/<lyco:…> tags, embedding: refs, (word:1.2) weights, ((emphasis))
 * and [de-emphasis] brackets, BREAK separators, and boilerplate quality
 * tokens. Clean natural-language prompts pass through untouched.
 */
export function stripSdSyntax(prompt) {
  let s = String(prompt);
  s = s.replace(/<(?:lora|lyco|hypernet):[^>]*>/gi, "");
  s = s.replace(/\bembedding:\S+/gi, "");
  s = s.replace(/\bBREAK\b/g, ",");
  // Unwrap weights innermost-first so nested ((x:1.2)) fully resolves.
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(/\(([^()]*):\d+(?:\.\d+)?\)/g, "$1");
    s = s.replace(/\(([^()]*)\)/g, "$1");
    s = s.replace(/\[([^[\]]*)\]/g, "$1");
    if (s === before) break;
  }
  const tokens = s
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !BOILERPLATE_TOKEN.test(t));
  return tokens.join(", ").replace(/\s+/g, " ").trim();
}

/**
 * Fetch the Most Reactions chart and return prompt entries:
 * { id, pageUrl, prompt (cleaned), rawPrompt, likes, hearts, level
 *   (browsingLevel), levelLabel, baseModel, username }, filtered to the
 * [minRating, maxRating] browsingLevel range and to cleaned prompts longer
 * than MIN_PROMPT_CHARS, deduped on the cleaned text.
 *
 * Test seam: CHART_ART_FIXTURE=<file> reads the raw API response JSON from
 * disk instead of the network.
 */
export async function fetchChart({ period = "week", maxRating = "pg", minRating, limit = 100 } = {}) {
  const apiPeriod = PERIODS[period];
  if (!apiPeriod) throw new Error(`unknown period '${period}' — valid: ${Object.keys(PERIODS).join(", ")}`);
  const maxLevel = BROWSING_LEVELS[maxRating];
  if (!maxLevel) throw new Error(`unknown rating '${maxRating}' — valid: ${Object.keys(BROWSING_LEVELS).join(", ")}`);
  const minLevel = minRating ? BROWSING_LEVELS[minRating] : 1;
  if (!minLevel) throw new Error(`unknown rating '${minRating}' — valid: ${Object.keys(BROWSING_LEVELS).join(", ")}`);
  if (minLevel > maxLevel) throw new Error(`min rating '${minRating}' is above max rating '${maxRating}'`);

  let json;
  if (process.env.CHART_ART_FIXTURE) {
    json = JSON.parse(await readFile(process.env.CHART_ART_FIXTURE, "utf8"));
  } else {
    const url = new URL(API_URL);
    url.searchParams.set("sort", "Most Reactions");
    url.searchParams.set("period", apiPeriod);
    url.searchParams.set("nsfw", legacyCeilingFor(maxLevel));
    url.searchParams.set("withMeta", "true"); // without this, meta is null on every item
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 200)));
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Civitai API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    json = await res.json();
  }

  const seen = new Set();
  const entries = [];
  for (const item of json?.items ?? []) {
    const level = item?.browsingLevel ?? 1;
    if (level < minLevel || level > maxLevel) continue;
    const rawPrompt = item?.meta?.prompt;
    if (typeof rawPrompt !== "string") continue;
    const prompt = stripSdSyntax(rawPrompt);
    if (prompt.length <= MIN_PROMPT_CHARS) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      id: item.id,
      pageUrl: `https://civitai.com/images/${item.id}`,
      prompt,
      rawPrompt,
      likes: item.stats?.likeCount ?? 0,
      hearts: item.stats?.heartCount ?? 0,
      level,
      levelLabel: LEVEL_LABELS[level] ?? String(level),
      baseModel: item.baseModel || "",
      username: item.username || "",
    });
  }
  return entries;
}
