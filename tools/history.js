#!/usr/bin/env node

// wave-history: browse the Wavespeed predictions history API (covers roughly
// the last 7 days, API + web UI generations) and optionally re-download
// completed outputs and publish them to aiwdm with a best-effort duplicate
// check. Output URLs in history are temporary — aiwdm (or a local sidecar via
// --local) is the durable record.

import { readdirSync, readFileSync } from "fs";
import path from "path";
import { Command } from "commander";

import * as ui from "../lib/ui.js";
import { fetchOutputs, resolveOutDir } from "../lib/media.js";
import { publishOutputs, resolveAiwdmDir } from "../lib/aiwdm.js";
import { getModelInfo } from "../wavespeed/models.js";

const API_BASE_URL = "https://api.wavespeed.ai/api/v3";
const DIR_SPEC = { envVar: "WAVESPEED_PATH", defaultDir: "images" };
const SMOKE_MODE = process.env.WAVESPEED_SMOKE_TEST === "1";
const VALID_STATUSES = ["created", "processing", "completed", "failed", "cancelled", "timeout", "deleted"];

let DEBUG = false;

const authHeaders = (extra = {}) => ({
  Authorization: `Bearer ${process.env.WAVESPEED_KEY}`,
  ...extra,
});

/** Accept RFC 3339 timestamps or relative shorthand (90m, 24h, 3d). */
const parseWhen = (value, flag) => {
  const rel = /^(\d+)([mhd])$/.exec(value);
  if (rel) {
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2]];
    return new Date(Date.now() - parseInt(rel[1], 10) * unitMs).toISOString();
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  ui.err(`${flag} '${value}' not understood — use RFC 3339 (2026-07-15T00:00:00Z) or relative (90m, 24h, 3d).`);
  process.exit(1);
};

const MOCK_ITEMS = [
  {
    id: "aaaa1111aaaa1111aaaa1111aaaa1111",
    model: "bytedance/seedream-v4",
    status: "completed",
    outputs: ["https://example.com/mock-history-a.png"],
    created_at: "2026-07-15T10:00:00Z",
    executionTime: 2100,
    input: { prompt: "mock history prompt", seed: 42, size: "1024*1024" },
  },
  {
    id: "bbbb2222bbbb2222bbbb2222bbbb2222",
    model: "wavespeed-ai/wan-2.5/text-to-video",
    status: "completed",
    outputs: ["https://example.com/mock-history-b.mp4"],
    created_at: "2026-07-15T11:00:00Z",
    executionTime: 61000,
  },
  {
    id: "cccc3333cccc3333cccc3333cccc3333",
    model: "bytedance/seedream-v4",
    status: "failed",
    outputs: [],
    error: "mock failure",
    created_at: "2026-07-15T12:00:00Z",
  },
];

