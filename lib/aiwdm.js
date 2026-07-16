// Shared aiwdm media-library integration: upload shell-out plus the common
// "sidecar locally or upload with metadata" publishing flow every generator
// runs after saving its outputs.

import { promises as fs, existsSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import * as ui from "./ui.js";
import { saveMetadata } from "./media.js";

export const slugifyModelTag = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const resolveAiwdmDir = () => {
  const candidates = [
    process.env.AIWDM_CLI_DIR,
    path.join(os.homedir(), "github/petter/aiwdm/cli"),
    path.join(os.homedir(), "github/aiwdm/cli"),
    "/home/petter/github/aiwdm/cli",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
};

export const uploadToAiwdm = async (filePath, { prompt, rating, tags, metadata }) => {
  const args = ["upload", filePath];
  if (rating) args.push("--rating", rating);
  if (tags && tags.length) args.push("--tags", tags.join(","));
  if (prompt) args.push("--prompt", prompt);

  // Metadata is forwarded as a temp JSON file: shell-escaping a multi-KB JSON
  // blob is brittle, and aiwdm reads the file as the system of record now that
  // wave-cli no longer writes a local sidecar by default.
  let metadataDir;
  if (metadata) {
    metadataDir = await fs.mkdtemp(path.join(os.tmpdir(), "wave-meta-"));
    const metadataPath = path.join(metadataDir, "metadata.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    args.push("--metadata-file", metadataPath);
  }

  try {
    await new Promise((resolve) => {
      // cwd anchors the env lookup: aiwdm loads .env from cwd first.
      const cwd = resolveAiwdmDir();
      const proc = spawn("aiwdm", args, { stdio: "inherit", ...(cwd ? { cwd } : {}) });
      proc.on("error", (err) => {
        ui.err(`aiwdm upload failed: ${err.message}`);
        resolve();
      });
      proc.on("close", (code) => {
        if (code !== 0) ui.err(`aiwdm exited with code ${code}`);
        resolve();
      });
    });
  } finally {
    if (metadataDir) {
      try { await fs.rm(metadataDir, { recursive: true, force: true }); } catch {}
    }
  }
};

/**
 * Publish saved outputs: upload each to aiwdm with the metadata blob attached,
 * or fall back to local sidecars when the upload is skipped (--local / smoke).
 *
 * @param {string[]} savedPaths - files written by the generator
 * @param {object|null} metadata - the flat metadata blob (null when --no-metadata)
 * @param {object} opts
 * @param {string} opts.sourceTag - "venice" | "wavespeed" | "venice-video" | "xai"
 * @param {string} opts.modelTag - pre-slugified model identifier for tagging
 * @param {string} opts.prompt - forwarded as the aiwdm description
 * @param {object} opts.options - parsed CLI options (local, aiwdmRating, aiwdmTags)
 * @param {boolean} opts.smoke - smoke-test mode (forces the sidecar fallback)
 */
export const publishOutputs = async (savedPaths, metadata, { sourceTag, modelTag, prompt, options, smoke }) => {
  if (!savedPaths.length) return;
  const perFile = (savedPath) =>
    metadata ? { ...metadata, output_file: path.basename(savedPath) } : null;

  const willUpload = !options.local && !smoke;
  if (!willUpload) {
    if (metadata) {
      for (const savedPath of savedPaths) await saveMetadata(savedPath, perFile(savedPath));
    }
    return;
  }

  const extraTags = options.aiwdmTags
    ? options.aiwdmTags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const tags = [...new Set([sourceTag, slugifyModelTag(modelTag), ...extraTags].filter(Boolean))];
  ui.upload(`aiwdm · ${tags.join(", ")}`);
  for (const savedPath of savedPaths) {
    await uploadToAiwdm(savedPath, {
      prompt,
      rating: options.aiwdmRating,
      tags,
      metadata: perFile(savedPath),
    });
  }
};
