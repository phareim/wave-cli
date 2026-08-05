// chart-art dispatcher tests. Hermetic via three seams:
//   CHART_ART_FIXTURE=<json>  replaces the Civitai API fetch with a file
//   CHART_ART_CHILD=<js>      replaces the spawned venice/wavespeed script
//   HOME=<tmpdir>             keeps the real ~/.config/diem-burner/env out

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripSdSyntax, aiwdmRatingFor, fetchChart } from "../lib/civitai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const FIXTURE = path.join(__dirname, "fixtures/civitai-chart.json");

const runChart = (args, env = {}, input) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "chart-art-home-"));
  try {
    const result = spawnSync("node", [path.join(repoRoot, "tools/chart-art.mjs"), ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      input,
      env: {
        ...process.env,
        HOME: home,
        CHART_ART_FIXTURE: FIXTURE,
        CHART_ART_CHILD: "",
        VENICE_API_TOKEN: "",
        WAVESPEED_KEY: "",
        DIEM_BURNER_FORMATS: "",
        ...env,
      },
    });
    if (result.error) throw result.error;
    return result;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
};

// --- lib/civitai.js units ---------------------------------------------------

test("stripSdSyntax removes lora tags, weights, boilerplate tokens", () => {
  const soup =
    "score_9, score_8_up, masterpiece, best quality, absurdres, (extremely detailed:1.4), <lora:styleX:1>, 1girl, solo, red dress, rooftop at dusk, wind in her hair";
  assert.equal(stripSdSyntax(soup), "1girl, solo, red dress, rooftop at dusk, wind in her hair");
});

test("stripSdSyntax unwraps nested emphasis, brackets, and BREAK", () => {
  const s =
    "((dramatic lighting)), a knight in ornate silver armor, [faint fog], BREAK shafts of light";
  assert.equal(stripSdSyntax(s), "dramatic lighting, a knight in ornate silver armor, faint fog, shafts of light");
});

test("stripSdSyntax leaves clean natural-language prompts untouched", () => {
  const clean = "A dreamlike painterly portrait of a woman holding a sleeping calico kitten, soft window light";
  assert.equal(stripSdSyntax(clean), clean);
});

test("aiwdmRatingFor maps browsingLevels, failing safe to R", () => {
  assert.equal(aiwdmRatingFor(1), "PG");
  assert.equal(aiwdmRatingFor(2), "PG13");
  assert.equal(aiwdmRatingFor(4), "R");
  assert.equal(aiwdmRatingFor(8), "R");
  assert.equal(aiwdmRatingFor(16), "R");
  assert.equal(aiwdmRatingFor(undefined), "R");
});

test("fetchChart cleans, filters short/no-meta, and dedupes", async () => {
  process.env.CHART_ART_FIXTURE = FIXTURE;
  try {
    const entries = await fetchChart({ period: "week", maxRating: "xxx" });
    assert.equal(entries.length, 3); // 104 too short, 105 duplicate, 106 no meta
    assert.deepEqual(entries.map((e) => e.id), [101, 102, 103]);
    assert.equal(entries[1].prompt, "1girl, solo, red dress, rooftop at dusk, wind in her hair");
    assert.equal(entries[0].likes, 900);
    assert.equal(entries[0].pageUrl, "https://civitai.com/images/101");
    assert.deepEqual(entries.map((e) => e.levelLabel), ["PG", "PG13", "R"]);
  } finally {
    delete process.env.CHART_ART_FIXTURE;
  }
});

test("fetchChart filters on the browsingLevel range", async () => {
  process.env.CHART_ART_FIXTURE = FIXTURE;
  try {
    assert.deepEqual((await fetchChart({})).map((e) => e.id), [101]); // default pg ceiling
    assert.deepEqual(
      (await fetchChart({ minRating: "pg13", maxRating: "r" })).map((e) => e.id),
      [102, 103],
    );
    await assert.rejects(fetchChart({ minRating: "x", maxRating: "pg" }), /above max rating/);
    await assert.rejects(fetchChart({ maxRating: "spicy" }), /unknown rating/);
  } finally {
    delete process.env.CHART_ART_FIXTURE;
  }
});

// --- CLI --------------------------------------------------------------------

test("--list prints the chart with reactions and cleaned prompts", () => {
  const result = runChart(["--list", "--max-rating", "r"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /civitai · week · ≤r/);
  assert.match(result.stdout, /900♥300/);
  assert.match(result.stdout, /1girl, solo, red dress/);
  assert.doesNotMatch(result.stdout, /score_9/);
});

test("default pg ceiling keeps higher browsingLevels out of the chart", () => {
  const result = runChart(["--list"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /tree frog/);
  assert.doesNotMatch(result.stdout, /1girl/); // level 2 (PG13) excluded by default
});

test("--dry-run resolves the child command with mapped aiwdm rating", () => {
  const result = runChart(["--dry-run", "--min-likes", "600", "--format", "9:16"]);
  assert.equal(result.status, 0);
  // Only entry 101 (900 likes, level 1) survives min-likes 600.
  assert.match(result.stdout, /civitai:101/);
  assert.match(result.stdout, /PG→PG/);
  assert.match(result.stdout, /--aiwdm-tags chart-art --aiwdm-rating PG/);
  assert.match(result.stdout, /venice\/index\.js/);
});

test("interactive pick from stdin drives the choice", () => {
  const result = runChart(["-i", "--dry-run", "--format", "9:16", "--max-rating", "r"], {}, "2\n");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /civitai:102/);
  assert.match(result.stdout, /PG13→PG13/);
  assert.match(result.stdout, /--aiwdm-rating PG13/);
});

test("interactive rejects an out-of-range pick", () => {
  const result = runChart(["-i", "--dry-run"], {}, "99\n");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid pick/);
});

test("empty chart after filtering exits 1 with a clear error", () => {
  const result = runChart(["--min-likes", "99999"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no usable prompts/);
});

test("--count continues through moderation blocks and reports them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chart-art-child-"));
  try {
    const child = path.join(dir, "child-exit-2.mjs");
    fs.writeFileSync(child, "process.exit(2);\n");
    const result = runChart(["--count", "2", "--format", "9:16"], { CHART_ART_CHILD: child });
    assert.equal(result.status, 0); // moderation skips don't fail the batch
    assert.match(result.stdout + result.stderr, /2 blocked/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("single run propagates the child's exit code verbatim", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chart-art-child-"));
  try {
    const child = path.join(dir, "child-exit-2.mjs");
    fs.writeFileSync(child, "process.exit(2);\n");
    const result = runChart(["--format", "9:16"], { CHART_ART_CHILD: child });
    assert.equal(result.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
