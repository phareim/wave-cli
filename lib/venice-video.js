// Shared Venice video API core (used by venice-video and wan2.6-flash):
// queue → poll /video/retrieve until the response turns into video/mp4 binary.

import { promises as fs } from "fs";
import path from "path";
import * as ui from "./ui.js";
import { saveMedia } from "./media.js";

const VENICE_API_BASE = "https://api.venice.ai/api/v1";
const SMOKE_MODE = process.env.VENICE_SMOKE_TEST === "1";

export const VIDEO_DIR_SPEC = { envVar: "VENICE_VIDEO_PATH", defaultDir: "videos/venice" };

const authHeaders = (extra = {}) => ({
  Authorization: `Bearer ${process.env.VENICE_API_TOKEN}`,
  ...extra,
});

export const queueJob = async (body) => {
  if (SMOKE_MODE) return { queue_id: "smoke-queue-id", model: body.model };

  const res = await fetch(`${VENICE_API_BASE}/video/queue`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Queue failed (${res.status}): ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Queue returned non-JSON: ${text}`);
  }
};

const retrieveJob = async (model, queueId, debug) => {
  if (SMOKE_MODE) return { done: true, buffer: Buffer.from("mock venice video mp4") };

  const res = await fetch(`${VENICE_API_BASE}/video/retrieve`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ model, queue_id: queueId }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Retrieve failed (${res.status}): ${errText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.startsWith("video/")) {
    return { done: true, buffer: Buffer.from(await res.arrayBuffer()) };
  }

  const payload = await res.json();
  if (debug) console.log("Retrieve status:", JSON.stringify(payload));
  return { done: false, status: payload };
};

/** Poll until the retrieve endpoint returns binary video; renders a live spinner with the API's ETA. */
export const pollUntilReady = async (model, queueId, { interval = 5000, maxAttempts = 360, debug = false } = {}) => {
  const spin = ui.spinner("rendering");
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await retrieveJob(model, queueId, debug);
      if (result.done) {
        spin.succeed(`rendered in ${ui.fmtDuration(spin.elapsed())}`);
        return result.buffer;
      }
      const avg = result.status?.average_execution_time;
      if (avg) spin.note(`(est. ${Math.round(avg / 1000)}s)`);
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error("Polling timeout: video generation took too long");
  } catch (error) {
    spin.fail();
    throw error;
  }
};

export const saveVideo = (buffer, fileName, localOverride) =>
  saveMedia(buffer, fileName, VIDEO_DIR_SPEC, localOverride);

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const isHttpUrl = (s) => /^https?:\/\//i.test(s);

/** Accept a local image path or https URL; local files inline as a base64 data URI. */
export const resolveImageInput = async (input) => {
  if (!input) throw new Error("An image path or URL is required.");
  if (isHttpUrl(input)) return input;

  const abs = path.resolve(process.cwd(), input);
  let buf;
  try {
    buf = await fs.readFile(abs);
  } catch (err) {
    throw new Error(`Could not read image at ${abs}: ${err.message}`);
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported image extension: ${ext || "(none)"} — use png, jpg, jpeg, webp, or gif.`);
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
};
