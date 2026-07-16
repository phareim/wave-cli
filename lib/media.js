// Shared file I/O: output-directory resolution, media saving, metadata
// sidecars, and URL-based downloads. Each generator passes its own dir spec
// ({ envVar, defaultDir }) so the per-service output conventions stay intact.

import { promises as fs } from "fs";
import path from "path";
import * as ui from "./ui.js";

/**
 * Resolve the output directory for a generator.
 * @param {{envVar: string, defaultDir: string}} spec - e.g. { envVar: "VENICE_PATH", defaultDir: "images/venice" }
 * @param {boolean} localOverride - --out: force the cwd default, ignoring the env var
 */
export const resolveOutDir = ({ envVar, defaultDir }, localOverride = false) => {
  const fallback = path.resolve(process.cwd(), defaultDir);
  if (localOverride) return fallback;
  return process.env[envVar] ? path.resolve(process.env[envVar]) : fallback;
};

export const saveMedia = async (buffer, fileName, dirSpec, localOverride = false) => {
  const outDir = resolveOutDir(dirSpec, localOverride);
  const filePath = path.join(outDir, fileName);
  await fs.mkdir(outDir, { recursive: true });
  try {
    await fs.writeFile(filePath, buffer);
    ui.saved(filePath);
    return filePath;
  } catch (error) {
    ui.err(`Failed to save ${filePath}: ${error.message}`);
    return null;
  }
};

const pruneEmpty = (obj) => {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.length === 0) continue;
    out[key] = value;
  }
  return out;
};

/**
 * Write a metadata sidecar next to a media file (local fallback for --local
 * and smoke mode; the default path uploads the blob to aiwdm instead).
 */
export const saveMetadata = async (mediaFilePath, metadata) => {
  if (!mediaFilePath) return null;
  const parsed = path.parse(mediaFilePath);
  const sidecarPath = path.join(parsed.dir, `${parsed.name}.json`);
  try {
    await fs.writeFile(sidecarPath, JSON.stringify(pruneEmpty(metadata), null, 2) + "\n");
    ui.saved(sidecarPath);
    return sidecarPath;
  } catch (error) {
    ui.err(`Failed to save metadata to ${sidecarPath}: ${error.message}`);
    return null;
  }
};

export const getFileNameFromUrl = (url, predictionId = null) => {
  const fileName = new URL(url).pathname.split("/").pop();
  if (predictionId) {
    const extension = fileName.split(".").pop() || "jpeg";
    return `${predictionId}.${extension}`;
  }
  return fileName || `wavespeed_${Date.now()}.png`;
};

/**
 * Download output URLs and save them via saveMedia. When mockBuffer is set
 * (smoke mode) the network is skipped entirely.
 */
export const fetchOutputs = async (urls, dirSpec, { localOverride = false, predictionId = null, mockBuffer = null } = {}) => {
  try {
    const downloads = urls.map(async (url, index) => {
      const baseFileName = getFileNameFromUrl(url, predictionId);
      const fileName = urls.length > 1 && predictionId
        ? baseFileName.replace(/\.(\w+)$/, `_${index}.$1`)
        : baseFileName;

      if (mockBuffer) return saveMedia(mockBuffer, fileName, dirSpec, localOverride);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return saveMedia(buffer, fileName, dirSpec, localOverride);
    });
    return (await Promise.all(downloads)).filter(Boolean);
  } catch (error) {
    ui.err(`Error fetching outputs: ${error.message}`);
    return [];
  }
};
