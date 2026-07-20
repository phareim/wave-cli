#!/usr/bin/env node

// random-art — generate artwork from random prompt files in ~/prompts,
// the same pool the diem-burner draws from (all subfolders except old/,
// short/, images/). Venice is the default provider with seedream-v5-pro
// pinned at 1K — the burner's economics; gpt-image-2 runs at low quality.
//
// A thin dispatcher: picks a prompt file and a format, then spawns the
// in-repo venice/wavespeed CLI once per generation (stdio inherited, so
// the child's banner/spinner/footer are the main visuals). Test seams:
// HOME redirects the pool, RANDOM_ART_CHILD replaces the child script.

import { readFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { Command, InvalidArgumentError } from "commander";
import * as ui from "../lib/ui.js";
import { c, truncate, fmtDuration } from "../lib/ui.js";
import { parseFormat, NAMED_RATIOS } from "../lib/format.js";
import { loadEnvFile, collectPromptFiles, shuffle } from "../lib/prompt-pool.js";

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, ".config/diem-burner/env");
const PROMPTS_DIR = path.join(HOME, "prompts");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEEDREAM = "seedream-v5-pro";
const GPT_IMAGE = "gpt-image-2";
const DEFAULT_FORMATS = ["9:16"];

const parseCount = (value) => {
  if (!/^\d+$/.test(value.trim()) || parseInt(value, 10) < 1) {
    throw new InvalidArgumentError("expected a positive integer.");
  }
  return parseInt(value, 10);
};

