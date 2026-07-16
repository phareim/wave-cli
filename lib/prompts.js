// Shared prompt handling: reading prompts from files, the --prompt <dir> batch
// loop, and keyword-based prompt generation/rewriting via Venice's chat API
// (used by both venice and wave, which is why VENICE_API_TOKEN is required
// even for Wavespeed generations).

import { promises as fs } from "fs";
import path from "path";
import * as ui from "./ui.js";

const VENICE_CHAT_URL = "https://api.venice.ai/api/v1/chat/completions";

const SMOKE_MODE =
  process.env.VENICE_SMOKE_TEST === "1" || process.env.WAVESPEED_SMOKE_TEST === "1";

const RATING_GUIDANCE = {
  G:    "Family-friendly. No nudity, no violence, no drugs, no suggestive content.",
  PG:   "Mild themes acceptable. No nudity, very mild peril at most, nothing sexual.",
  PG13: "Suggestive content and stylized action allowed. No explicit nudity or graphic gore.",
  R:    "Adult content allowed: nudity, mature themes, gore, strong sexuality. Be vivid and uninhibited where it serves the image.",
};

export const VALID_RATINGS = Object.keys(RATING_GUIDANCE);

const buildSystemPrompt = (rating, mode) => {
  const guidance = RATING_GUIDANCE[rating] || RATING_GUIDANCE.R;
  if (mode === "rewrite") {
    return [
      "You are a prompt engineer for AI image generation models.",
      "Rewrite the user's existing image prompt so it naturally incorporates the supplied keywords. Preserve the original subject, intent, and style; weave each keyword in as a concrete detail (object, setting, attribute, mood, lighting, etc.).",
      "Output ONE vivid English prompt as a single paragraph of plain text. No markdown, no quotation marks, no preamble, no trailing notes.",
      `Content rating: ${rating}. ${guidance}`,
    ].join(" ");
  }
  return [
    "You are a prompt engineer for AI image generation models.",
    "Given a comma-separated list of keywords and a content rating, write ONE vivid English prompt for a single image.",
    "Be specific about subject, composition, lighting, lens, mood, and texture. Prefer concrete nouns and adjectives over abstractions.",
    "Output the prompt as a single paragraph of plain text. No markdown, no quotation marks, no preamble, no trailing notes.",
    `Content rating: ${rating}. ${guidance}`,
  ].join(" ");
};

const mockGeneratedPrompt = (keywords, rating, existingPrompt) =>
  existingPrompt
    ? `[mock ${rating} rewrite] ${existingPrompt} :: incorporating ${keywords}`
    : `[mock ${rating}] cinematic image inspired by: ${keywords}`;

