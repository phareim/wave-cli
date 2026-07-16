import { DEFAULT_FORMAT } from "./config.js";

/**
 * Build parameters for a Wavespeed API request
 * @param {string} category - The model category (e.g., 'text-to-image', 'image-to-image')
 * @param {Object} options - User-provided options from CLI
 * @param {Object} [modelMetadata] - Optional model metadata for endpoint-specific quirks
 * @returns {Object} - Input parameters for the Wavespeed API
 */
export function buildParameters(category, options, modelMetadata = {}) {
  const params = { prompt: options.prompt };

  if (category === "text-to-image" && !modelMetadata.noSize) {
    params.size = options.size || DEFAULT_FORMAT;
  }

  if (category === "image-to-image") {
    if (!options.images || !Array.isArray(options.images) || options.images.length === 0) {
      throw new Error("image-to-image models require at least one input image. Use --images <url1> <url2> ...");
    }
    if (modelMetadata.singleImageInput) {
      params.image = options.images[0];
    } else {
      params.images = options.images;
    }
    if (options.size) params.size = options.size;
  }

  if (category === "image-to-video") {
    if (!options.images || !Array.isArray(options.images) || options.images.length === 0) {
      throw new Error("image-to-video models require at least one input image. Use --images <url1> <url2> ...");
    }
    params.images = options.images;
  }

  if (category === "text-to-video" || category === "image-to-video") {
    if (options.duration !== undefined) params.duration = parseInt(options.duration, 10);
    if (options.audio) params.audio = options.audio;
    if (options.promptExpansion) params.enable_prompt_expansion = true;
  }

  if (options.negativePrompt) params.negative_prompt = options.negativePrompt;
  if (options.seed !== undefined && options.seed !== null && !modelMetadata.noSeed) {
    params.seed = parseInt(options.seed, 10);
  }
  if (options.aspectRatio) params.aspect_ratio = options.aspectRatio;
  if (options.resolution) {
    params.resolution = options.resolution;
  } else if (modelMetadata.defaultResolution) {
    params.resolution = modelMetadata.defaultResolution;
  }
  if (options.outputFormat) params.output_format = options.outputFormat;
  if (options.quality) {
    params.quality = options.quality;
  } else if (modelMetadata.defaultQuality) {
    params.quality = modelMetadata.defaultQuality;
  }

  return params;
}
