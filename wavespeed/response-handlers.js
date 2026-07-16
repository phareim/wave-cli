import * as ui from "../lib/ui.js";
import { fetchOutputs } from "../lib/media.js";

const DIR_SPEC = { envVar: "WAVESPEED_PATH", defaultDir: "images" };
const SMOKE_MODE = process.env.WAVESPEED_SMOKE_TEST === "1";

/**
 * Handle a completed Wavespeed prediction: download every output URL.
 * @param {Object} result - API response from Wavespeed
 * @param {string} category - Model category (e.g., 'text-to-image')
 * @param {boolean} localOverride - Save to current directory (--out)
 * @returns {Promise<{ok: boolean, savedPaths: string[]}>}
 */
export async function handleResponse(result, category, localOverride = false) {
  try {
    if (result.status === "failed") {
      ui.err(`Generation failed: ${result.error || "Unknown error"}`);
      return { ok: false, savedPaths: [] };
    }

    if (result && Array.isArray(result.outputs) && result.outputs.length > 0) {
      const savedPaths = await fetchOutputs(result.outputs, DIR_SPEC, {
        localOverride,
        predictionId: result.id,
        mockBuffer: SMOKE_MODE ? Buffer.from("mock wavespeed image") : null,
      });
      return { ok: true, savedPaths };
    }

    if (result.status === "processing" || result.status === "created") {
      ui.warn("Generation is still processing. Please check back later.");
      if (result.id) console.log(`Prediction ID: ${result.id}`);
      return { ok: true, savedPaths: [] };
    }

    ui.err("No outputs found in response");
    return { ok: false, savedPaths: [] };
  } catch (error) {
    ui.err(`Error handling response: ${error.message}`);
    return { ok: false, savedPaths: [] };
  }
}
