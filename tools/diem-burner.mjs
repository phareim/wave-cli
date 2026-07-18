#!/usr/bin/env node

// diem-burner — spend the day's leftover Venice DIEM on artwork before it
// expires at the daily epoch (00:00 UTC). Picks random prompt files from
// ~/prompts/*.txt and shells out to the `venice` CLI, which generates and
// auto-uploads to aiwdm. Runs nightly via the diem-burner.timer systemd
// user unit; secrets come from ~/.config/diem-burner/env.
//
// Usage: diem-burner.mjs [--dry-run] [--force] [--max-images N]
//   --dry-run     report balance, window verdict and planned picks; generate nothing
//   --force       skip the "close to epoch" window guard (manual runs)
//   --max-images  cap generations this run (default 12)

import { readFile, readdir, appendFile, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, ".config/diem-burner/env");
const PROMPTS_DIR = path.join(HOME, "prompts");
const LOG_FILE = path.join(HOME, ".local/share/diem-burner.jsonl");
const VENICE_BIN = path.join(HOME, ".npm-global/bin/venice");

const RATE_LIMITS_URL = "https://api.venice.ai/api/v1/api_keys/rate_limits";
const MODELS_URL = "https://api.venice.ai/api/v1/models?type=image";

// Seedream-heavy mix: gpt-image-2 at most once per run, and only when the
// leftover budget comfortably covers its ~0.27 DIEM 1K price.
const SEEDREAM = "seedream-v5-pro";
const GPT_IMAGE = "gpt-image-2";
// Aspect ratios to pull a random format from per image. Configurable via
// DIEM_BURNER_FORMATS in the env file (comma-separated, e.g. "2:3,3:2").
// Both target models are resolution-tier priced and IGNORE width/height —
// without an explicit `--resolution 1K` seedream-v5-pro bills its 2K default
// (0.11 observed vs 0.06 at 1K), so the tier is always pinned.
const DEFAULT_FORMATS = ["9:16"];
const RESOLUTION = "1K";

// Resolved in main() after the env file is loaded.
let FORMATS = DEFAULT_FORMATS;
const GPT_THRESHOLD = 0.35;
const WINDOW_MINUTES = 100; // only run this close to the DIEM epoch
const CUTOFF_MINUTES = 5;   // stop starting new generations this close to it
const DEFAULT_MAX_IMAGES = 12;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const maxIdx = args.indexOf("--max-images");
const MAX_IMAGES = maxIdx !== -1 ? Math.max(1, parseInt(args[maxIdx + 1], 10) || DEFAULT_MAX_IMAGES) : DEFAULT_MAX_IMAGES;

const log = (msg) => console.log(`[diem-burner] ${msg}`);

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

async function veniceGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.VENICE_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchBalance() {
  const json = await veniceGet(RATE_LIMITS_URL);
  const diem = json?.data?.balances?.DIEM;
  const nextEpoch = json?.data?.nextEpochBegins;
  if (typeof diem !== "number" || !nextEpoch) throw new Error("unexpected rate_limits response shape");
  return { diem, nextEpoch: new Date(nextEpoch) };
}

// DIEM price of one generation at default settings (1K where tiered).
function modelCost(spec) {
  const pricing = spec?.model_spec?.pricing;
  return pricing?.generation?.diem ?? pricing?.resolutions?.["1K"]?.diem ?? null;
}

async function fetchModelCosts() {
  const json = await veniceGet(MODELS_URL);
  const costs = {};
  for (const m of json?.data || []) {
    const cost = modelCost(m);
    if (cost !== null) costs[m.id] = cost;
  }
  for (const id of [SEEDREAM, GPT_IMAGE]) {
    if (!(id in costs)) throw new Error(`model '${id}' not in the live Venice image catalog — refusing to run`);
  }
  return costs;
}

// Directories that never hold usable prompts: the archive, the output dump,
// the shorts, and repo plumbing.
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

async function promptPool() {
  const files = await collectPromptFiles(PROMPTS_DIR);
  // Fisher–Yates; no repeats within a run until the pool is exhausted.
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
  return files;
}

