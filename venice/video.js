#!/usr/bin/env node

import { setupVideoCLI, resolveVideoModel } from "./video-cli.js";
import * as ui from "../lib/ui.js";
import { publishOutputs } from "../lib/aiwdm.js";
import { resolvePrompt, runPromptBatch } from "../lib/prompts.js";
import { queueJob, pollUntilReady, saveVideo } from "../lib/venice-video.js";
import { toAspectRatio } from "../lib/format.js";

const SMOKE_MODE = process.env.VENICE_SMOKE_TEST === "1";

let DEBUG = false;

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

const buildQueueBody = (options, modelEntry) => {
  const body = {
    model: modelEntry.id,
    prompt: options.prompt,
    duration: options.duration,
    resolution: options.resolution,
    seed: options.seed,
  };

  if (modelEntry.type === "text-to-video" && options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }
  if (options.negativePrompt) body.negative_prompt = options.negativePrompt;
  if (options.imageUrl) body.image_url = options.imageUrl;
  if (options.referenceImages?.length) body.reference_image_urls = options.referenceImages;
  if (options.videoUrl) body.video_url = options.videoUrl;
  if (options.audioUrl) body.audio_url = options.audioUrl;

  return body;
};

const run = async (options) => {
  if (!process.env.VENICE_API_TOKEN && !SMOKE_MODE) {
    ui.err("VENICE_API_TOKEN environment variable is not set.");
    process.exit(1);
  }

  const { prompt } = await resolvePrompt(options);
  if (!prompt) {
    ui.err("No prompt provided. Use --prompt (text, file, or directory) or create ./prompt.txt.");
    process.exit(1);
  }
  options.prompt = prompt;

  const modelEntry = resolveVideoModel(options.model);
  if (!modelEntry) {
    ui.err(`Unknown video model '${options.model}'. Try --help for aliases.`);
    process.exit(1);
  }

  if (modelEntry.type === "image-to-video" && !options.imageUrl && !options.referenceImages?.length) {
    ui.err(`${modelEntry.name} requires --image-url or --reference-images.`);
    process.exit(1);
  }
  if (modelEntry.type === "video" && !options.videoUrl) {
    ui.err(`${modelEntry.name} requires --video-url.`);
    process.exit(1);
  }

  const seedProvidedByUser = options.seed !== undefined;
  if (!seedProvidedByUser) options.seed = randomSeed();

  // --format → aspect ratio (only text-to-video accepts one).
  options.aspectRatio = toAspectRatio(options.format) || options.format;

  const body = buildQueueBody(options, modelEntry);
  if (DEBUG) console.log("Queue body:", JSON.stringify(body, null, 2));

  ui.banner("venice-video", modelEntry.type);
  ui.kv([
    ["prompt", ui.truncate(options.prompt)],
    ["model", `${modelEntry.name} ${ui.c.dim(`[${modelEntry.id}]`)}`],
    ["clip", `${options.duration} · ${options.resolution}`],
    ["aspect", modelEntry.type === "text-to-video" ? options.aspectRatio : undefined],
    ["seed", `${options.seed}${seedProvidedByUser ? "" : ui.c.dim(" · auto")}`],
  ]);

  let queued;
  try {
    queued = await queueJob(body);
  } catch (err) {
    ui.err(err.message);
    process.exitCode = 1;
    return;
  }
  const queueId = queued.queue_id;
  if (DEBUG) console.log(`Queued. queue_id=${queueId}`);

  let buffer;
  try {
    buffer = await pollUntilReady(modelEntry.id, queueId, { debug: DEBUG });
  } catch (err) {
    ui.err(err.message);
    process.exitCode = 1;
    return;
  }

  const savedPath = await saveVideo(buffer, `venice_${queueId}.mp4`, options.out);

  const metadataBlob = options.metadata !== false && savedPath ? {
    source: "venice-video",
    kind: "video",
    generated_at: new Date().toISOString(),
    cli_version: "1.0.0",
    model: modelEntry.id,
    model_key: options.model,
    model_type: modelEntry.type,
    prompt: options.prompt,
    negative_prompt: options.negativePrompt,
    duration: options.duration,
    resolution: options.resolution,
    aspect_ratio: modelEntry.type === "text-to-video" ? options.aspectRatio : undefined,
    seed: options.seed,
    image_url: options.imageUrl,
    reference_image_urls: options.referenceImages,
    video_url: options.videoUrl,
    audio_url: options.audioUrl,
    queue_id: queueId,
  } : null;

  await publishOutputs(savedPath ? [savedPath] : [], metadataBlob, {
    sourceTag: "venice-video",
    modelTag: modelEntry.id,
    prompt: options.prompt,
    options,
    smoke: SMOKE_MODE,
  });

  ui.footer([
    `queue ${queueId}`,
    `${options.duration} · ${options.resolution}`,
    `seed ${options.seed}`,
  ]);
};

const main = async () => {
  const options = setupVideoCLI();
  DEBUG = options.debug || false;

  if (await runPromptBatch(options, run)) return;
  await run(options);
};

main();
