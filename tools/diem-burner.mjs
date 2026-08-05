#!/usr/bin/env node

// diem-burner — spend the day's leftover Venice DIEM on artwork before it
// expires at the daily epoch (00:00 UTC), then drip a slice of the monthly
// USD credit balance the same way. Prompts come from the aiwdm library
// itself: a random selection over every item (image or video) with score
// >= 7 whose prompt text (metadata.prompt, else the description — for the
// Grok-export rows the description IS the original prompt) is longer than
// 40 chars, fetched from the aiwdm D1 via wrangler. If that query fails or
// returns nothing, falls back to random ~/prompts/*.txt files as before.
// Shells out to the `venice` CLI, which generates and auto-uploads to
// aiwdm. Runs nightly via the diem-burner.timer systemd user unit; secrets
// come from ~/.config/diem-burner/env (incl. CLOUDFLARE_API_TOKEN for the
// D1 query — the systemd unit doesn't read ~/.zshrc).
//
// The USD pool is Venice's monthly subscription credits (use-it-or-lose-it
// at the billing cycle). Each night spends balance ÷ days-until-cycle-reset,
// so the drip ramps up and empties the pool on the last night. The reset day
// isn't exposed by the API — the burner learns it by watching for the balance
// to jump up (the grant landing) and remembers it in the state file. Until a
// grant has been observed it falls back to balance/30. Overrides in the env
// file: USD_CYCLE_RESET_DAY (1-28, wins over the learned day) and
// USD_NIGHTLY_BUDGET (fixed nightly amount; 0 disables the USD phase).
//
// Usage: diem-burner.mjs [--dry-run] [--force] [--max-images N]
//   --dry-run     report balances, window verdict and planned picks; generate nothing
//   --force       skip the "close to epoch" window guard (manual runs)
//   --max-images  cap generations per pool this run (default 12 each)

import { readFile, writeFile, readdir, appendFile, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, ".config/diem-burner/env");
const PROMPTS_DIR = path.join(HOME, "prompts");
const LOG_FILE = path.join(HOME, ".local/share/diem-burner.jsonl");
const STATE_FILE = path.join(HOME, ".local/share/diem-burner-state.json");
const VENICE_BIN = path.join(HOME, ".npm-global/bin/venice");

const RATE_LIMITS_URL = "https://api.venice.ai/api/v1/api_keys/rate_limits";
const MODELS_URL = "https://api.venice.ai/api/v1/models?type=image";

// aiwdm prompt pool: query the library's D1 through the wrangler install in
// the aiwdm worker dir. Thresholds overridable via the env file.
const AIWDM_WORKER_DIR = path.join(HOME, "github/aiwdm/worker");
const WRANGLER_BIN = path.join(AIWDM_WORKER_DIR, "node_modules/.bin/wrangler");
const AIWDM_DB = "aiwdm-db";
const DEFAULT_MIN_SCORE = 7;
const DEFAULT_MIN_PROMPT_CHARS = 40;
const WRANGLER_TIMEOUT_MS = 60_000; // a hung query must not eat the burn window

// All gpt-image-2 (switched from seedream-v5-pro 2026-08-01), always at LOW
// quality (0.02 DIEM at 1K vs 0.26 at the model's default high) — Petter
// never found the higher tiers visibly better, and low stretches the budget.
const GPT_IMAGE = "gpt-image-2";
const GPT_QUALITY = "low";
// Aspect ratios to pull a random format from per image. Configurable via
// DIEM_BURNER_FORMATS in the env file (comma-separated, e.g. "2:3,3:2").
// gpt-image-2 is resolution-tier priced and IGNORES width/height — the tier
// is always pinned to 1K so it never bills a pricier default.
const DEFAULT_FORMATS = ["9:16"];
const RESOLUTION = "1K";

// Resolved in main() after the env file is loaded.
let FORMATS = DEFAULT_FORMATS;
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
  const usd = json?.data?.balances?.USD ?? 0;
  const nextEpoch = json?.data?.nextEpochBegins;
  if (typeof diem !== "number" || !nextEpoch) throw new Error("unexpected rate_limits response shape");
  return { diem, usd, nextEpoch: new Date(nextEpoch) };
}

