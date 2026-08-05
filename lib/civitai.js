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
export const NSFW_LEVELS = { soft: "Soft", mature: "Mature", x: "X" };

// Civitai nsfwLevel → aiwdm rating; unknown levels fail safe to R.
export const aiwdmRatingFor = (nsfwLevel) => {
  if (nsfwLevel === "None") return "PG";
  if (nsfwLevel === "Soft") return "PG13";
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
 * { id, pageUrl, prompt (cleaned), rawPrompt, likes, hearts, nsfwLevel,
 *   baseModel, username }, filtered to cleaned prompts longer than
 * MIN_PROMPT_CHARS and deduped on the cleaned text.
 *
 * Test seam: CHART_ART_FIXTURE=<file> reads the raw API response JSON from
 * disk instead of the network.
 */
export async function fetchChart({ period = "week", nsfw, limit = 100 } = {}) {
  const apiPeriod = PERIODS[period];
  if (!apiPeriod) throw new Error(`unknown period '${period}' — valid: ${Object.keys(PERIODS).join(", ")}`);
  let apiNsfw = "None";
  if (nsfw) {
    apiNsfw = NSFW_LEVELS[nsfw];
    if (!apiNsfw) throw new Error(`unknown nsfw level '${nsfw}' — valid: ${Object.keys(NSFW_LEVELS).join(", ")}`);
  }

  let json;
  if (process.env.CHART_ART_FIXTURE) {
    json = JSON.parse(await readFile(process.env.CHART_ART_FIXTURE, "utf8"));
  } else {
    const url = new URL(API_URL);
    url.searchParams.set("sort", "Most Reactions");
    url.searchParams.set("period", apiPeriod);
    url.searchParams.set("nsfw", apiNsfw);
    url.searchParams.set("withMeta", "true"); // without this, meta is null on every item
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 200)));
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Civitai API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    json = await res.json();
  }

  const seen = new Set();
  const entries = [];
  for (const item of json?.items ?? []) {
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
      nsfwLevel: item.nsfwLevel ?? "None",
      baseModel: item.baseModel || "",
      username: item.username || "",
    });
  }
  return entries;
}