export const generatePromptFromKeywords = async ({
  keywords,
  rating = "R",
  model = "zai-org-glm-4.6",
  existingPrompt,
  debug = false,
}) => {
  if (!keywords || !keywords.trim()) {
    throw new Error("generatePromptFromKeywords: keywords are required");
  }

  const trimmedExisting = existingPrompt && existingPrompt.trim() ? existingPrompt.trim() : null;
  const mode = trimmedExisting ? "rewrite" : "generate";

  if (SMOKE_MODE) return mockGeneratedPrompt(keywords.trim(), rating, trimmedExisting);

  if (!process.env.VENICE_API_TOKEN) {
    throw new Error("VENICE_API_TOKEN is not set; required for --keywords prompt expansion (uses Venice text models).");
  }

  const userContent = trimmedExisting
    ? `Existing prompt:\n${trimmedExisting}\n\nKeywords to incorporate: ${keywords.trim()}`
    : `Keywords: ${keywords.trim()}`;

  const body = {
    model,
    temperature: 0.85,
    messages: [
      { role: "system", content: buildSystemPrompt(rating, mode) },
      { role: "user", content: userContent },
    ],
  };

  if (debug) {
    console.log("Text-model URL:", VENICE_CHAT_URL);
    console.log("Text-model mode:", mode);
    console.log("Text-model body:", JSON.stringify(body, null, 2));
  }

  const response = await fetch(VENICE_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VENICE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice chat API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const generated = data?.choices?.[0]?.message?.content?.trim();
  if (!generated) {
    throw new Error(`Venice chat API returned no content: ${JSON.stringify(data)}`);
  }

  return generated;
};

export const readPromptFromFile = async (filePath) => {
  try {
    return (await fs.readFile(filePath, "utf8")).trim();
  } catch {
    return null;
  }
};

const tryStat = async (p) => {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
};

/**
 * Resolve the effective prompt for one generation. --prompt accepts three
 * spellings, disambiguated by what exists on disk:
 *   1. `--prompt "literal text"` — anything that isn't an existing file.
 *   2. `--prompt path/to/file.txt` — an existing file is read as the prompt
 *      (directories are handled by runPromptBatch before this runs).
 *   3. No --prompt — falls back to ./prompt.txt.
 * If --keywords is set, generate a fresh prompt from them — or rewrite the
 * prompt found above to incorporate them.
 *
 * @returns {Promise<{prompt: string|null, originalPrompt: string|undefined}>}
 *   originalPrompt is set when keywords rewrote a user-supplied prompt.
 */
export const resolvePrompt = async (options, { debug = false } = {}) => {
  let prompt = null;

  const raw = options.prompt?.trim();
  if (raw) {
    const stat = await tryStat(raw);
    if (stat?.isFile()) {
      prompt = await readPromptFromFile(raw);
      ui.info(`prompt from ${raw}`);
    } else {
      prompt = raw;
    }
  } else {
    const fromFile = await readPromptFromFile("./prompt.txt");
    if (fromFile) {
      prompt = fromFile;
      ui.info("prompt from ./prompt.txt");
    }
  }

  let originalPrompt;
  if (options.keywords) {
    let rating = options.keywordRating;
    if (!VALID_RATINGS.includes(rating)) {
      ui.warn(`Invalid --keyword-rating '${rating}'. Using 'R'. Valid: ${VALID_RATINGS.join(", ")}`);
      rating = options.keywordRating = "R";
    }
    ui.banner("keywords", prompt ? "rewriting prompt" : "generating prompt");
    ui.kv([
      ["keywords", options.keywords],
      ["rating", rating],
      ["model", options.keywordModel],
    ]);
    const spin = ui.spinner("expanding");
    try {
      const generated = await generatePromptFromKeywords({
        keywords: options.keywords,
        rating,
        model: options.keywordModel,
        existingPrompt: prompt || undefined,
        debug,
      });
      spin.succeed(ui.truncate(generated, 160));
      if (prompt) originalPrompt = prompt;
      prompt = generated;
    } catch (error) {
      spin.fail(`Failed to generate prompt from keywords: ${error.message}`);
      process.exit(1);
    }
  }

  return { prompt, originalPrompt };
};

/**
 * If --prompt points at a directory, run `run({...options, prompt: <file>})`
 * once per direct-child .txt file (sorted) and return true. Returns false
 * when --prompt is not a directory, so the caller falls through to its
 * single-prompt path.
 */
export const runPromptBatch = async (options, run) => {
  const dirPath = await promptBatchDir(options);
  if (!dirPath) return false;

  const txtFiles = await listPromptFiles(dirPath);
  ui.batchHeader(dirPath, txtFiles.length);
  for (let i = 0; i < txtFiles.length; i++) {
    ui.fileHeader(txtFiles[i], i + 1, txtFiles.length);
    await run({ ...options, prompt: path.join(dirPath, txtFiles[i]) });
  }
  return true;
};

/** Resolve --prompt to an absolute directory path, or null when it isn't one. */
export const promptBatchDir = async (options) => {
  const raw = options.prompt?.trim();
  if (!raw) return null;
  const dirPath = path.resolve(process.cwd(), raw);
  const stat = await tryStat(dirPath);
  return stat?.isDirectory() ? dirPath : null;
};

/** List direct-child .txt files (sorted); exits with an error when none. */
export const listPromptFiles = async (dirPath) => {
  let entries;
  try {
    entries = await fs.readdir(dirPath);
  } catch (error) {
    ui.err(`Failed to read directory ${dirPath}: ${error.message}`);
    process.exit(1);
  }
  const txtFiles = entries.filter((f) => f.endsWith(".txt")).sort();
  if (txtFiles.length === 0) {
    ui.err(`No .txt files found in ${dirPath}.`);
    process.exit(1);
  }
  return txtFiles;
};
