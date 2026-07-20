// The ~/prompts pool: env-file loading and prompt-file collection shared by
// random-art. tools/diem-burner.mjs intentionally keeps its own byte-identical
// copies of loadEnvFile/collectPromptFiles — it spends real money unattended
// on a nightly timer, so do not migrate it here without a supervised run.

import { readFile, readdir } from "fs/promises";
import path from "path";

// KEY=value env file; never overrides vars already in the environment.
export async function loadEnvFile(file) {
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

// Directories that never hold usable prompts: the archive, the output dump,
// the shorts, and repo plumbing.
export const EXCLUDED_DIRS = new Set(["old", "short", "images", "node_modules"]);

export async function collectPromptFiles(dir) {
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

/** Fisher–Yates, in place; returns the array for chaining. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
