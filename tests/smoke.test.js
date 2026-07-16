import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const runCli = (args, env = {}) => {
  const result = spawnSync("node", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env
    },
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, `CLI exited with ${result.status}\nSTDERR:\n${result.stderr}`);
  return result;
};

const removeDir = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
};

test("venice smoke test saves mocked image output", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-smoke-"));
  try {
    runCli(
      ["venice/index.js", "--prompt", "smoke test"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const imageFile = files.find((file) => file.startsWith("venice_") && file.endsWith(".png"));
    assert(imageFile, "Expected venice output file");

    const sidecar = imageFile.replace(/\.png$/, ".json");
    assert(files.includes(sidecar), "Expected venice metadata sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.source, "venice");
    assert.equal(metadata.kind, "image");
    assert.equal(metadata.prompt, "smoke test");
    assert.equal(typeof metadata.seed, "number", "Expected auto-generated seed in sidecar");
    assert(metadata.seed >= 0, "Expected non-negative seed");
  } finally {
    removeDir(outputDir);
  }
});

test("venice records user-supplied seed in sidecar", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-seed-"));
  try {
    runCli(
      ["venice/index.js", "--prompt", "smoke test", "--seed", "12345"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((file) => file.endsWith(".json"));
    assert(sidecar, "Expected venice metadata sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.seed, 12345, "Expected user-supplied seed preserved");
  } finally {
    removeDir(outputDir);
  }
});

test("venice --no-metadata skips sidecar", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-nometa-"));
  try {
    runCli(
      ["venice/index.js", "--prompt", "smoke test", "--no-metadata"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    assert(files.some((file) => file.endsWith(".png")), "Expected venice output file");
    assert(!files.some((file) => file.endsWith(".json")), "Expected no sidecar with --no-metadata");
  } finally {
    removeDir(outputDir);
  }
});

test("wavespeed smoke test saves mocked image output", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-smoke-"));
  try {
    runCli(
      ["wavespeed/index.js", "--prompt", "smoke test"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const imageFile = files.find((file) => file.endsWith(".png"));
    assert(imageFile, "Expected wavespeed output file");

    const sidecar = imageFile.replace(/\.png$/, ".json");
    assert(files.includes(sidecar), "Expected wavespeed metadata sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.source, "wavespeed");
    assert.equal(metadata.kind, "image");
    assert.equal(metadata.prompt, "smoke test");
    assert.equal(metadata.output_file, imageFile);
    assert.equal(typeof metadata.seed, "number", "Expected auto-generated seed in sidecar");
  } finally {
    removeDir(outputDir);
  }
});

test("venice-video smoke test saves mocked mp4 output", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-video-smoke-"));
  try {
    runCli(
      ["venice/video.js", "--prompt", "smoke test"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_VIDEO_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const videoFile = files.find((file) => file.startsWith("venice_") && file.endsWith(".mp4"));
    assert(videoFile, "Expected venice-video output file");

    const sidecar = videoFile.replace(/\.mp4$/, ".json");
    assert(files.includes(sidecar), "Expected venice-video metadata sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.source, "venice-video");
    assert.equal(metadata.kind, "video");
    assert.equal(metadata.prompt, "smoke test");
    assert(metadata.queue_id, "Expected queue_id in metadata");
    assert.equal(typeof metadata.seed, "number", "Expected auto-generated seed in sidecar");
  } finally {
    removeDir(outputDir);
  }
});

test("venice --keywords expands prompt via text model and records inputs in sidecar", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-keywords-"));
  try {
    runCli(
      ["venice/index.js", "--keywords", "neon, cat, alley", "--keyword-rating", "PG13"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected venice sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.keywords, "neon, cat, alley");
    assert.equal(metadata.keyword_rating, "PG13");
    assert.equal(metadata.keyword_model, "zai-org-glm-4.6");
    assert.match(metadata.prompt, /\[mock PG13\] cinematic image inspired by: neon, cat, alley/);
  } finally {
    removeDir(outputDir);
  }
});

test("wavespeed --keywords expands prompt via Venice text model and records inputs in sidecar", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-keywords-"));
  try {
    runCli(
      ["wavespeed/index.js", "--keywords", "rain, neon, samurai", "--keyword-rating", "PG"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected wavespeed sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.keywords, "rain, neon, samurai");
    assert.equal(metadata.keyword_rating, "PG");
    assert.equal(metadata.keyword_model, "zai-org-glm-4.6");
    assert.match(metadata.prompt, /\[mock PG\] cinematic image inspired by: rain, neon, samurai/);
  } finally {
    removeDir(outputDir);
  }
});

test("venice --keywords + --prompt rewrites the prompt and records original_prompt", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-rewrite-"));
  try {
    runCli(
      [
        "venice/index.js",
        "--prompt", "a quiet bookshop interior",
        "--keywords", "neon, cat, alley",
        "--keyword-rating", "PG13",
      ],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected venice sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.original_prompt, "a quiet bookshop interior");
    assert.equal(metadata.keywords, "neon, cat, alley");
    assert.equal(metadata.keyword_rating, "PG13");
    assert.match(metadata.prompt, /\[mock PG13 rewrite\] a quiet bookshop interior :: incorporating neon, cat, alley/);
  } finally {
    removeDir(outputDir);
  }
});

test("wavespeed --keywords + --prompt rewrites the prompt and records original_prompt", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-rewrite-"));
  try {
    runCli(
      [
        "wavespeed/index.js",
        "--prompt", "a quiet bookshop interior",
        "--keywords", "rain, neon, samurai",
        "--keyword-rating", "PG",
      ],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected wavespeed sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.original_prompt, "a quiet bookshop interior");
    assert.equal(metadata.keywords, "rain, neon, samurai");
    assert.equal(metadata.keyword_rating, "PG");
    assert.match(metadata.prompt, /\[mock PG rewrite\] a quiet bookshop interior :: incorporating rain, neon, samurai/);
    // optimize_mode/style should not be set since --optimize was not used
    assert.equal(metadata.optimize_mode, undefined);
    assert.equal(metadata.optimize_style, undefined);
  } finally {
    removeDir(outputDir);
  }
});

test("wave-replay reconstructs venice command from sidecar", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-replay-venice-"));
  try {
    const sidecar = path.join(tmpDir, "venice_1.json");
    fs.writeFileSync(sidecar, JSON.stringify({
      source: "venice",
      kind: "image",
      model: "venice-sd35",
      model_key: "venice-sd35",
      prompt: 'a cat with "fancy" hat',
      width: 1024,
      height: 1024,
      cfg_scale: 2,
      seed: 12345,
      style_preset: "Anime",
      output_format: "png",
      hide_watermark: true,
    }));

    const result = runCli(["tools/replay.js", sidecar]);
    const out = result.stdout.trim();
    assert.match(out, /^venice /);
    assert.match(out, /--model venice-sd35/);
    assert.match(out, /--prompt 'a cat with "fancy" hat'/);
    assert.match(out, /--seed 12345/);
    assert.match(out, /--lora Anime/);
    // hide_watermark is a legacy sidecar field: the flag was removed (always on).
    assert.doesNotMatch(out, /--hide-watermark/);
  } finally {
    removeDir(tmpDir);
  }
});

test("wave-replay finds sidecar when given media file path", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-replay-media-"));
  try {
    const sidecarPath = path.join(tmpDir, "wavespeed_1.json");
    const mediaPath = path.join(tmpDir, "wavespeed_1.png");
    fs.writeFileSync(sidecarPath, JSON.stringify({
      source: "wavespeed",
      kind: "image",
      model: "bytedance/seedream-v4-5",
      model_key: "seedream",
      prompt: "Optimized: a cat",
      original_prompt: "a cat",
      size: "1024*1024",
      seed: 7,
      input_images: ["https://ex.com/a.jpg", "https://ex.com/b.jpg"],
    }));
    fs.writeFileSync(mediaPath, "fake png");

    const result = runCli(["tools/replay.js", mediaPath]);
    const out = result.stdout.trim();
    assert.match(out, /^wave /);
    // Replays the post-optimization prompt, not the original — optimizer is non-deterministic.
    assert.match(out, /--prompt 'Optimized: a cat'/);
    assert.doesNotMatch(out, /--optimize\b/);
    assert.match(out, /--format '1024\*1024'/);
    assert.match(out, /--images https:\/\/ex\.com\/a\.jpg https:\/\/ex\.com\/b\.jpg/);
  } finally {
    removeDir(tmpDir);
  }
});

test("wave-replay --exec re-runs venice from a sidecar", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-replay-exec-fixture-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-replay-exec-out-"));
  try {
    const sidecar = path.join(fixtureDir, "venice_seed.json");
    fs.writeFileSync(sidecar, JSON.stringify({
      source: "venice",
      kind: "image",
      model: "venice-sd35",
      model_key: "venice-sd35",
      prompt: "replay smoke",
      seed: 4242,
    }));

    runCli(
      ["tools/replay.js", sidecar, "--exec"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const files = fs.readdirSync(outputDir);
    const newSidecar = files.find((f) => f.endsWith(".json"));
    assert(newSidecar, "Expected re-run to produce a fresh sidecar");
    const replayed = JSON.parse(fs.readFileSync(path.join(outputDir, newSidecar), "utf8"));
    assert.equal(replayed.prompt, "replay smoke");
    assert.equal(replayed.seed, 4242, "Expected seed from original sidecar to be honored on replay");
  } finally {
    removeDir(fixtureDir);
    removeDir(outputDir);
  }
});

test("wavespeed --file <directory> processes every .txt inside", () => {
  const promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-dir-prompts-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-dir-out-"));
  try {
    fs.writeFileSync(path.join(promptDir, "a.txt"), "first prompt");
    fs.writeFileSync(path.join(promptDir, "b.txt"), "second prompt");
    fs.writeFileSync(path.join(promptDir, "skip.md"), "ignored");

    // The wavespeed mock returns a fixed URL, so the two generations overwrite the
    // same sidecar on disk — assert via stdout that both .txt files were visited
    // (and that skip.md was filtered out).
    const result = runCli(
      ["wavespeed/index.js", "--prompt", promptDir],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    assert.match(result.stdout, /2 prompt files/);
    assert.match(result.stdout, /a\.txt \(1\/2\)/);
    assert.match(result.stdout, /b\.txt \(2\/2\)/);
    assert.doesNotMatch(result.stdout, /skip\.md/);
  } finally {
    removeDir(promptDir);
    removeDir(outputDir);
  }
});

test("wavespeed --file <directory> --count rotates files instead of repeating each", () => {
  const promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-dir-count-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-dir-count-out-"));
  try {
    fs.writeFileSync(path.join(promptDir, "a.txt"), "first prompt");
    fs.writeFileSync(path.join(promptDir, "b.txt"), "second prompt");

    const result = runCli(
      ["wavespeed/index.js", "--prompt", promptDir, "--count", "2"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    assert.match(result.stdout, /round 1\/2/);
    assert.match(result.stdout, /round 2\/2/);
    // Each file should be processed once per round (twice total).
    const aHits = result.stdout.match(/a\.txt \(\d\/2\)/g) || [];
    const bHits = result.stdout.match(/b\.txt \(\d\/2\)/g) || [];
    assert.equal(aHits.length, 2, "a.txt should be processed in each round");
    assert.equal(bHits.length, 2, "b.txt should be processed in each round");
    // The per-generation repeat banner from generateBatch should not appear,
    // since each generateBatch call runs with count=1 in this path.
    assert.doesNotMatch(result.stdout, /generation 1\//);
    // Round 1 should see a.txt before b.txt, and round 2 should run a.txt
    // again before any second b.txt — i.e. a, b, a, b (not a, a, b, b).
    const order = [...result.stdout.matchAll(/([ab])\.txt \(\d\/2\)/g)].map((m) => m[1]);
    assert.deepEqual(order, ["a", "b", "a", "b"]);
  } finally {
    removeDir(promptDir);
    removeDir(outputDir);
  }
});

test("venice --file <directory> processes every .txt inside", () => {
  const promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-dir-prompts-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-dir-out-"));
  try {
    fs.writeFileSync(path.join(promptDir, "a.txt"), "alpha prompt");
    fs.writeFileSync(path.join(promptDir, "b.txt"), "beta prompt");

    runCli(
      ["venice/index.js", "--prompt", promptDir],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test",
      }
    );

    const sidecars = fs.readdirSync(outputDir).filter((f) => f.endsWith(".json"));
    const prompts = sidecars
      .map((f) => JSON.parse(fs.readFileSync(path.join(outputDir, f), "utf8")).prompt)
      .sort();
    assert.deepEqual(prompts, ["alpha prompt", "beta prompt"]);
  } finally {
    removeDir(promptDir);
    removeDir(outputDir);
  }
});

test("wavespeed smoke test with optimize flag", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-opt-smoke-"));
  try {
    runCli(
      ["wavespeed/index.js", "--prompt", "test", "--optimize"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    assert(files.some((file) => file.endsWith(".png")), "Expected wavespeed output file with optimization");
  } finally {
    removeDir(outputDir);
  }
});

test("imagine smoke test saves mocked image output", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "xai-smoke-"));
  try {
    runCli(
      ["xai/index.js", "--prompt", "smoke test"],
      {
        XAI_API_KEY: "test-token",
        XAI_SMOKE_TEST: "1",
        XAI_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const imageFile = files.find((file) => file.startsWith("xai_") && file.endsWith(".jpg"));
    assert(imageFile, "Expected xai output file with .jpg extension");

    const sidecar = imageFile.replace(/\.jpg$/, ".json");
    assert(files.includes(sidecar), "Expected xai metadata sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.source, "xai");
    assert.equal(metadata.kind, "image");
    assert.equal(metadata.prompt, "smoke test");
    assert.equal(metadata.n, 1, "Per-image sidecar should record n: 1");
    assert.equal(metadata.cost_ticks, 200000000);
    assert.equal(metadata.cost_usd, 0.02);
  } finally {
    removeDir(outputDir);
  }
});

test("imagine --n 3 produces three files with per-image sidecars", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "xai-n-"));
  try {
    runCli(
      ["xai/index.js", "--prompt", "smoke test", "--n", "3"],
      {
        XAI_API_KEY: "test-token",
        XAI_SMOKE_TEST: "1",
        XAI_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const images = files.filter((f) => f.endsWith(".jpg")).sort();
    assert.equal(images.length, 3, `Expected 3 images, got ${images.length}: ${images.join(", ")}`);
    for (const img of images) {
      assert.match(img, /^xai_\d+_[123]\.jpg$/, `Image filename ${img} should include index suffix`);
    }

    const sidecars = files.filter((f) => f.endsWith(".json")).sort();
    assert.equal(sidecars.length, 3, "Expected 3 per-image sidecars");
    const indices = sidecars.map((s) => JSON.parse(fs.readFileSync(path.join(outputDir, s), "utf8")));
    for (const meta of indices) {
      assert.equal(meta.source, "xai");
      assert.equal(meta.n, 1, "Per-image sidecar should record n: 1");
      assert.equal(meta.requested_n, 3, "Per-image sidecar should record requested_n: 3");
      assert(meta.image_index >= 1 && meta.image_index <= 3, `image_index out of range: ${meta.image_index}`);
    }
    const seenIndices = new Set(indices.map((m) => m.image_index));
    assert.equal(seenIndices.size, 3, "Each image_index should appear once");
  } finally {
    removeDir(outputDir);
  }
});

test("imagine --no-metadata skips sidecar", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "xai-nometa-"));
  try {
    runCli(
      ["xai/index.js", "--prompt", "smoke test", "--no-metadata"],
      {
        XAI_API_KEY: "test-token",
        XAI_SMOKE_TEST: "1",
        XAI_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    assert(files.some((file) => file.endsWith(".jpg")), "Expected xai output file");
    assert(!files.some((file) => file.endsWith(".json")), "Expected no sidecar with --no-metadata");
  } finally {
    removeDir(outputDir);
  }
});

test("imagine reads prompt from ./prompt.txt when no --prompt or --file given", () => {
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), "xai-prompt-txt-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "xai-prompt-txt-out-"));
  try {
    fs.writeFileSync(path.join(cwdDir, "prompt.txt"), "from prompt txt");
    const result = spawnSync("node", [path.join(repoRoot, "xai/index.js")], {
      cwd: cwdDir,
      env: {
        ...process.env,
        XAI_API_KEY: "test-token",
        XAI_SMOKE_TEST: "1",
        XAI_PATH: outputDir,
        NODE_ENV: "test"
      },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `CLI exited with ${result.status}\nSTDERR:\n${result.stderr}`);

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.prompt, "from prompt txt");
  } finally {
    removeDir(cwdDir);
    removeDir(outputDir);
  }
});

test("wavespeed --format ratio passes through verbatim on aspect-ratio models", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wavespeed-v5-format-"));
  try {
    runCli(
      ["wavespeed/index.js", "--model", "v5", "--prompt", "smoke test", "--format", "2:3"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected wavespeed sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    // The regression this guards: 2:3 used to be mapped to 2732*4096 pixels
    // and re-derived as 683:1024, which the seedream-v5-pro API rejects.
    assert.equal(metadata.aspect_ratio, "2:3", "Ratio must reach the API verbatim, not via pixels");
    assert.equal(metadata.size, undefined, "noSize models must not receive a size");
  } finally {
    removeDir(outputDir);
  }
});

test("venice --format accepts ratio and pixel spellings", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-format-"));
  try {
    runCli(
      ["venice/index.js", "--prompt", "smoke test", "--format", "2:3"],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected venice sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    // 2:3 scaled into the 1280 box, floored to the divisor-16 grid.
    assert.equal(metadata.width, 848);
    assert.equal(metadata.height, 1280);
  } finally {
    removeDir(outputDir);
  }
});

test("venice --prompt reads an existing file as the prompt", () => {
  const promptDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-prompt-file-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "venice-prompt-file-out-"));
  try {
    const promptFile = path.join(promptDir, "my-prompt.txt");
    fs.writeFileSync(promptFile, "prompt loaded from file");

    runCli(
      ["venice/index.js", "--prompt", promptFile],
      {
        VENICE_API_TOKEN: "test-token",
        VENICE_SMOKE_TEST: "1",
        VENICE_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    const sidecar = files.find((f) => f.endsWith(".json"));
    assert(sidecar, "Expected venice sidecar");
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, sidecar), "utf8"));
    assert.equal(metadata.prompt, "prompt loaded from file");
  } finally {
    removeDir(promptDir);
    removeDir(outputDir);
  }
});

test("wave-history lists mocked predictions", () => {
  const result = runCli(
    ["tools/history.js"],
    { WAVESPEED_KEY: "test-key", WAVESPEED_SMOKE_TEST: "1", NODE_ENV: "test" }
  );
  assert.match(result.stdout, /wave-history · 3 predictions/);
  assert.match(result.stdout, /bytedance\/seedream-v4/);
  assert.match(result.stdout, /wan-2\.5\/text-to-video/);
  assert.match(result.stdout, /failed/);
  assert.match(result.stdout, /aaaa1111aaaa1111aaaa1111aaaa1111/);
});

test("wave-history --json emits raw records", () => {
  const result = runCli(
    ["tools/history.js", "--json"],
    { WAVESPEED_KEY: "test-key", WAVESPEED_SMOKE_TEST: "1", NODE_ENV: "test" }
  );
  const items = JSON.parse(result.stdout);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, "aaaa1111aaaa1111aaaa1111aaaa1111");
  assert.equal(items[2].status, "failed");
});

test("wave-history --upload downloads completed outputs with history sidecars", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-history-upload-"));
  try {
    runCli(
      ["tools/history.js", "--upload"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    const files = fs.readdirSync(outputDir);
    assert(files.includes("aaaa1111aaaa1111aaaa1111aaaa1111.png"), "Expected image output named by prediction id");
    assert(files.includes("bbbb2222bbbb2222bbbb2222bbbb2222.mp4"), "Expected video output named by prediction id");
    assert(!files.some((f) => f.startsWith("cccc3333")), "Failed prediction must not produce files");

    const imageMeta = JSON.parse(fs.readFileSync(path.join(outputDir, "aaaa1111aaaa1111aaaa1111aaaa1111.json"), "utf8"));
    assert.equal(imageMeta.source, "wavespeed");
    assert.equal(imageMeta.kind, "image");
    assert.equal(imageMeta.imported_via, "wave-history");
    assert.equal(imageMeta.prediction_id, "aaaa1111aaaa1111aaaa1111aaaa1111");
    assert.equal(imageMeta.generated_at, "2026-07-15T10:00:00Z");

    const videoMeta = JSON.parse(fs.readFileSync(path.join(outputDir, "bbbb2222bbbb2222bbbb2222bbbb2222.json"), "utf8"));
    assert.equal(videoMeta.kind, "video", "wan-2.5 text-to-video must be recorded as video");
  } finally {
    removeDir(outputDir);
  }
});

test("wave-history --upload skips predictions already downloaded locally", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-history-dedup-"));
  try {
    fs.writeFileSync(path.join(outputDir, "aaaa1111aaaa1111aaaa1111aaaa1111.png"), "pre-existing");

    const result = runCli(
      ["tools/history.js", "--upload"],
      {
        WAVESPEED_KEY: "test-key",
        WAVESPEED_SMOKE_TEST: "1",
        WAVESPEED_PATH: outputDir,
        NODE_ENV: "test"
      }
    );

    assert.match(result.stdout, /already downloaded locally/);
    assert.match(result.stdout, /1 skipped as duplicates/);
    const files = fs.readdirSync(outputDir);
    assert(!files.includes("aaaa1111aaaa1111aaaa1111aaaa1111.json"), "Skipped prediction must not get a sidecar");
    assert(files.includes("bbbb2222bbbb2222bbbb2222bbbb2222.mp4"), "Non-duplicate prediction should still be processed");
    assert.equal(
      fs.readFileSync(path.join(outputDir, "aaaa1111aaaa1111aaaa1111aaaa1111.png"), "utf8"),
      "pre-existing",
      "Pre-existing file must not be overwritten"
    );
  } finally {
    removeDir(outputDir);
  }
});

test("wave-replay reconstructs imagine command from xai sidecar", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-replay-xai-"));
  try {
    const sidecar = path.join(tmpDir, "xai_1.json");
    fs.writeFileSync(sidecar, JSON.stringify({
      source: "xai",
      kind: "image",
      model: "grok-imagine-image-quality",
      model_key: "grok-imagine-image-quality",
      prompt: "a glossy portrait",
      aspect_ratio: "1:2",
      resolution: "1k",
      n: 1,
      image_index: 2,
      requested_n: 3
    }));

    const result = runCli(["tools/replay.js", sidecar]);
    const out = result.stdout.trim();
    assert.match(out, /^imagine /);
    assert.match(out, /--model grok-imagine-image-quality/);
    assert.match(out, /--prompt 'a glossy portrait'/);
    assert.match(out, /--n 1/, "Replay should reproduce ONE image, not the original --n 3");
    assert.match(out, /--format 1:2/);
    assert.match(out, /--resolution 1k/);
  } finally {
    removeDir(tmpDir);
  }
});
