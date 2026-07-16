#!/usr/bin/env node

import path from "path";
import { Command } from "commander";

import * as ui from "../lib/ui.js";
import { publishOutputs } from "../lib/aiwdm.js";
import {
  queueJob,
  pollUntilReady,
  saveVideo,
  resolveImageInput,
  isHttpUrl,
} from "../lib/venice-video.js";

const MODEL_ID = "wan-2.6-flash-image-to-video";
const MODEL_NAME = "Wan 2.6 Flash";
const DEFAULT_PROMPT = "animate";
const SMOKE_MODE = process.env.VENICE_SMOKE_TEST === "1";

const program = new Command();
program
  .name("wan2.6-flash")
  .description("Image-to-video via Venice's Wan 2.6 Flash model.")
  .argument("<image>", "Path to a local image OR an https URL")
  .option("--prompt <text>", `Text prompt (defaults to "${DEFAULT_PROMPT}")`)
  .option("--duration <duration>", "Clip length: 5s, 10s, 15s.", "5s")
  .option("--resolution <res>", "Output resolution: 720p or 1080p.", "720p")
  .option("--negative-prompt <text>", "Negative prompt.")
  .option("--audio-url <url>", "Audio input URL (model supports audio input).")
  .option("--out", "Save video to ./videos/venice/ instead of $VENICE_VIDEO_PATH.")
  .option("--local", "Skip uploading to the aiwdm media library; only save locally.")
  .option("--aiwdm-rating <rating>", "Rating for aiwdm upload (G, PG, PG13, R).", "R")
  .option("--aiwdm-tags <tags>", "Extra comma-separated tags (source tag `venice-video` is always added).")
  .option("--no-metadata", "Skip recording generation metadata.")
  .option("--debug", "Verbose logging.")
  .helpOption("-h, --help", "Display this help message.")
  .parse(process.argv);

const opts = program.opts();
const [imageArg] = program.args;

const run = async () => {
  if (!process.env.VENICE_API_TOKEN && !SMOKE_MODE) {
    ui.err("VENICE_API_TOKEN environment variable is not set.");
    process.exit(1);
  }

  let imageUrl;
  try {
    imageUrl = await resolveImageInput(imageArg);
  } catch (err) {
    ui.err(err.message);
    process.exit(1);
  }

  const prompt = (opts.prompt && opts.prompt.trim()) || DEFAULT_PROMPT;
  const promptIsDefault = prompt === DEFAULT_PROMPT && !opts.prompt;

  // The model rejects `seed`, so none is sent.
  const body = {
    model: MODEL_ID,
    prompt,
    duration: opts.duration,
    resolution: opts.resolution,
    image_url: imageUrl,
  };
  if (opts.negativePrompt) body.negative_prompt = opts.negativePrompt;
  if (opts.audioUrl) body.audio_url = opts.audioUrl;

  if (opts.debug) {
    const debugBody = { ...body, image_url: isHttpUrl(imageUrl) ? imageUrl : `${imageUrl.slice(0, 60)}…(truncated)` };
    console.log("Queue body:", JSON.stringify(debugBody, null, 2));
  }

  ui.banner("wan2.6-flash", "image-to-video");
  ui.kv([
    ["image", isHttpUrl(imageArg) ? imageArg : path.resolve(imageArg)],
    ["prompt", `${ui.truncate(prompt)}${promptIsDefault ? ui.c.dim(" · default") : ""}`],
    ["clip", `${opts.duration} · ${opts.resolution}`],
    ["model", `${MODEL_NAME} ${ui.c.dim(`[${MODEL_ID}]`)}`],
  ]);

  let queued;
  try {
    queued = await queueJob(body);
  } catch (err) {
    ui.err(err.message);
    process.exit(1);
  }
  const queueId = queued.queue_id;
  if (opts.debug) console.log(`Queued. queue_id=${queueId}`);

  let buffer;
  try {
    buffer = await pollUntilReady(MODEL_ID, queueId, { debug: opts.debug });
  } catch (err) {
    ui.err(err.message);
    process.exit(1);
  }

  const savedPath = await saveVideo(buffer, `venice_${queueId}.mp4`, opts.out);

  const metadataBlob = opts.metadata !== false && savedPath ? {
    source: "venice-video",
    kind: "video",
    generated_at: new Date().toISOString(),
    cli_version: "1.0.0",
    model: MODEL_ID,
    model_key: "wan-2.6-flash",
    model_type: "image-to-video",
    prompt,
    negative_prompt: opts.negativePrompt,
    duration: opts.duration,
    resolution: opts.resolution,
    image_source: isHttpUrl(imageArg) ? imageArg : path.resolve(imageArg),
    audio_url: opts.audioUrl,
    queue_id: queueId,
  } : null;

  await publishOutputs(savedPath ? [savedPath] : [], metadataBlob, {
    sourceTag: "venice-video",
    modelTag: MODEL_ID,
    prompt,
    options: opts,
    smoke: SMOKE_MODE,
  });

  ui.footer([
    `queue ${queueId}`,
    `${opts.duration} · ${opts.resolution}`,
  ]);
};

run();
