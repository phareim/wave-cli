// random-art dispatcher tests. Two seams keep these hermetic:
//   HOME=<tmpdir>          redirects the prompt pool and the env file
//   RANDOM_ART_CHILD=<js>  replaces the spawned venice/wavespeed script
// The HOME seam is POSIX-only (os.homedir() reads $HOME) — fine, the repo
// targets Linux.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile, collectPromptFiles } from "../lib/prompt-pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const runArt = (args, env = {}) => {
  const result = spawnSync("node", [path.join(repoRoot, "tools/random-art.mjs"), ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VENICE_API_TOKEN: "",
      WAVESPEED_KEY: "",
      VENICE_SMOKE_TEST: "",
      WAVESPEED_SMOKE_TEST: "",
      RANDOM_ART_CHILD: "",
      DIEM_BURNER_FORMATS: "",
      ...env,
    },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
};

// Fake HOME with a three-file pool plus everything the collector must skip.
const makeHome = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "random-art-home-"));
  const prompts = path.join(home, "prompts");
  fs.mkdirSync(path.join(prompts, "chroma"), { recursive: true });
  fs.mkdirSync(path.join(prompts, "old"), { recursive: true });
  fs.mkdirSync(path.join(prompts, ".hidden"), { recursive: true });
  fs.writeFileSync(path.join(prompts, "alpha.txt"), "alpha prompt line\nsecond line\n");
  fs.writeFileSync(path.join(prompts, "chroma", "beta.txt"), "beta prompt line\n");
  fs.writeFileSync(path.join(prompts, "chroma", "gamma.txt"), "gamma prompt line\n");
  fs.writeFileSync(path.join(prompts, "old", "excluded.txt"), "archived\n");
  fs.writeFileSync(path.join(prompts, ".hidden", "dot.txt"), "hidden\n");
  fs.writeFileSync(path.join(prompts, "notes.md"), "not a prompt\n");
  return home;
};

const removeDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });

const writeChildFixture = (dir, exitCode) => {
  const file = path.join(dir, `child-exit-${exitCode}.mjs`);
  fs.writeFileSync(file, `process.exit(${exitCode});\n`);
  return file;
};

test("collectPromptFiles recurses and applies the exclusion rules", async () => {
  const home = makeHome();
  try {
    const files = await collectPromptFiles(path.join(home, "prompts"));
    const names = files.map((f) => path.basename(f)).sort();
    assert.deepEqual(names, ["alpha.txt", "beta.txt", "gamma.txt"]);
  } finally {
    removeDir(home);
  }
});

test("loadEnvFile parses export lines and never overrides the environment", async () => {
  const home = makeHome();
  const envFile = path.join(home, "env");
  fs.writeFileSync(envFile, `# comment\nexport RA_TEST_A="from-file"\nRA_TEST_B=bare\n`);
  process.env.RA_TEST_A = "preset";
  delete process.env.RA_TEST_B;
  try {
    await loadEnvFile(envFile);
    assert.equal(process.env.RA_TEST_A, "preset");
    assert.equal(process.env.RA_TEST_B, "bare");
  } finally {
    delete process.env.RA_TEST_A;
    delete process.env.RA_TEST_B;
    removeDir(home);
  }
});

