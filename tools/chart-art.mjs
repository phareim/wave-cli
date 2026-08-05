#!/usr/bin/env node

// chart-art — generate artwork from Civitai's top-reacted prompts. Fetches
// the "Most Reactions" chart from the public Civitai API (lib/civitai.js),
// strips Stable Diffusion syntax from each prompt, then spawns the in-repo
// venice/wavespeed CLI once per generation — the same thin-dispatcher shape
// as random-art. Civitai's nsfwLevel maps to the aiwdm rating (None→PG,
// Soft→PG13, Mature/X→R).
//
// Test seams: CHART_ART_FIXTURE replaces the API fetch with a JSON file,
// CHART_ART_CHILD replaces the spawned child script.

import { spawn } from "child_process";
import path from "path";
import os from "os";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import { Command, InvalidArgumentError } from "commander";
import * as ui from "../lib/ui.js";
import { c, truncate, fmtDuration } from "../lib/ui.js";
import { parseFormat, NAMED_RATIOS } from "../lib/format.js";
import { loadEnvFile, shuffle } from "../lib/prompt-pool.js";
import { fetchChart, aiwdmRatingFor, PERIODS, NSFW_LEVELS } from "../lib/civitai.js";
import { rewriteAsNaturalLanguage } from "../lib/prompts.js";

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, ".config/diem-burner/env");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEEDREAM = "seedream-v5-pro";
const GPT_IMAGE = "gpt-image-2";
const DEFAULT_FORMATS = ["9:16"];
const PICKER_ROWS = 20;

const parsePositiveInt = (value) => {
  if (!/^\d+$/.test(value.trim()) || parseInt(value, 10) < 1) {
    throw new InvalidArgumentError("expected a positive integer.");
  }
  return parseInt(value, 10);
};

const parseNonNegativeInt = (value) => {
  if (!/^\d+$/.test(value.trim())) {
    throw new InvalidArgumentError("expected a non-negative integer.");
  }
  return parseInt(value, 10);
};

const program = new Command();
program
  .name("chart-art")
  .version("1.0.0")
  .description(
    `Generate artwork from Civitai's top-reacted prompts. Fetches the "Most
Reactions" chart (SFW by default), strips SD tag syntax, and generates via
Venice + ${SEEDREAM} at 1K (random-art's economics).`,
  )
  .option("--period <p>", `chart window: ${Object.keys(PERIODS).join(", ")}`, "week")
  .option("--nsfw <level>", `include NSFW charts: ${Object.keys(NSFW_LEVELS).join(", ")} (default: SFW only)`)
  .option("--min-likes <n>", "only prompts from images with at least this many likes", parseNonNegativeInt, 0)
  .option("--limit <n>", "chart entries to fetch (API max 200)", parsePositiveInt, 100)
  .option("-i, --interactive", `pick the prompt from the top ${PICKER_ROWS} instead of at random`)
  .option("--count <n>", "artworks to generate (random mode); fresh prompt + format each", parsePositiveInt, 1)
  .option("--rewrite", "rewrite the stripped prompt into natural language via Venice chat")
  .option("--wave", "generate via the WaveSpeed CLI instead of Venice")
  .option("--gpt", `use ${GPT_IMAGE} (low quality) instead of ${SEEDREAM}`)
  .option(
    "--format <f>",
    `named size (${Object.keys(NAMED_RATIOS).join(", ")}), "W:H" ratio, or "WxH" pixels (default: random pick from DIEM_BURNER_FORMATS, else ${DEFAULT_FORMATS[0]})`,
  )
  .option("--list", "print the fetched chart and exit")
  .option("--dry-run", "print the pick(s) and resolved command(s); generate nothing")
  .helpOption("-h, --help", "display help")
  .addHelpText(
    "after",
    `
Examples:
  chart-art                          one image from a random top-of-the-week prompt
  chart-art -i                       pick the prompt yourself from the top ${PICKER_ROWS}
  chart-art --period day --count 3   three images from today's chart
  chart-art --rewrite --gpt          natural-language rewrite, gpt-image-2 low
  chart-art --nsfw mature --list     inspect the Mature chart, generate nothing

Exit codes: 0 ok · 1 failure · 2 prompt blocked by Venice moderation
(single run; with --count > 1 moderation skips do not fail the batch)`,
  );