// DIEM price of one gpt-image-2 generation at the settings we send (1K,
// low quality), from the live Venice catalog.
async function fetchImageCost() {
  const json = await veniceGet(MODELS_URL);
  const spec = (json?.data || []).find((m) => m.id === GPT_IMAGE);
  if (!spec) throw new Error(`model '${GPT_IMAGE}' not in the live Venice image catalog — refusing to run`);
  const diem = spec?.model_spec?.pricing?.quality?.[RESOLUTION]?.[GPT_QUALITY]?.diem;
  if (typeof diem !== "number") throw new Error(`no ${RESOLUTION} ${GPT_QUALITY} price for '${GPT_IMAGE}' in the live catalog — refusing to run`);
  return diem;
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

function shuffle(arr) {
  // Fisher–Yates; no repeats within a run until the pool is exhausted.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pool entries are { promptArg, label, source }: promptArg is what goes to
// `venice --prompt` (literal text for aiwdm rows, a file path for the
// fallback), label is for logs.
async function fetchAiwdmPrompts(minScore, minChars) {
  const sql = `SELECT ref, prompt, score FROM (
    SELECT 'i' || id AS ref, COALESCE(json_extract(metadata, '$.prompt'), description) AS prompt, score FROM images
    UNION ALL
    SELECT 'v' || id AS ref, COALESCE(json_extract(metadata, '$.prompt'), description) AS prompt, score FROM videos
  ) WHERE score >= ${minScore} AND prompt IS NOT NULL AND length(trim(prompt)) > ${minChars}`;

  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(WRANGLER_BIN, ["d1", "execute", AIWDM_DB, "--remote", "--json", "--command", sql], {
      cwd: AIWDM_WORKER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "", errOut = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`wrangler d1 execute timed out after ${WRANGLER_TIMEOUT_MS / 1000}s`));
    }, WRANGLER_TIMEOUT_MS);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`wrangler d1 execute exited ${code}: ${errOut.trim().slice(0, 300)}`));
    });
  });

  // wrangler --json prints a JSON array; tolerate any banner noise before it.
  const jsonStart = stdout.indexOf("[");
  if (jsonStart === -1) throw new Error("no JSON in wrangler output");
  const rows = JSON.parse(stdout.slice(jsonStart))?.[0]?.results ?? [];

  const seen = new Set();
  const entries = [];
  for (const r of rows) {
    const text = String(r.prompt).trim();
    if (seen.has(text)) continue; // near-duplicate uploads share descriptions
    seen.add(text);
    entries.push({ promptArg: text, label: `aiwdm:${r.ref} (score ${r.score})`, source: "aiwdm" });
  }
  return entries;
}

async function filePromptPool() {
  const files = await collectPromptFiles(PROMPTS_DIR);
  return files.map((f) => ({ promptArg: f, label: path.basename(f), source: "file" }));
}

// aiwdm first; the ~/prompts file pool only as fallback so a Cloudflare
// hiccup never kills an unattended burn night.
async function promptPool(minScore, minChars) {
  try {
    const entries = await fetchAiwdmPrompts(minScore, minChars);
    if (entries.length > 0) return shuffle(entries);
    log(`aiwdm pool empty (score >= ${minScore}, > ${minChars} chars) — falling back to ${PROMPTS_DIR}`);
  } catch (err) {
    log(`aiwdm prompt query failed (${err.message}) — falling back to ${PROMPTS_DIR}`);
  }
  return shuffle(await filePromptPool());
}

function runVenice(promptArg, format) {
  return new Promise((resolve) => {
    const cliArgs = ["--prompt", promptArg, "--model", GPT_IMAGE, "--format", format, "--resolution", RESOLUTION, "--quality", GPT_QUALITY, "--aiwdm-tags", "diem-burner"];
    const child = spawn(VENICE_BIN, cliArgs, {
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

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// A jump this big in the USD balance between runs means the monthly grant
// landed — remember today (UTC) as the cycle reset day.
const GRANT_JUMP_USD = 5;

// UTC days from now until the next occurrence of `resetDay` (1-28); at least
// 1 so tonight's slice never divides by zero on reset day itself.
function daysUntilReset(resetDay) {
  const now = new Date();
  const today = now.getUTCDate();
  let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), resetDay));
  if (today >= resetDay) next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, resetDay));
  return Math.max(1, Math.round((next - now) / 86_400_000));
}