test("--dry-run resolves the venice default command", () => {
  const home = makeHome();
  try {
    const result = runArt(["--dry-run"], { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pool of 3/);
    assert.match(result.stdout, /prompt line/);
    assert.match(result.stdout, /venice\/index\.js/);
    assert.match(result.stdout, /--resolution 1K/);
    assert.match(result.stdout, /--aiwdm-tags random-art/);
  } finally {
    removeDir(home);
  }
});

test("--dry-run --wave routes to wavespeed with lowercase 1k", () => {
  const home = makeHome();
  try {
    const result = runArt(["--dry-run", "--wave"], { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wavespeed\/index\.js/);
    assert.match(result.stdout, /--resolution 1k /);
  } finally {
    removeDir(home);
  }
});

test("--dry-run --gpt switches to gpt-image-2 at low quality", () => {
  const home = makeHome();
  try {
    const result = runArt(["--dry-run", "--gpt"], { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gpt-image-2/);
    assert.match(result.stdout, /--quality low/);
  } finally {
    removeDir(home);
  }
});

test("--count 3 --dry-run picks three distinct prompt files", () => {
  const home = makeHome();
  try {
    const result = runArt(["--count", "3", "--dry-run"], { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /generation 1\/3/);
    assert.match(result.stdout, /generation 2\/3/);
    assert.match(result.stdout, /generation 3\/3/);
    const picks = [...result.stdout.matchAll(/--prompt (\S+)/g)].map((m) => m[1]);
    assert.equal(picks.length, 3);
    assert.equal(new Set(picks).size, 3, "expected shuffle-without-replacement");
  } finally {
    removeDir(home);
  }
});

test("--prompt pins the file; a missing file fails fast", () => {
  const home = makeHome();
  try {
    const pinned = path.join(home, "prompts", "alpha.txt");
    const ok = runArt(["--prompt", pinned, "--dry-run"], { HOME: home });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /alpha\.txt/);
    assert.doesNotMatch(ok.stdout, /pool of/);

    const missing = runArt(["--prompt", path.join(home, "nope.txt"), "--dry-run"], { HOME: home });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /not readable/);
  } finally {
    removeDir(home);
  }
});

test("--list prints the pool and applies exclusions", () => {
  const home = makeHome();
  try {
    const result = runArt(["--list"], { HOME: home });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /3 prompt files/);
    assert.match(result.stdout, /alpha\.txt/);
    assert.match(result.stdout, /chroma\/beta\.txt/);
    assert.doesNotMatch(result.stdout, /excluded\.txt/);
    assert.doesNotMatch(result.stdout, /notes\.md/);
  } finally {
    removeDir(home);
  }
});

test("empty pool and missing prompt dir fail with distinct messages", () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "random-art-empty-"));
  fs.mkdirSync(path.join(emptyHome, "prompts"));
  const bareHome = fs.mkdtempSync(path.join(os.tmpdir(), "random-art-bare-"));
  try {
    const empty = runArt(["--dry-run"], { HOME: emptyHome });
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /no \.txt prompt files/);

    const bare = runArt(["--dry-run"], { HOME: bareHome });
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /does not exist/);
  } finally {
    removeDir(emptyHome);
    removeDir(bareHome);
  }
});

test("bad flags are rejected", () => {
  const home = makeHome();
  try {
    assert.notEqual(runArt(["--bogus"], { HOME: home }).status, 0);
    assert.notEqual(runArt(["--format"], { HOME: home }).status, 0);
    const badName = runArt(["--format", "gigantic", "--dry-run"], { HOME: home });
    assert.equal(badName.status, 1);
    assert.match(badName.stderr, /unknown named format/);
    const badCount = runArt(["--count", "abc"], { HOME: home });
    assert.notEqual(badCount.status, 0);
    assert.match(badCount.stderr, /positive integer/);
  } finally {
    removeDir(home);
  }
});

test("missing API key fails preflight before any generation", () => {
  const home = makeHome();
  try {
    const venice = runArt([], { HOME: home });
    assert.equal(venice.status, 1);
    assert.match(venice.stderr, /VENICE_API_TOKEN/);
    assert.match(venice.stderr, /diem-burner\/env/);

    const wave = runArt(["--wave"], { HOME: home });
    assert.equal(wave.status, 1);
    assert.match(wave.stderr, /WAVESPEED_KEY/);
  } finally {
    removeDir(home);
  }
});

test("end-to-end venice smoke run saves image + sidecar from the pinned prompt", () => {
  const home = makeHome();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "random-art-out-"));
  try {
    const result = runArt(["--prompt", path.join(home, "prompts", "alpha.txt")], {
      HOME: home,
      VENICE_API_TOKEN: "test-token",
      VENICE_SMOKE_TEST: "1",
      VENICE_PATH: outputDir,
      NODE_ENV: "test",
    });
    assert.equal(result.status, 0, result.stderr);

    const files = fs.readdirSync(outputDir);
    const image = files.find((f) => f.startsWith("venice_") && f.endsWith(".png"));
    assert(image, "expected venice output file");
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(outputDir, image.replace(/\.png$/, ".json")), "utf8"),
    );
    assert.match(sidecar.prompt, /alpha prompt line/);
  } finally {
    removeDir(home);
    removeDir(outputDir);
  }
});

test("--count continues past failures and exits 1", () => {
  const home = makeHome();
  try {
    const child = writeChildFixture(home, 1);
    const result = runArt(["--count", "3"], { HOME: home, RANDOM_ART_CHILD: child });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /generation 3\/3/);
    assert.match(result.stdout, /3 failed/);
  } finally {
    removeDir(home);
  }
});

test("moderation exit 2 skips within a batch but propagates for a single run", () => {
  const home = makeHome();
  try {
    const child = writeChildFixture(home, 2);
    const batch = runArt(["--count", "2"], { HOME: home, RANDOM_ART_CHILD: child });
    assert.equal(batch.status, 0, batch.stderr);
    assert.match(batch.stdout, /2 blocked/);
    assert.match(batch.stdout, /0 failed/);
    assert.match(batch.stderr, /moderation/);

    const single = runArt([], { HOME: home, RANDOM_ART_CHILD: child });
    assert.equal(single.status, 2);
  } finally {
    removeDir(home);
  }
});
