#!/usr/bin/env node

import path from "path";

import { setupCLI } from "./cli.js";
import { getModelEndpoint, getModelInfo, constrainDimensions } from "./models.js";
import { image_size, API_BASE_URL } from "./config.js";
import { buildParameters } from "./parameter-builders.js";
import { handleResponse } from "./response-handlers.js";
import * as ui from "../lib/ui.js";
import { publishOutputs } from "../lib/aiwdm.js";
import { resolvePrompt, listPromptFiles, promptBatchDir } from "../lib/prompts.js";
import { parseFormat, fitRatioToBox, toAspectRatio } from "../lib/format.js";

let DEBUG = false;
const SMOKE_MODE = process.env.WAVESPEED_SMOKE_TEST === "1";
const VALID_OPTIMIZE_STYLES = ["default", "artistic", "photographic", "technical", "realistic"];

const authHeaders = (extra = {}) => ({
  Authorization: `Bearer ${process.env.WAVESPEED_KEY}`,
  ...extra,
});

const randomSeed = () => Math.floor(Math.random() * 2_147_483_647);

/** Poll a prediction until it completes or fails. */
// seedream-v5-pro has been observed queueing 3-4 min on WaveSpeed, so the
// default window is 10 min (was 2, which timed out on completed generations —
// wave-history --upload recovers those, but better not to need it).
const pollPrediction = async (url, { interval = 2000, maxAttempts = 300 } = {}) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseData = await response.json();
    const data = responseData.data || responseData;

    if (DEBUG) console.log(`Polling attempt ${attempt + 1}:`, data.status);

    if (data.status === "completed" || data.status === "failed") {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Polling timeout: Generation took too long");
};

const createMockResult = (modelEndpoint) => ({
  status: "completed",
  id: "mock-prediction-id",
  created_at: new Date().toISOString(),
  model: modelEndpoint,
  outputs: ["https://example.com/mock-wavespeed-output.png"],
  has_nsfw_contents: [false],
});

/**
 * Optimize a prompt using the Wavespeed prompt optimizer. The mode (image /
 * video) is derived from the target model's category. Falls back to the
 * original prompt on any error.
 */
const optimizePrompt = async (promptText, mode, style = "default") => {
  if (style === "random") {
    style = VALID_OPTIMIZE_STYLES[Math.floor(Math.random() * VALID_OPTIMIZE_STYLES.length)];
    console.log(`${ui.c.cyan("🎲")} random optimizer style: ${ui.c.bold(style)}`);
  } else if (!VALID_OPTIMIZE_STYLES.includes(style)) {
    ui.warn(`Invalid optimizer style '${style}'. Using 'default'. Valid: ${VALID_OPTIMIZE_STYLES.join(", ")}, random`);
    style = "default";
  }

  if (SMOKE_MODE) {
    console.log("Prompt optimization (mock)");
    return `Optimized: ${promptText}`;
  }

  const url = `${API_BASE_URL}/wavespeed-ai/prompt-optimizer`;
  const payload = { enable_sync_mode: false, text: promptText, mode, style };

  const spin = ui.spinner(`optimizing prompt ${ui.c.dim(`· ${mode}/${style}`)}`);
  try {
    if (DEBUG) {
      console.log("Optimizer API URL:", url);
      console.log("Optimizer payload:", JSON.stringify(payload, null, 2));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      spin.fail(`Optimizer API Error (${response.status}): ${await response.text()} — continuing with original prompt`);
      return promptText;
    }

    const initial = await response.json();
    const requestId = initial.data?.id;
    if (!requestId) {
      spin.fail("Failed to get request ID from optimizer — continuing with original prompt");
      return promptText;
    }

    const result = await pollPrediction(`${API_BASE_URL}/predictions/${requestId}/result`, {
      interval: 500,
    });

    if (result.status === "failed") {
      spin.fail(`Optimizer task failed: ${result.error} — continuing with original prompt`);
      return promptText;
    }

    const optimized = result.outputs?.[0];
    spin.succeed(`optimized ${ui.c.dim("→")} ${ui.truncate(optimized || promptText, 160)}`);
    return optimized || promptText;
  } catch (error) {
    spin.fail(`Optimizer error: ${error.message} — continuing with original prompt`);
    return promptText;
  }
};