/** Page through POST /predictions until `limit` records or a short page. */
const fetchHistory = async ({ model, status, since, before }, limit) => {
  if (SMOKE_MODE) {
    return MOCK_ITEMS.filter((r) => !status || r.status === status).slice(0, limit);
  }

  const items = [];
  const pageSize = Math.min(limit, 100);
  for (let page = 1; items.length < limit; page++) {
    const body = {
      page,
      page_size: pageSize,
      ...(model ? { model } : {}),
      ...(status ? { status } : {}),
      ...(since ? { created_after: since } : {}),
      ...(before ? { created_before: before } : {}),
    };
    if (DEBUG) console.log("History request:", JSON.stringify(body));

    const response = await fetch(`${API_BASE_URL}/predictions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`History API error (HTTP ${response.status}): ${(await response.text()).slice(0, 200)}`);
    }

    const json = await response.json();
    const pageItems = json?.data?.items || [];
    if (DEBUG) console.log(`Page ${page}: ${pageItems.length} items`);
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
  }
  return items.slice(0, limit);
};

/** Video vs image: model category first, output URL extension as fallback. */
const kindOf = (record) => {
  const category = getModelInfo(record.model)?.metadata?.category;
  if (category) return category.endsWith("-to-video") ? "video" : "image";
  return /\.(mp4|webm|mov)(\?|$)/i.test(record.outputs?.[0] || "") ? "video" : "image";
};

const STATUS_GLYPHS = {
  completed: ui.c.green("✔"),
  failed: ui.c.red("✖"),
};

const printList = (items) => {
  ui.banner("wave-history", `${items.length} prediction${items.length === 1 ? "" : "s"}`);
  if (!items.length) {
    ui.info("  nothing in the last 7 days matching the filters");
    return;
  }
  for (const record of items) {
    const glyph = STATUS_GLYPHS[record.status] || ui.c.yellow("⧗");
    const when = (record.created_at || "").replace("T", " ").slice(5, 16);
    const model = ui.truncate(record.model || "?", 34).padEnd(34);
    const outputs = record.status === "completed"
      ? `${record.outputs?.length || 0} output${record.outputs?.length === 1 ? "" : "s"}`
      : record.status;
    const took = record.executionTime ? ui.fmtDuration(record.executionTime) : "";
    console.log(`  ${glyph} ${ui.c.dim(when)}  ${model} ${outputs.padEnd(10)} ${took.padEnd(6)} ${ui.c.dim(record.id)}`);
  }
  ui.footer(["history covers ~7 days", "output URLs are temporary", "--upload publishes completed outputs to aiwdm"]);
};

/**
 * Best-effort remote duplicate index: the aiwdm media list, keyed by filename
 * stem. wave-cli names every Wavespeed download `<prediction_id>[ _i].<ext>`
 * and aiwdm preserves filenames, so a stem match means "already uploaded".
 * Returns null (with a warning) when the aiwdm API isn't reachable.
 */
const loadAiwdmStems = async () => {
  if (SMOKE_MODE) return null;
  try {
    const aiwdmDir = resolveAiwdmDir();
    let apiUrl = process.env.AIWDM_API_URL;
    if (!apiUrl && aiwdmDir) {
      const env = readFileSync(path.join(aiwdmDir, ".env"), "utf8");
      apiUrl = /^API_URL=(.+)$/m.exec(env)?.[1]?.trim();
    }
    if (!apiUrl) return null;

    const grab = async (route) => {
      const res = await fetch(`${apiUrl}${route}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${route}`);
      return res.json();
    };
    const [videos, images] = await Promise.all([grab("/videos"), grab("/images?includeR=true")]);
    const stems = new Set();
    for (const media of [...(videos?.videos || []), ...(images?.images || [])]) {
      if (media.filename) stems.add(path.parse(media.filename).name);
    }
    if (DEBUG) console.log(`aiwdm index: ${stems.size} filenames`);
    return stems;
  } catch (error) {
    if (DEBUG) console.log(`aiwdm index unavailable: ${error.message}`);
    return null;
  }
};

/** `<id>` or `<id>_<i>` filename stems both mean this prediction. */
const stemsInclude = (stems, predictionId) => {
  if (stems.has(predictionId)) return true;
  for (const stem of stems) {
    if (stem.startsWith(`${predictionId}_`)) return true;
  }
  return false;
};

const localStems = (options) => {
  try {
    return new Set(readdirSync(resolveOutDir(DIR_SPEC, options.out)).map((f) => path.parse(f).name));
  } catch {
    return new Set();
  }
};

const uploadHistory = async (items, options) => {
  const completed = items.filter((r) => r.status === "completed" && r.outputs?.length);
  ui.banner("wave-history", `upload · ${completed.length} completed of ${items.length} fetched`);
  if (!completed.length) {
    ui.info("  nothing completed to upload");
    return;
  }

  const aiwdmStems = await loadAiwdmStems();
  if (!aiwdmStems && !options.force && !SMOKE_MODE) {
    ui.warn("aiwdm library list unavailable — duplicate check limited to local files (aiwdm still dedupes by content hash on upload)");
  }
  const seenLocally = localStems(options);

  let uploaded = 0, skipped = 0, failed = 0;
  for (let i = 0; i < completed.length; i++) {
    const record = completed[i];
    ui.fileHeader(record.id, i + 1, completed.length);

    const modelInfo = getModelInfo(record.model);
    // Best effort: history records don't document an echo of the original
    // request, but pass through record.input when the API does return it so
    // the prompt/seed/size survive into the metadata blob and aiwdm
    // description. Prompt-less imports stay valid.
    const input = record.input && typeof record.input === "object" ? record.input : {};
    ui.kv([
      ["model", `${modelInfo?.metadata?.display_name || record.model} ${ui.c.dim(`[${record.model}]`)}`],
      ["prompt", input.prompt ? ui.truncate(input.prompt) : undefined],
      ["created", record.created_at],
      ["outputs", String(record.outputs.length)],
    ]);

    if (!options.force) {
      if (aiwdmStems && stemsInclude(aiwdmStems, record.id)) {
        ui.info(`  ⏭ already in aiwdm (filename match) — skipping (--force to re-upload)`);
        skipped++;
        continue;
      }
      if (stemsInclude(seenLocally, record.id)) {
        ui.info(`  ⏭ already downloaded locally — skipping (--force to re-upload)`);
        skipped++;
        continue;
      }
    }

    if (options.dryRun) {
      ui.info(`  → would download ${record.outputs.length} output(s) and ${options.local ? "write sidecars" : "upload to aiwdm"}`);
      uploaded++;
      continue;
    }

    const savedPaths = await fetchOutputs(record.outputs, DIR_SPEC, {
      localOverride: options.out,
      predictionId: record.id,
      mockBuffer: SMOKE_MODE ? Buffer.from("mock wavespeed history output") : null,
    });
    if (!savedPaths.length) {
      ui.err(`  download failed — output URLs may have expired`);
      failed++;
      continue;
    }

    const kind = kindOf(record);
    const metadataBlob = options.metadata !== false ? {
      source: "wavespeed",
      kind,
      generated_at: record.created_at,
      imported_at: new Date().toISOString(),
      imported_via: "wave-history",
      cli_version: "1.0.0",
      model: record.model,
      model_display_name: modelInfo?.metadata?.display_name,
      category: modelInfo?.metadata?.category,
      prompt: input.prompt,
      negative_prompt: input.negative_prompt,
      seed: input.seed,
      size: input.size,
      aspect_ratio: input.aspect_ratio,
      resolution: input.resolution,
      duration: input.duration,
      prediction_id: record.id,
      created_at: record.created_at,
      execution_time_ms: record.executionTime,
    } : null;

    await publishOutputs(savedPaths, metadataBlob, {
      sourceTag: "wavespeed",
      modelTag: modelInfo?.metadata?.display_name || record.model,
      prompt: input.prompt,
      options,
      smoke: SMOKE_MODE,
    });
    uploaded++;
  }

  ui.footer([
    `${uploaded} ${options.dryRun ? "would upload" : options.local ? "saved locally" : "uploaded"}`,
    skipped ? `${skipped} skipped as duplicates` : null,
    failed ? `${failed} failed` : null,
  ]);
  if (failed) process.exitCode = 1;
};

const program = new Command();
program
  .name("wave-history")
  .description("Browse Wavespeed prediction history (last ~7 days) and optionally publish completed outputs to aiwdm")
  .option("--limit <n>", "Maximum predictions to fetch", "20")
  .option("--model <endpoint>", "Filter by full model endpoint (e.g. bytedance/seedream-v4)")
  .option("--status <status>", `Filter by status: ${VALID_STATUSES.join(", ")}`)
  .option("--since <when>", "Only predictions after this time (RFC 3339 or 90m/24h/3d)")
  .option("--before <when>", "Only predictions before this time (RFC 3339 or 90m/24h/3d)")
  .option("--json", "Output the raw prediction records as JSON")
  .option("--upload", "Download completed outputs and upload them to aiwdm (best-effort duplicate check)")
  .option("--dry-run", "With --upload: report what would happen without downloading or uploading")
  .option("--force", "With --upload: skip the duplicate check")
  .option("--local", "With --upload: write local metadata sidecars instead of uploading to aiwdm")
  .option("--out", "Save downloads to ./images in the current directory, ignoring WAVESPEED_PATH")
  .option("--aiwdm-rating <rating>", "Rating for aiwdm uploads (G|PG|PG13|R)", "R")
  .option("--aiwdm-tags <tags>", "Extra comma-separated tags for aiwdm uploads")
  .option("--no-metadata", "Skip the metadata blob entirely")
  .option("--debug", "Log requests and responses")
  .parse(process.argv);

const main = async () => {
  const options = program.opts();
  DEBUG = options.debug || false;

  if (!process.env.WAVESPEED_KEY && !SMOKE_MODE) {
    ui.err("WAVESPEED_KEY environment variable is not set.");
    console.error("  export WAVESPEED_KEY='your-api-key'");
    process.exit(1);
  }
  if (options.status && !VALID_STATUSES.includes(options.status)) {
    ui.err(`Invalid --status '${options.status}'. Valid: ${VALID_STATUSES.join(", ")}`);
    process.exit(1);
  }

  const limit = Math.max(parseInt(options.limit, 10) || 20, 1);
  const filters = {
    model: options.model,
    status: options.status || (options.upload ? "completed" : undefined),
    since: options.since ? parseWhen(options.since, "--since") : undefined,
    before: options.before ? parseWhen(options.before, "--before") : undefined,
  };

  let items;
  try {
    items = await fetchHistory(filters, limit);
  } catch (error) {
    ui.err(error.message);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (options.upload) {
    await uploadHistory(items, options);
    return;
  }
  printList(items);
};

main();
