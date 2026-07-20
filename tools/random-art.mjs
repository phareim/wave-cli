#!/usr/bin/env node

// random-art — generate one artwork from a random prompt file in ~/prompts,
// the same pool the diem-burner draws from (all subfolders except old/,
// short/, images/). Venice is the default provider with seedream-v5-pro
// pinned at 1K — the burner's economics; gpt-image-2 runs at low quality.
//
// Usage: random-art [--wave] [--gpt] [--format <f>] [--dry-run]
//   --wave      generate via the WaveSpeed CLI instead of Venice
//   --gpt       use gpt-image-2 instead of seedream-v5-pro
//   --format    aspect ratio / named size (default: DIEM_BURNER_FORMATS, else 9:16)
//   --dry-run   print the pick and the command without generating

import { readFile, readdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, ".config/diem-burner/env");
const PROMPTS_DIR = path.join(HOME, "prompts");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEEDREAM = "seedream-v5-pro";
const GPT_IMAGE = "gpt-image-2";
const DEFAULT_FORMATS = ["9:16"];

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`random-art [--wave] [--gpt] [--format <f>] [--dry-run]

Picks a random prompt file from ~/prompts (diem-burner pool) and generates
one image. Venice + ${SEEDREAM} at 1K by default; --gpt switches to
${GPT_IMAGE} (low quality), --wave routes through the WaveSpeed CLI.
Format defaults to DIEM_BURNER_FORMATS from ${ENV_FILE} (currently 9:16).`);
  process.exit(0);
}
const USE_WAVE = args.includes("--wave");
const USE_GPT = args.includes("--gpt");
const DRY_RUN = args.includes("--dry-run");
const fmtIdx = args.indexOf("--format");
const FORMAT_ARG = fmtIdx !== -1 ? args[fmtIdx + 1] : null;

const log = (msg) => console.log(`[random-art] ${msg}`);

// KEY=value env file; never overrides vars already in the environment.
async function loadEnvFile(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

// Same pool rules as diem-burner: recursive, .txt only, skip the archive,
// output dump, shorts and repo plumbing.
const EXCLUDED_DIRS = new Set(["old", "short", "images", "node_modules"]);

async function collectPromptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUDED_DIRS.has(e.name)) files.push(...(await collectPromptFiles(full)));
    } else if (e.isFile() && e.name.endsWith(".txt")) {
      files.push(full);
    }
  }
  return files;
}

function run(cliPath, cliArgs, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...cliArgs], {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`[random-art] failed to spawn ${cliPath}: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  await loadEnvFile(ENV_FILE);

  let format = FORMAT_ARG;
  if (!format) {
    const formats = (process.env.DIEM_BURNER_FORMATS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const pool = formats.length > 0 ? formats : DEFAULT_FORMATS;
    format = pool[Math.floor(Math.random() * pool.length)];
  }

  const files = await collectPromptFiles(PROMPTS_DIR);
  if (files.length === 0) {
    console.error(`[random-art] no .txt prompt files found in ${PROMPTS_DIR}`);
    process.exit(1);
  }
  const promptFile = files[Math.floor(Math.random() * files.length)];

  const model = USE_GPT ? GPT_IMAGE : SEEDREAM;
  const provider = USE_WAVE ? "wave" : "venice";
  log(`${provider} · ${model} · ${format} · ${path.relative(PROMPTS_DIR, promptFile)} (pool of ${files.length})`);

  let cliPath, cliArgs, extraEnv;
  if (USE_WAVE) {
    cliPath = path.join(REPO_ROOT, "wavespeed/index.js");
    cliArgs = ["--prompt", promptFile, "--model", model, "--format", format, "--resolution", "1k", "--aiwdm-tags", "random-art"];
    extraEnv = {};
  } else {
    cliPath = path.join(REPO_ROOT, "venice/index.js");
    cliArgs = ["--prompt", promptFile, "--model", model, "--format", format, "--resolution", "1K", "--aiwdm-tags", "random-art"];
    if (USE_GPT) cliArgs.push("--quality", "low");
    extraEnv = { VENICE_PATH: process.env.VENICE_PATH || path.join(HOME, "ai-art/venice/images") };
  }

  if (DRY_RUN) {
    log(`dry-run: ${cliPath} ${cliArgs.join(" ")}`);
    return;
  }

  process.exit(await run(cliPath, cliArgs, extraEnv));
}

main().catch((err) => {
  console.error(`[random-art] fatal: ${err.message}`);
  process.exit(1);
});
