#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const SOURCES = {
  "venice":       { bin: "venice",       script: "venice/index.js" },
  "venice-video": { bin: "venice-video", script: "venice/video.js" },
  "wavespeed":    { bin: "wave",         script: "wavespeed/index.js" },
  "xai":          { bin: "imagine",      script: "xai/index.js" },
};

const MEDIA_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".webm"]);

const resolveSidecarPath = async (input) => {
  const ext = path.extname(input).toLowerCase();
  if (ext === ".json") return path.resolve(input);
  if (MEDIA_EXTS.has(ext)) {
    const parsed = path.parse(path.resolve(input));
    return path.join(parsed.dir, `${parsed.name}.json`);
  }
  // No extension or unknown — try .json first, then assume it's already correct.
  const candidate = path.resolve(input);
  try {
    await fs.access(`${candidate}.json`);
    return `${candidate}.json`;
  } catch {
    return candidate;
  }
};

const push = (args, flag, value) => {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && value.length === 0) return;
  args.push(flag, String(value));
};

const buildVeniceArgs = (m) => {
  const args = [];
  push(args, "--model", m.model_key || m.model);
  push(args, "--prompt", m.prompt);
  push(args, "--negative-prompt", m.negative_prompt);
  push(args, "--width", m.width);
  push(args, "--height", m.height);
  push(args, "--steps", m.steps);
  push(args, "--cfg-scale", m.cfg_scale);
  push(args, "--seed", m.seed);
  push(args, "--lora", m.style_preset);
  push(args, "--lora-strength", m.lora_strength);
  push(args, "--output-format", m.output_format);
  // Legacy sidecar fields (variants, hide_watermark) are ignored: the flags
  // were removed — hide_watermark is always on, variants never worked.
  return args;
};

const buildVeniceVideoArgs = (m) => {
  const args = [];
  push(args, "--model", m.model_key || m.model);
  push(args, "--prompt", m.prompt);
  push(args, "--negative-prompt", m.negative_prompt);
  push(args, "--duration", m.duration);
  push(args, "--resolution", m.resolution);
  push(args, "--aspect-ratio", m.aspect_ratio);
  push(args, "--seed", m.seed);
  push(args, "--image-url", m.image_url);
  push(args, "--video-url", m.video_url);
  push(args, "--audio-url", m.audio_url);
  if (Array.isArray(m.reference_image_urls) && m.reference_image_urls.length) {
    args.push("--reference-images", ...m.reference_image_urls);
  }
  return args;
};

const buildXaiArgs = (m) => {
  const args = [];
  push(args, "--model", m.model_key || m.model);
  push(args, "--prompt", m.prompt);
  push(args, "--n", m.n);
  push(args, "--aspect-ratio", m.aspect_ratio);
  push(args, "--resolution", m.resolution);
  return args;
};

const buildWavespeedArgs = (m) => {
  const args = [];
  push(args, "--model", m.model_key || m.model);
  // Use the prompt actually sent to the API (post-optimization), not original_prompt.
  // The optimizer is non-deterministic, so re-running it would diverge from the saved output.
  push(args, "--prompt", m.prompt);
  push(args, "--negative-prompt", m.negative_prompt);
  if (m.kind !== "video") push(args, "--format", m.size);
  push(args, "--aspect-ratio", m.aspect_ratio);
  push(args, "--resolution", m.resolution);
  push(args, "--duration", m.duration);
  push(args, "--audio", m.audio);
  push(args, "--output-format", m.output_format);
  push(args, "--quality", m.quality);
  // Legacy num_images (Kling per-request batch) has no flag anymore; --count covers repeats.
  push(args, "--seed", m.seed);
  if (m.enable_prompt_expansion === true) args.push("--prompt-expansion");
  if (Array.isArray(m.input_images) && m.input_images.length) {
    args.push("--images", ...m.input_images);
  }
  return args;
};

const reconstruct = (metadata) => {
  const target = SOURCES[metadata.source];
  if (!target) {
    throw new Error(`Unknown sidecar source: ${metadata.source}`);
  }
  let args;
  switch (metadata.source) {
    case "venice":       args = buildVeniceArgs(metadata); break;
    case "venice-video": args = buildVeniceVideoArgs(metadata); break;
    case "wavespeed":    args = buildWavespeedArgs(metadata); break;
    case "xai":          args = buildXaiArgs(metadata); break;
  }
  return { target, args };
};

// POSIX shell single-quote, with embedded single-quotes encoded as '\''.
const shellQuote = (s) => {
  if (/^[A-Za-z0-9_\-.,:/=@%+]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
};

const main = async () => {
  const program = new Command();
  program
    .name("wave-replay")
    .version("1.0.0")
    .description("Reconstruct the wave-cli command that produced a metadata sidecar.")
    .argument("<file>", "Path to a .json sidecar or a media file with one alongside it.")
    .option("--exec", "Run the reconstructed command instead of printing it.")
    .option("--debug", "Print the parsed sidecar before the command.")
    .helpOption("-h, --help", "Display this help message.")
    .addHelpText("after", `
Examples:
  wave-replay images/venice/venice_1730000000.json
  wave-replay images/venice/venice_1730000000.png       # auto-finds paired .json
  wave-replay videos/venice/venice_<id>.mp4 --exec      # actually re-run it
  wave-replay output.json | sh                          # equivalent to --exec

Notes:
  - Wavespeed sidecars with --optimize replay using the post-optimization prompt
    (the optimizer is non-deterministic, so re-optimizing would diverge).
  - --exec runs the matching wave-cli script from this install; required env vars
    (VENICE_API_TOKEN / WAVESPEED_KEY) must be set.
`);

  program.parse(process.argv);
  const opts = program.opts();
  const [inputArg] = program.args;

  const sidecarPath = await resolveSidecarPath(inputArg);

  let metadata;
  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    metadata = JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read sidecar at ${sidecarPath}: ${error.message}`);
    process.exit(1);
  }

  if (opts.debug) {
    console.error(`# sidecar: ${sidecarPath}`);
    console.error(`# parsed:  ${JSON.stringify(metadata)}`);
  }

  let target, args;
  try {
    ({ target, args } = reconstruct(metadata));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (opts.exec) {
    const scriptPath = path.join(repoRoot, target.script);
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
    child.on("error", (err) => {
      console.error(`Failed to exec ${target.bin}: ${err.message}`);
      process.exit(1);
    });
    child.on("close", (code) => process.exit(code ?? 0));
  } else {
    const printed = [target.bin, ...args.map(shellQuote)].join(" ");
    console.log(printed);
  }
};

main();