const minutesUntil = (date) => (date.getTime() - Date.now()) / 60000;

// Spend `budget` of one pool ("DIEM" or "USD") on images. The pool name only
// affects logging and which balance field the post-image re-read tracks —
// Venice prices every model identically in both currencies. Returns the
// number of images generated.
async function burnPool({ pool, budget, imageCost, prompts, nextEpoch }) {
  const startBudget = budget;
  let images = 0;
  let consecutiveFailures = 0;
  let poolIdx = 0;
  // For USD the live balance is a month-scale pool, so the nightly slice is
  // tracked as budget minus the spend observed between balance reads.
  let lastUsd = null;
  if (pool === "USD" && !DRY_RUN) {
    try {
      lastUsd = (await fetchBalance()).usd;
    } catch (err) {
      log(`[USD] opening balance read failed (${err.message}) — using estimates only`);
    }
  }

  while (images < MAX_IMAGES) {
    if (budget < imageCost) {
      log(`[${pool}] budget ${budget.toFixed(4)} below one image (${imageCost}) — done`);
      break;
    }
    if (minutesUntil(nextEpoch) < CUTOFF_MINUTES) {
      log(`[${pool}] too close to the epoch to start another generation — done`);
      break;
    }

    const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
    const entry = prompts[poolIdx % prompts.length];
    poolIdx++;

    if (DRY_RUN) {
      log(`[${pool}] dry-run: would generate ${GPT_IMAGE} ${GPT_QUALITY} ${format} from ${entry.label} (est. ${imageCost}, budget ${budget.toFixed(4)})`);
      budget -= imageCost;
      images++;
      continue;
    }

    log(`[${pool}] image ${images + 1}/${MAX_IMAGES} · ${GPT_IMAGE} ${GPT_QUALITY} · ${format} · ${entry.label} · budget ${budget.toFixed(4)}`);
    const exitCode = await runVenice(entry.promptArg, format);

    // The real charge comes from re-reading the balance, not from the estimate.
    let after = budget - imageCost;
    try {
      const balances = await fetchBalance();
      if (pool === "DIEM") {
        after = balances.diem;
      } else if (lastUsd !== null) {
        after = budget - (lastUsd - balances.usd);
        lastUsd = balances.usd;
      }
    } catch (err) {
      log(`[${pool}] balance re-fetch failed (${err.message}) — falling back to estimate`);
    }

    await appendLog({
      ts: new Date().toISOString(),
      pool,
      prompt_source: entry.source,
      prompt_ref: entry.label,
      prompt_excerpt: entry.source === "aiwdm" ? entry.promptArg.slice(0, 120) : undefined,
      model: GPT_IMAGE,
      quality: GPT_QUALITY,
      format,
      budget_before: Number(budget.toFixed(4)),
      budget_after: Number(after.toFixed(4)),
      exit_code: exitCode,
    });

    if (exitCode === 2) {
      // venice exit 2 = prompt blocked by moderation — skip this prompt, but
      // it's not an infrastructure failure, so don't count it toward abort.
      log(`[${pool}] prompt blocked by Venice moderation — skipping ${entry.label}`);
      consecutiveFailures = 0;
    } else if (exitCode !== 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) {
        console.error(`[diem-burner] [${pool}] two consecutive venice failures — aborting`);
        process.exit(1);
      }
    } else {
      consecutiveFailures = 0;
      images++;
    }
    budget = after;
  }

  log(`[${pool}] phase complete · ${images} image(s) · ${(startBudget - budget).toFixed(4)} spent`);
  return images;
}

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

  const { diem, usd, nextEpoch } = await fetchBalance();
  const untilEpoch = minutesUntil(nextEpoch);
  log(`DIEM balance ${diem.toFixed(4)} · USD balance ${usd.toFixed(4)} · epoch resets in ${Math.round(untilEpoch)} min (${nextEpoch.toISOString()})`);

  if (!FORCE && untilEpoch > WINDOW_MINUTES) {
    log(`more than ${WINDOW_MINUTES} min until the epoch — not the burn window, exiting (use --force to override)`);
    return;
  }

  const imageCost = await fetchImageCost();
  log(`live pricing · ${GPT_IMAGE} ${imageCost} DIEM (${RESOLUTION} ${GPT_QUALITY})`);

  const minScore = Number(process.env.AIWDM_MIN_SCORE) >= 1 ? Number(process.env.AIWDM_MIN_SCORE) : DEFAULT_MIN_SCORE;
  const minChars = Number(process.env.AIWDM_MIN_PROMPT_CHARS) >= 1 ? Number(process.env.AIWDM_MIN_PROMPT_CHARS) : DEFAULT_MIN_PROMPT_CHARS;

  const prompts = await promptPool(minScore, minChars);
  if (prompts.length === 0) {
    console.error(`[diem-burner] no prompts: aiwdm pool unavailable and no .txt files in ${PROMPTS_DIR}`);
    process.exit(1);
  }
  log(`${prompts.length} prompt(s) in the pool (source: ${prompts[0].source})`);

  const diemImages = await burnPool({ pool: "DIEM", budget: diem, imageCost, prompts, nextEpoch });

  // Learn the billing-cycle reset day by spotting the monthly grant landing
  // (USD balance jumped up since the last run).
  const state = await readState();
  if (typeof state.last_usd === "number" && usd > state.last_usd + GRANT_JUMP_USD) {
    state.usd_cycle_reset_day = new Date().getUTCDate();
    log(`USD balance jumped ${state.last_usd.toFixed(2)} → ${usd.toFixed(2)} — monthly grant detected, cycle reset day learned: ${state.usd_cycle_reset_day}`);
  }

  let resetDay = null;
  if (process.env.USD_CYCLE_RESET_DAY !== undefined) {
    const parsed = Number(process.env.USD_CYCLE_RESET_DAY);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 28) resetDay = parsed;
    else log(`ignoring invalid USD_CYCLE_RESET_DAY '${process.env.USD_CYCLE_RESET_DAY}'`);
  }
  if (resetDay === null && Number.isInteger(state.usd_cycle_reset_day)) resetDay = state.usd_cycle_reset_day;

  // Slice: balance ÷ days-until-reset drains the pool exactly at the cycle
  // boundary; ÷30 is the steady fallback until the reset day is known.
  let usdBudget, sliceNote;
  if (resetDay !== null) {
    const days = daysUntilReset(resetDay);
    usdBudget = usd / days;
    sliceNote = `balance/${days} day(s) to reset on the ${resetDay}th`;
  } else {
    usdBudget = usd / 30;
    sliceNote = "balance/30, reset day not yet known";
  }
  if (process.env.USD_NIGHTLY_BUDGET !== undefined) {
    const parsed = Number(process.env.USD_NIGHTLY_BUDGET);
    if (Number.isFinite(parsed) && parsed >= 0) {
      usdBudget = Math.min(parsed, usd);
      sliceNote = "from USD_NIGHTLY_BUDGET";
    } else log(`ignoring invalid USD_NIGHTLY_BUDGET '${process.env.USD_NIGHTLY_BUDGET}'`);
  }
  log(`USD nightly slice ${usdBudget.toFixed(4)} (balance ${usd.toFixed(4)}, ${sliceNote})`);

  let usdImages = 0;
  if (usdBudget > 0) {
    usdImages = await burnPool({ pool: "USD", budget: usdBudget, imageCost, prompts: shuffle([...prompts]), nextEpoch });
  }

  if (!DRY_RUN) {
    try {
      state.last_usd = (await fetchBalance()).usd;
    } catch {
      state.last_usd = usd; // pre-run reading — still good enough for grant detection
    }
    await writeState(state);
  }

  log(`run complete · ${diemImages} DIEM image(s) + ${usdImages} USD image(s)`);
}

main().catch((err) => {
  console.error(`[diem-burner] fatal: ${err.message}`);
  process.exit(1);
});