const program = new Command();
program
  .name("random-art")
  .version("1.0.0")
  .description(
    `Generate artwork from a random prompt file in ~/prompts — the diem-burner
pool: recursive, .txt only, skipping old/, short/, images/. Venice +
${SEEDREAM} pinned at 1K by default (the burner's economics).`,
  )
  .option("--wave", "generate via the WaveSpeed CLI instead of Venice")
  .option("--gpt", `use ${GPT_IMAGE} (low quality) instead of ${SEEDREAM}`)
  .option(
    "--format <f>",
    `named size (${Object.keys(NAMED_RATIOS).join(", ")}), "W:H" ratio, or "WxH" pixels (default: random pick from DIEM_BURNER_FORMATS, else ${DEFAULT_FORMATS[0]})`,
  )
  .option(
    "--count <n>",
    "artworks to generate; fresh random prompt file and format each time",
    parseCount,
    1,
  )
  .option(
    "--prompt <file>",
    "use this prompt file instead of a random pick (a file path only, never literal prompt text)",
  )
  .option("--list", "print the prompt pool and exit")
  .option("--dry-run", "print the pick(s) and resolved command(s); generate nothing")
  .helpOption("-h, --help", "display help")
  .addHelpText(
    "after",
    `
Examples:
  random-art                       one Venice seedream image, random everything
  random-art --count 3             three artworks, new prompt + format each
  random-art --wave --format 2:3   one WaveSpeed image at 2:3
  random-art --gpt --dry-run       show what a gpt-image-2 run would send
  random-art --list                inspect the prompt pool

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

// First non-empty line of the prompt file, for the dim preview under the pick.
async function firstLine(file) {
  const text = await readFile(file, "utf8");
  return text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
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

async function loadPool() {
  let files;
  try {
    files = await collectPromptFiles(PROMPTS_DIR);
  } catch (poolErr) {
    if (poolErr.code === "ENOENT") {
      ui.err(`prompt directory ${PROMPTS_DIR} does not exist`);
      process.exit(1);
    }
    throw poolErr;
  }
  if (files.length === 0) {
    ui.err(
      `no .txt prompt files found in ${PROMPTS_DIR} (recursive, skipping old/, short/, images/ and dotdirs)`,
    );
    process.exit(1);
  }
  return files;
}

async function main() {
  if (opts.format) validateFormatArg(opts.format);
  await loadEnvFile(ENV_FILE);

  const formatPool = (process.env.DIEM_BURNER_FORMATS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const formats = formatPool.length > 0 ? formatPool : DEFAULT_FORMATS;

  if (opts.list) {
    const files = await loadPool();
    ui.batchHeader(PROMPTS_DIR.replace(HOME, "~"), files.length);
    for (const f of files.map((p) => path.relative(PROMPTS_DIR, p)).sort()) {
      ui.info(`  ${f}`);
    }
    return;
  }

  let pool = null;
  if (opts.prompt) {
    try {
      await readFile(opts.prompt, "utf8");
    } catch {
      ui.err(`prompt file not readable: ${opts.prompt} (--prompt takes a file path, not prompt text)`);
      process.exit(1);
    }
  } else {
    pool = shuffle(await loadPool());
  }

  // Preflight the route's API key before spawning anything (the child would
  // also catch this, but N images deep into a batch is the wrong place).
  const skipPreflight =
    opts.dryRun ||
    process.env.RANDOM_ART_CHILD ||
    (opts.wave ? process.env.WAVESPEED_SMOKE_TEST : process.env.VENICE_SMOKE_TEST);
  if (!skipPreflight) {
    const keyName = opts.wave ? "WAVESPEED_KEY" : "VENICE_API_TOKEN";
    if (!process.env[keyName]) {
      ui.err(`${keyName} is not set (checked the environment and ${ENV_FILE})`);
      process.exit(1);
    }
  }

  const model = opts.gpt ? GPT_IMAGE : SEEDREAM;
  const started = Date.now();
  let poolIdx = 0;
  let generated = 0;
  let blocked = 0;
  let failed = 0;

  for (let i = 0; i < opts.count; i++) {
    let promptFile;
    if (opts.prompt) {
      promptFile = opts.prompt;
    } else {
      // Shuffle-without-replacement: no repeats until the pool is exhausted.
      if (poolIdx >= pool.length) {
        shuffle(pool);
        poolIdx = 0;
      }
      promptFile = pool[poolIdx++];
    }
    const format = opts.format || formats[Math.floor(Math.random() * formats.length)];

    if (opts.count > 1) ui.roundHeader("generation", i + 1, opts.count);
    const rel = promptFile.startsWith(PROMPTS_DIR + path.sep)
      ? path.relative(PROMPTS_DIR, promptFile)
      : promptFile;
    const poolNote = i === 0 && pool ? ` · pool of ${pool.length}` : "";
    console.log(`${c.magenta("⚄")} ${c.bold(rel)} ${c.dim(`· ${format}${poolNote}`)}`);
    console.log(`  ${c.dim(`"${truncate(await firstLine(promptFile), 100)}"`)}`);

    let cliPath, cliArgs, extraEnv;
    if (opts.wave) {
      cliPath = path.join(REPO_ROOT, "wavespeed/index.js");
      // wave takes lowercase resolution tiers; venice upper-cases. Load-bearing.
      cliArgs = ["--prompt", promptFile, "--model", model, "--format", format, "--resolution", "1k", "--aiwdm-tags", "random-art"];
      extraEnv = {};
    } else {
      cliPath = path.join(REPO_ROOT, "venice/index.js");
      cliArgs = ["--prompt", promptFile, "--model", model, "--format", format, "--resolution", "1K", "--aiwdm-tags", "random-art"];
      if (opts.gpt) cliArgs.push("--quality", "low");
      extraEnv = { VENICE_PATH: process.env.VENICE_PATH || path.join(HOME, "ai-art/venice/images") };
    }

    if (opts.dryRun) {
      ui.info(`  dry-run: node ${cliPath} ${cliArgs.join(" ")}`);
      continue;
    }

    const code = await run(process.env.RANDOM_ART_CHILD || cliPath, cliArgs, extraEnv);
    if (opts.count === 1) process.exit(code);
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

  if (opts.count > 1 && !opts.dryRun) {
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