/** Generate once using the Wavespeed API and publish the outputs. */
const run = async ({ prompt, originalPrompt, optimizeApplied = false, modelEndpoint, size, options }) => {
  const modelInfo = getModelInfo(modelEndpoint);
  const category = modelInfo?.metadata?.category || "text-to-image";

  const noSeed = modelInfo?.metadata?.noSeed === true;
  const noSize = modelInfo?.metadata?.noSize === true;
  const seedProvidedByUser = options.seed !== undefined && options.seed !== null;
  const seed = noSeed ? undefined : (seedProvidedByUser ? parseInt(options.seed, 10) : randomSeed());

  const input = buildParameters(category, {
    prompt,
    size,
    images: options.images,
    negativePrompt: options.negativePrompt,
    seed,
    aspectRatio: options.aspectRatio,
    resolution: options.resolution,
    outputFormat: options.outputFormat,
    quality: options.quality,
    duration: options.duration,
    audio: options.audio,
    promptExpansion: options.promptExpansion,
  }, modelInfo?.metadata || {});

  if (DEBUG) console.log("Request parameters:", JSON.stringify(input, null, 2));

  const isVideoCategory = category.endsWith("-to-video");

  ui.banner("wave", category);
  ui.kv([
    ["prompt", ui.truncate(prompt)],
    ["model", `${modelInfo?.metadata?.display_name || modelEndpoint} ${ui.c.dim(`[${modelEndpoint}]`)}`],
    ["size", (!isVideoCategory && !noSize) ? String(size).replace("*", "×") : undefined],
    ["aspect", input.aspect_ratio],
    ["resolution", input.resolution],
    ["quality", input.quality],
    ["clip", isVideoCategory && input.duration ? `${input.duration}s` : undefined],
    ["images", options.images?.length ? `${options.images.length} input image(s)` : undefined],
    ["seed", noSeed ? undefined : `${seed}${seedProvidedByUser ? "" : ui.c.dim(" · auto")}`],
  ]);

  const spin = ui.spinner(isVideoCategory ? "rendering video" : "generating");
  let result;

  try {
    if (SMOKE_MODE) {
      result = createMockResult(modelEndpoint);
      spin.succeed("generated (mock)");
    } else {
      const apiUrl = `${API_BASE_URL}/${modelEndpoint}`;
      if (DEBUG) console.log(`API URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        spin.fail(`API Error (${response.status}): ${await response.text()}`);
        process.exitCode = 1;
        return;
      }

      const initial = await response.json();
      if (DEBUG) console.log("Initial response:", JSON.stringify(initial, null, 2));

      const predictionData = initial.data || initial;

      if (predictionData.status === "completed") {
        result = predictionData;
      } else {
        const pollUrl = predictionData.urls?.get
          || (predictionData.id ? `${API_BASE_URL}/${modelEndpoint}/${predictionData.id}` : null);

        if (!pollUrl) {
          spin.fail("Unable to poll for result: no polling URL available");
          result = predictionData;
        } else {
          // Video generation takes minutes; poll patiently.
          result = await pollPrediction(pollUrl, {
            interval: isVideoCategory ? 5000 : 2000,
            maxAttempts: isVideoCategory ? 360 : 60,
          });
        }
      }
      if (result?.status === "completed") {
        spin.succeed(`generated in ${ui.fmtDuration(spin.elapsed())}`);
      }
    }

    if (DEBUG) console.log("## RESULT ##\n", JSON.stringify(result, null, 2));

    if (result?.status === "failed") {
      spin.fail(`Generation failed: ${result.error || "Unknown error"}`);
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    spin.fail(error.message || "Unknown error occurred");
    process.exitCode = 1;
    return;
  }

  const { ok: handled, savedPaths } = await handleResponse(result, category, options.out);
  if (!handled) {
    ui.err(`Failed to process response for category '${category}'`);
    process.exitCode = 1;
    return;
  }

  const metadataBlob = options.metadata !== false && savedPaths.length > 0 ? {
    source: "wavespeed",
    kind: isVideoCategory ? "video" : "image",
    generated_at: new Date().toISOString(),
    cli_version: "1.0.0",
    model: modelEndpoint,
    model_key: options.model,
    model_display_name: modelInfo?.metadata?.display_name,
    category,
    prompt,
    original_prompt: originalPrompt,
    optimize_mode: optimizeApplied ? (isVideoCategory ? "video" : "image") : undefined,
    optimize_style: optimizeApplied ? options.optimizeStyle : undefined,
    keywords: options.keywords,
    keyword_rating: options.keywords ? options.keywordRating : undefined,
    keyword_model: options.keywords ? options.keywordModel : undefined,
    size: (isVideoCategory || noSize) ? undefined : size,
    aspect_ratio: input.aspect_ratio,
    resolution: input.resolution,
    duration: input.duration,
    negative_prompt: input.negative_prompt,
    seed: input.seed,
    output_format: input.output_format,
    quality: input.quality,
    audio: input.audio,
    enable_prompt_expansion: input.enable_prompt_expansion,
    input_images: options.images,
    prediction_id: result?.id,
    created_at: result?.created_at,
  } : null;

  await publishOutputs(savedPaths, metadataBlob, {
    sourceTag: "wavespeed",
    modelTag: modelInfo?.metadata?.display_name || options.model,
    prompt,
    options,
    smoke: SMOKE_MODE,
  });

  ui.footer([
    result.has_nsfw_contents?.some((x) => x) ? "🔞" : null,
    noSeed ? null : `seed ${seed}`,
    result.id ? `prediction ${result.id}` : null,
  ]);
};

/** Resolve the prompt (file / keywords / optimizer) and generate `--count` times. */
const generateBatch = async (modelEndpoint, size, options) => {
  const count = parseInt(options.count, 10) || 1;
  for (let i = 0; i < count; i++) {
    if (count > 1) ui.roundHeader("generation", i + 1, count);

    const { prompt, originalPrompt: userPromptForRewrite } = await resolvePrompt(options, { debug: DEBUG });
    if (!prompt) {
      ui.err("No prompt provided. Use --prompt (text, file, or directory), --keywords, or create ./prompt.txt.");
      process.exit(1);
    }

    const category = getModelInfo(modelEndpoint)?.metadata?.category || "text-to-image";
    const optimizedPrompt = options.optimize
      ? await optimizePrompt(prompt, category.endsWith("-to-video") ? "video" : "image", options.optimizeStyle)
      : prompt;
    const optimizeApplied = options.optimize && optimizedPrompt !== prompt;
    const originalPrompt = userPromptForRewrite ?? (optimizeApplied ? prompt : undefined);

    await run({
      prompt: optimizedPrompt,
      originalPrompt,
      optimizeApplied,
      modelEndpoint,
      size,
      options,
    });
  }
};

const main = async () => {
  const options = setupCLI();

  DEBUG = options.debug || false;

  if (!process.env.WAVESPEED_KEY && !SMOKE_MODE) {
    ui.err("WAVESPEED_KEY environment variable is not set.");
    console.error("  export WAVESPEED_KEY='your-api-key'");
    process.exit(1);
  }

  const modelEndpoint = getModelEndpoint(options.model);
  const modelInfo = getModelInfo(modelEndpoint);
  const category = modelInfo?.metadata?.category || "text-to-image";
  const takesAspectRatio = modelInfo?.metadata?.noSize === true || category.endsWith("-to-video");

  // One --format flag, two API shapes: aspect-ratio models (video, gpt-image-2,
  // seedream-v5-pro) get a ratio — user-typed ratios pass through verbatim,
  // named/pixel formats are reduced — while pixel models get a "W*H" size
  // constrained to the model's max dimensions.
  let size;
  if (takesAspectRatio) {
    if (options.format) {
      const ratio = toAspectRatio(options.format, image_size);
      if (ratio) {
        options.aspectRatio = ratio;
      } else {
        ui.warn(`--format '${options.format}' not understood — this model takes an aspect ratio like 2:3 or 16:9.`);
      }
    }
  } else {
    const f = parseFormat(options.format);
    let sizeStr = "4096*4096";
    if (f?.type === "pixels") {
      sizeStr = `${f.width}*${f.height}`;
    } else if (f?.type === "ratio") {
      // Prefer the curated pixel mapping for known ratios; otherwise scale to the 4096 box.
      const fit = fitRatioToBox(f.w, f.h, 4096);
      sizeStr = image_size[f.ratio] || `${fit.width}*${fit.height}`;
    } else if (f?.type === "named") {
      if (image_size[f.name]) {
        sizeStr = image_size[f.name];
      } else {
        ui.warn(`Unknown format '${options.format}'. Valid: ${Object.keys(image_size).join(", ")}, W:H, W*H. Using 4096*4096.`);
      }
    }
    size = constrainDimensions(sizeStr, modelEndpoint);
  }

  // --prompt <dir> batch mode: process every direct-child .txt file. --count
  // rotates over the file list rather than running each file count times
  // back-to-back: 3 files with --count 2 → file1, file2, file3, file1, …
  const batchDir = await promptBatchDir(options);
  if (batchDir) {
    const txtFiles = await listPromptFiles(batchDir);
    ui.batchHeader(batchDir, txtFiles.length);

    const rounds = parseInt(options.count, 10) || 1;
    const perFileOptions = { ...options, count: "1" };
    for (let round = 0; round < rounds; round++) {
      if (rounds > 1) ui.roundHeader("round", round + 1, rounds);
      for (let i = 0; i < txtFiles.length; i++) {
        ui.fileHeader(txtFiles[i], i + 1, txtFiles.length);
        await generateBatch(modelEndpoint, size, {
          ...perFileOptions,
          prompt: path.resolve(batchDir, txtFiles[i]),
        });
      }
    }
    return;
  }

  await generateBatch(modelEndpoint, size, options);
};

main();