program.parse(process.argv);
const opts = program.opts();

function validateFormatArg(value) {
  const f = parseFormat(value);
  if (f?.type === "named" && !NAMED_RATIOS[f.name]) {
    ui.err(
      `unknown named format '${value}' — valid names: ${Object.keys(NAMED_RATIOS).join(", ")} (or a "W:H" ratio / "WxH" pixels)`,
    );
    process.exit(1);
  }
}

function run(cliPath, cliArgs, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...cliArgs], {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (spawnErr) => {
      ui.err(`failed to spawn ${cliPath}: ${spawnErr.message}`);
      resolve(1);
    });
  });
}

const reactions = (e) => `${e.likes}♥${e.hearts}`;

function chartLine(e, index) {
  const num = c.bold(String(index + 1).padStart(2));
  const stats = c.cyan(reactions(e).padEnd(10));
  const level = c.yellow(e.nsfwLevel.padEnd(6));
  const model = c.dim((e.baseModel || "?").slice(0, 14).padEnd(14));
  return `${num}  ${stats} ${level} ${model} ${truncate(e.prompt, 100)}`;
}

async function pickInteractively(entries) {
  const top = entries.slice(0, PICKER_ROWS);
  console.log(c.dim(`     ${"likes♥hearts".padEnd(10)} ${"nsfw".padEnd(6)} ${"base model".padEnd(14)} prompt`));
  top.forEach((e, i) => console.log(chartLine(e, i)));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${c.magenta("?")} pick a prompt [1-${top.length}]: `)).trim();
    const n = parseInt(answer, 10);
    if (!/^\d+$/.test(answer) || n < 1 || n > top.length) {
      ui.err(`invalid pick '${answer}'`);
      process.exit(1);
    }
    return top[n - 1];
  } finally {
    rl.close();
  }
}

async function main() {
  if (opts.format) validateFormatArg(opts.format);
  if (!PERIODS[opts.period]) {
    ui.err(`unknown --period '${opts.period}' — valid: ${Object.keys(PERIODS).join(", ")}`);
    process.exit(1);
  }
  if (opts.nsfw && !NSFW_LEVELS[opts.nsfw]) {
    ui.err(`unknown --nsfw '${opts.nsfw}' — valid: ${Object.keys(NSFW_LEVELS).join(", ")}`);
    process.exit(1);
  }
  await loadEnvFile(ENV_FILE);

  const formatPool = (process.env.DIEM_BURNER_FORMATS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const formats = formatPool.length > 0 ? formatPool : DEFAULT_FORMATS;

  let entries;
  try {
    entries = await fetchChart({ period: opts.period, nsfw: opts.nsfw, limit: opts.limit });
  } catch (fetchErr) {
    ui.err(`Civitai chart fetch failed: ${fetchErr.message}`);
    process.exit(1);
  }
  if (opts.minLikes > 0) entries = entries.filter((e) => e.likes >= opts.minLikes);
  if (entries.length === 0) {
    ui.err(
      `no usable prompts on the ${opts.period} chart (nsfw: ${opts.nsfw || "SFW"}, min likes ${opts.minLikes}) — prompts must be > 40 chars after SD-syntax stripping`,
    );
    process.exit(1);
  }

  if (opts.list) {
    console.log(
      `${c.cyan("▶")} ${c.bold(`civitai · ${opts.period} · ${opts.nsfw || "SFW"}`)} ${c.dim(`· ${entries.length} prompt${entries.length === 1 ? "" : "s"}`)}`,
    );
    console.log(c.dim(`     ${"likes♥hearts".padEnd(10)} ${"nsfw".padEnd(6)} ${"base model".padEnd(14)} prompt`));
    entries.forEach((e, i) => console.log(chartLine(e, i)));
    return;
  }

  // Preflight the route's API key before spawning anything (the child would
  // also catch this, but N images deep into a batch is the wrong place).
  const skipPreflight =
    opts.dryRun ||
    process.env.CHART_ART_CHILD ||
    (opts.wave ? process.env.WAVESPEED_SMOKE_TEST : process.env.VENICE_SMOKE_TEST);
  if (!skipPreflight) {
    const keyName = opts.wave ? "WAVESPEED_KEY" : "VENICE_API_TOKEN";
    if (!process.env[keyName]) {
      ui.err(`${keyName} is not set (checked the environment and ${ENV_FILE})`);
      process.exit(1);
    }
  }

  let picked = null;
  let pool = null;
  let count = opts.count;
  if (opts.interactive) {
    picked = await pickInteractively(entries);
    if (opts.count > 1) ui.warn("--count is ignored in interactive mode (single pick)");
    count = 1;
  } else {
    pool = shuffle([...entries]);
  }

  const model = opts.gpt ? GPT_IMAGE : SEEDREAM;
  const started = Date.now();
  let poolIdx = 0;
  let generated = 0;
  let blocked = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    let entry;
    if (picked) {
      entry = picked;
    } else {
      // Shuffle-without-replacement: no repeats until the chart is exhausted.
      if (poolIdx >= pool.length) {
        shuffle(pool);
        poolIdx = 0;
      }
      entry = pool[poolIdx++];
    }
    const format = opts.format || formats[Math.floor(Math.random() * formats.length)];
    const rating = aiwdmRatingFor(entry.nsfwLevel);

    if (count > 1) ui.roundHeader("generation", i + 1, count);
    const poolNote = i === 0 && pool ? ` · chart of ${pool.length}` : "";
    console.log(
      `${c.magenta("⚄")} ${c.bold(`civitai:${entry.id}`)} ${c.dim(`· ${reactions(entry)} · ${entry.nsfwLevel}→${rating} · ${format}${poolNote}`)}`,
    );
    console.log(`  ${c.dim(`"${truncate(entry.prompt, 100)}"`)}`);

    let prompt = entry.prompt;
    if (opts.rewrite) {
      if (opts.dryRun) {
        ui.info("  dry-run: would rewrite into natural language via Venice chat");
      } else {
        const spin = ui.spinner("rewriting");
        try {
          prompt = await rewriteAsNaturalLanguage({ prompt, rating });
          spin.succeed(truncate(prompt, 100));
        } catch (rewriteErr) {
          spin.fail(`rewrite failed (${rewriteErr.message}) — using the stripped prompt`);
        }
      }
    }

    let cliPath, cliArgs, extraEnv;
    if (opts.wave) {
      cliPath = path.join(REPO_ROOT, "wavespeed/index.js");
      // wave takes lowercase resolution tiers; venice upper-cases. Load-bearing.
      cliArgs = ["--prompt", prompt, "--model", model, "--format", format, "--resolution", "1k", "--aiwdm-tags", "chart-art", "--aiwdm-rating", rating];
      extraEnv = {};
    } else {
      cliPath = path.join(REPO_ROOT, "venice/index.js");
      cliArgs = ["--prompt", prompt, "--model", model, "--format", format, "--resolution", "1K", "--aiwdm-tags", "chart-art", "--aiwdm-rating", rating];
      if (opts.gpt) cliArgs.push("--quality", "low");
      extraEnv = { VENICE_PATH: process.env.VENICE_PATH || path.join(HOME, "ai-art/venice/images") };
    }

    if (opts.dryRun) {
      ui.info(`  dry-run: node ${cliPath} ${cliArgs.map((a) => (a.includes(" ") ? JSON.stringify(truncate(a, 80)) : a)).join(" ")}`);
      continue;
    }

    const code = await run(process.env.CHART_ART_CHILD || cliPath, cliArgs, extraEnv);
    if (count === 1) process.exit(code);
    if (code === 0) {
      generated++;
    } else if (code === 2) {
      ui.warn("prompt blocked by Venice moderation — skipped");
      blocked++;
    } else {
      ui.err(`generation exited ${code} — continuing`);
      failed++;
    }
  }

  if (count > 1 && !opts.dryRun) {
    ui.footer([
      `${generated} generated`,
      `${blocked} blocked`,
      `${failed} failed`,
      fmtDuration(Date.now() - started),
    ]);
    process.exitCode = failed > 0 ? 1 : 0;
  }
}

main().catch((err) => {
  ui.err(`fatal: ${err.message}`);
  process.exit(1);
});