function runVenice(promptFile, model, format) {
  return new Promise((resolve) => {
    const child = spawn(VENICE_BIN, ["--prompt", promptFile, "--model", model, "--format", format, "--resolution", RESOLUTION, "--aiwdm-tags", "diem-burner"], {
      stdio: "inherit",
      env: {
        ...process.env,
        VENICE_PATH: process.env.VENICE_PATH || path.join(HOME, "ai-art/venice/images"),
      },
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`[diem-burner] failed to spawn venice: ${err.message}`);
      resolve(1);
    });
  });
}

async function appendLog(entry) {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n");
}

const minutesUntil = (date) => (date.getTime() - Date.now()) / 60000;

async function main() {
  await loadEnvFile(ENV_FILE);
  if (!process.env.VENICE_API_TOKEN) {
    console.error(`[diem-burner] VENICE_API_TOKEN is not set (checked env and ${ENV_FILE})`);
    process.exit(1);
  }

  if (process.env.DIEM_BURNER_FORMATS) {
    const parsed = process.env.DIEM_BURNER_FORMATS.split(",").map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) FORMATS = parsed;
  }
  log(`formats: ${FORMATS.join(", ")} · resolution ${RESOLUTION}`);

  const { diem, nextEpoch } = await fetchBalance();
  const untilEpoch = minutesUntil(nextEpoch);
  log(`DIEM balance ${diem.toFixed(4)} · epoch resets in ${Math.round(untilEpoch)} min (${nextEpoch.toISOString()})`);

  if (!FORCE && untilEpoch > WINDOW_MINUTES) {
    log(`more than ${WINDOW_MINUTES} min until the epoch — not the burn window, exiting (use --force to override)`);
    return;
  }

  const costs = await fetchModelCosts();
  const seedreamCost = costs[SEEDREAM];
  const gptCost = costs[GPT_IMAGE];
  log(`live pricing · ${SEEDREAM} ${seedreamCost} DIEM · ${GPT_IMAGE} ~${gptCost} DIEM (1K)`);

  const pool = await promptPool();
  if (pool.length === 0) {
    console.error(`[diem-burner] no .txt prompt files found in ${PROMPTS_DIR}`);
    process.exit(1);
  }
  log(`${pool.length} prompt files in the pool`);

  let budget = diem;
  let images = 0;
  let gptUsed = false;
  let consecutiveFailures = 0;
  let poolIdx = 0;

  while (images < MAX_IMAGES) {
    if (budget < seedreamCost) {
      log(`budget ${budget.toFixed(4)} below ${SEEDREAM} cost ${seedreamCost} — done`);
      break;
    }
    if (minutesUntil(nextEpoch) < CUTOFF_MINUTES) {
      log("too close to the epoch to start another generation — done");
      break;
    }

    const model = !gptUsed && budget >= GPT_THRESHOLD ? GPT_IMAGE : SEEDREAM;
    const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
    const promptFile = pool[poolIdx % pool.length];
    poolIdx++;

    if (DRY_RUN) {
      log(`dry-run: would generate ${model} ${format} from ${path.basename(promptFile)} (est. ${costs[model]} DIEM, budget ${budget.toFixed(4)})`);
      budget -= costs[model];
      if (model === GPT_IMAGE) gptUsed = true;
      images++;
      continue;
    }

    log(`image ${images + 1}/${MAX_IMAGES} · ${model} · ${format} · ${path.basename(promptFile)} · budget ${budget.toFixed(4)}`);
    const exitCode = await runVenice(promptFile, model, format);
    if (model === GPT_IMAGE) gptUsed = true;

    // The real charge (gpt-image quality tiers vary) comes from re-reading
    // the balance, not from the estimate.
    let after = budget - costs[model];
    try {
      after = (await fetchBalance()).diem;
    } catch (err) {
      log(`balance re-fetch failed (${err.message}) — falling back to estimate`);
    }

    await appendLog({
      ts: new Date().toISOString(),
      prompt_file: promptFile,
      model,
      format,
      diem_before: Number(budget.toFixed(4)),
      diem_after: Number(after.toFixed(4)),
      exit_code: exitCode,
    });

    if (exitCode !== 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) {
        console.error("[diem-burner] two consecutive venice failures — aborting");
        process.exit(1);
      }
    } else {
      consecutiveFailures = 0;
      images++;
    }
    budget = after;
  }

  log(`run complete · ${images} image(s) · ${(diem - budget).toFixed(4)} DIEM spent · ${budget.toFixed(4)} left`);
}

main().catch((err) => {
  console.error(`[diem-burner] fatal: ${err.message}`);
  process.exit(1);
});
