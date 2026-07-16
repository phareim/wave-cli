/**
 * Wavespeed.ai model endpoints and metadata
 */

export const modelEndpoints = {
  "flux-2-flex": "wavespeed-ai/flux-2-flex/text-to-image",
  "flux2": "wavespeed-ai/flux-2-flex/text-to-image",
  "flex": "wavespeed-ai/flux-2-flex/text-to-image",
  "z-wave": "wavespeed-ai/z-image/turbo",
  "z-image-turbo": "wavespeed-ai/z-image/turbo",
  "z-image": "wavespeed-ai/z-image/turbo",
  "turbo": "wavespeed-ai/z-image/turbo",
  "z-image-turbo-i2i": "wavespeed-ai/z-image-turbo/image-to-image",
  "z-image-turbo-edit": "wavespeed-ai/z-image-turbo/image-to-image",
  "z-turbo-i2i": "wavespeed-ai/z-image-turbo/image-to-image",
  "turbo-i2i": "wavespeed-ai/z-image-turbo/image-to-image",
  "turbo-edit": "wavespeed-ai/z-image-turbo/image-to-image",
  "seedream-v5-pro": "bytedance/seedream-v5.0-pro",
  "seedream-v5": "bytedance/seedream-v5.0-pro",
  "seedream-pro": "bytedance/seedream-v5.0-pro",
  "v5-pro": "bytedance/seedream-v5.0-pro",
  "v5": "bytedance/seedream-v5.0-pro",
  "seedream-v5-lite": "bytedance/seedream-v5.0-lite",
  "v5-lite": "bytedance/seedream-v5.0-lite",
  "seedream-v5-lite-edit": "bytedance/seedream-v5.0-lite/edit",
  "v5-lite-edit": "bytedance/seedream-v5.0-lite/edit",
  "seedream-v5-lite-sequential": "bytedance/seedream-v5.0-lite/sequential",
  "v5-lite-seq": "bytedance/seedream-v5.0-lite/sequential",
  "seedream-v5-lite-edit-sequential": "bytedance/seedream-v5.0-lite/edit-sequential",
  "v5-lite-edit-seq": "bytedance/seedream-v5.0-lite/edit-sequential",
  "seedream-v4.5": "bytedance/seedream-v4.5",
  "seedream-v4.5-edit": "bytedance/seedream-v4.5/edit",
  "seedream-v4.5-sequential": "bytedance/seedream-v4.5/sequential",
  "seedream-v4.5-edit-sequential": "bytedance/seedream-v4.5/edit-sequential",
  "seedream-v4": "bytedance/seedream-v4",
  "seedream-v4-edit": "bytedance/seedream-v4/edit",
  "seedream-v3.1": "bytedance/seedream-v3.1",
  "seedream": "bytedance/seedream-v4.5",
  "seedream-edit": "bytedance/seedream-v4.5/edit",
  "seedream-sequential": "bytedance/seedream-v4.5/sequential",
  "seedream-edit-sequential": "bytedance/seedream-v4.5/edit-sequential",
  "v4.5": "bytedance/seedream-v4.5",
  "v4.5-edit": "bytedance/seedream-v4.5/edit",
  "v4.5-seq": "bytedance/seedream-v4.5/sequential",
  "v4.5-edit-seq": "bytedance/seedream-v4.5/edit-sequential",
  "v4": "bytedance/seedream-v4",
  "v4-edit": "bytedance/seedream-v4/edit",
  "v3.1": "bytedance/seedream-v3.1",
  "wan-2.5": "alibaba/wan-2.5/text-to-image",
  "wan2.5": "alibaba/wan-2.5/text-to-image",
  "wan": "alibaba/wan-2.5/text-to-image",
  "wan-2.5-edit": "alibaba/wan-2.5/image-edit",
  "wan-edit": "alibaba/wan-2.5/image-edit",
  "wan2.5-edit": "alibaba/wan-2.5/image-edit",
  "wan-2.7-t2v": "alibaba/wan-2.7/text-to-video",
  "wan2.7-t2v": "alibaba/wan-2.7/text-to-video",
  "wan-t2v": "alibaba/wan-2.7/text-to-video",
  "wan-video": "alibaba/wan-2.7/text-to-video",
  "wan-2.7-i2v": "alibaba/wan-2.7/image-to-video",
  "wan2.7-i2v": "alibaba/wan-2.7/image-to-video",
  "wan-i2v": "alibaba/wan-2.7/image-to-video",
  "wan-2.7-r2v": "alibaba/wan-2.7/reference-to-video",
  "wan2.7-r2v": "alibaba/wan-2.7/reference-to-video",
  "wan-r2v": "alibaba/wan-2.7/reference-to-video",
  "nano-banana-pro-edit": "google/nano-banana-pro/edit",
  "nano-edit": "google/nano-banana-pro/edit",
  "banana-edit": "google/nano-banana-pro/edit",
  "gemini-edit": "google/nano-banana-pro/edit",
  "grok-2-image": "x-ai/grok-2-image",
  "grok2": "x-ai/grok-2-image",
  "grok": "x-ai/grok-2-image",
  "sdxl": "stability-ai/sdxl",
  "stable-diffusion-xl": "stability-ai/sdxl",
  "chroma": "wavespeed-ai/chroma",
  "cogview-4": "z-ai/cogview-4",
  "cogview": "z-ai/cogview-4",
  "cog4": "z-ai/cogview-4",
  "kling-image-o1": "kwaivgi/kling-image-o1",
  "kling-image": "kwaivgi/kling-image-o1",
  "kling-o1": "kwaivgi/kling-image-o1",
  "kling": "kwaivgi/kling-image-o1",
  "gpt-image-2": "openai/gpt-image-2/text-to-image",
  "gpt-image": "openai/gpt-image-2/text-to-image",
  "gpt2": "openai/gpt-image-2/text-to-image",
  "gpt": "openai/gpt-image-2/text-to-image",
};

export const allModels = [
  {
    endpoint_id: "wavespeed-ai/flux-2-flex/text-to-image",
    metadata: {
      display_name: "FLUX.2 [flex]",
      category: "text-to-image",
      description: "Fast, flexible text-to-image generation with enhanced realism, sharper text rendering, and built-in editing. No cold start delays.",
      status: "live",
      tags: ["flux", "text-to-image", "flex", "fast", "realistic"],
      model_url: "https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-2-flex/text-to-image",
      defaultSize: "1536*1536",
      maxWidth: 1536,
      maxHeight: 1536,
    }
  },
  {
    endpoint_id: "wavespeed-ai/z-image/turbo",
    metadata: {
      display_name: "Z-Image-Turbo",
      category: "text-to-image",
      description: "6 billion parameter text-to-image model that generates photorealistic images in sub-second time. Best performance, no coldstarts, affordable pricing.",
      status: "live",
      tags: ["wavespeed", "text-to-image", "turbo", "fast", "6b"],
      model_url: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
      maxWidth: 1536,
      maxHeight: 1536,
    }
  },
  {
    endpoint_id: "wavespeed-ai/z-image-turbo/image-to-image",
    metadata: {
      display_name: "Z-Image-Turbo Image-to-Image",
      category: "image-to-image",
      description: "6 billion parameter image-to-image model that transforms reference images in sub-second time. Best performance, no coldstarts, affordable pricing.",
      status: "live",
      tags: ["wavespeed", "image-to-image", "turbo", "fast", "6b"],
      model_url: "https://wavespeed.ai/models/wavespeed-ai/z-image-turbo/image-to-image",
      maxWidth: 1536,
      maxHeight: 1536,
      singleImageInput: true,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v5.0-pro",
    metadata: {
      display_name: "Seedream v5.0 Pro",
      category: "text-to-image",
      description: "ByteDance Seedream 5.0 Pro — flagship text-to-image with strong prompt following, aspect-ratio selection, and 1k/2k output tiers. Takes aspect_ratio + resolution, no size or seed.",
      status: "live",
      tags: ["bytedance", "text-to-image", "pro", "v5"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v5.0-pro",
      noSize: true,
      noSeed: true,
      defaultResolution: "1k",
    }
  },
  {
    endpoint_id: "bytedance/seedream-v5.0-lite",
    metadata: {
      display_name: "Seedream v5.0 Lite",
      category: "text-to-image",
      description: "ByteDance Seedream 5.0 Lite — lightweight text-to-image with enhanced typography, sharp text rendering for posters/brand visuals, strong prompt adherence, up to 4K.",
      status: "live",
      tags: ["bytedance", "text-to-image", "lite", "4k", "v5"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v5.0-lite",
      defaultSize: "2048*2048",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v5.0-lite/edit",
    metadata: {
      display_name: "Seedream v5.0 Lite Edit",
      category: "image-to-image",
      description: "ByteDance Seedream 5.0 Lite Edit — lightweight image editing accepting up to 10 reference images for complex multi-figure edits, output up to 4K.",
      status: "live",
      tags: ["bytedance", "image-to-image", "edit", "lite", "v5"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v5.0-lite/edit",
      defaultSize: "2048*2048",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v5.0-lite/sequential",
    metadata: {
      display_name: "Seedream v5.0 Lite Sequential",
      category: "text-to-image",
      description: "ByteDance Seedream 5.0 Lite Sequential — generates a coherent series of images from one prompt with consistent character identity and style, up to 4K.",
      status: "live",
      tags: ["bytedance", "text-to-image", "sequential", "lite", "v5"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v5.0-lite/sequential",
      defaultSize: "2048*2048",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v5.0-lite/edit-sequential",
    metadata: {
      display_name: "Seedream v5.0 Lite Edit Sequential",
      category: "image-to-image",
      description: "ByteDance Seedream 5.0 Lite Edit Sequential — multi-image editing with locked character/object identity across the full sequence, up to 4K.",
      status: "live",
      tags: ["bytedance", "image-to-image", "edit", "sequential", "lite", "v5"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v5.0-lite/edit-sequential",
      defaultSize: "2048*2048",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4.5",
    metadata: {
      display_name: "Seedream v4.5",
      category: "text-to-image",
      description: "Seedream 4.5 by ByteDance - crisp text rendering, strong prompt adherence, up to 8K output.",
      status: "live",
      tags: ["bytedance", "text-to-image", "8k", "latest"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4.5",
      defaultSize: "2048*2048",
      maxWidth: 8192,
      maxHeight: 8192,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4.5/edit",
    metadata: {
      display_name: "Seedream v4.5 Edit",
      category: "image-to-image",
      description: "ByteDance Seedream 4.5 Edit preserves facial features, lighting, and color tone from reference images, delivering professional, high-fidelity edits up to 8K with strong prompt adherence.",
      status: "live",
      tags: ["bytedance", "image-to-image", "edit", "8k"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4.5/edit",
      defaultSize: "2048*2048",
      maxWidth: 8192,
      maxHeight: 8192,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4.5/sequential",
    metadata: {
      display_name: "Seedream v4.5 Sequential",
      category: "text-to-image",
      description: "Seedream 4.5 Sequential generates multi-image sets with consistent characters, palette, lighting, and style across outputs, up to 8K.",
      status: "live",
      tags: ["bytedance", "text-to-image", "sequential", "8k"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4.5/sequential",
      defaultSize: "2048*2048",
      maxWidth: 8192,
      maxHeight: 8192,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4.5/edit-sequential",
    metadata: {
      display_name: "Seedream v4.5 Edit Sequential",
      category: "image-to-image",
      description: "Seedream 4.5 Edit Sequential performs multi-image editing while locking character and object identity across shots, with up to 8K output.",
      status: "live",
      tags: ["bytedance", "image-to-image", "edit", "sequential", "8k"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4.5/edit-sequential",
      defaultSize: "2048*2048",
      maxWidth: 8192,
      maxHeight: 8192,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4",
    metadata: {
      display_name: "Seedream v4",
      category: "text-to-image",
      description: "Seedream 4.0 by ByteDance is a state-of-the-art image generation model delivering high-fidelity outputs and outperforming Nano Banana.",
      status: "live",
      tags: ["bytedance", "text-to-image", "4k"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v4/edit",
    metadata: {
      display_name: "Seedream v4 Edit",
      category: "image-to-image",
      description: "ByteDance's state-of-the-art image editing model that outperforms Nano Banana in fidelity and edit quality. Ready-to-use REST inference API, best performance, no coldstarts, affordable pricing.",
      status: "live",
      tags: ["bytedance", "image-to-image", "edit", "4k"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v4/edit",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "bytedance/seedream-v3.1",
    metadata: {
      display_name: "Seedream v3.1",
      category: "text-to-image",
      description: "Seedream V3.1 by ByteDance is a text-to-image model with upgraded visuals, stronger style fidelity, and rich detail from text prompts.",
      status: "live",
      tags: ["bytedance", "text-to-image"],
      model_url: "https://wavespeed.ai/models/bytedance/seedream-v3.1",
      defaultSize: "2048*2048",
      maxWidth: 2048,
      maxHeight: 2048,
    }
  },
  {
    endpoint_id: "alibaba/wan-2.5/text-to-image",
    metadata: {
      display_name: "WAN 2.5",
      category: "text-to-image",
      description: "Alibaba WAN 2.5 Text-to-Image turns text prompts into AI-generated images with the WAN 2.5 model for on-demand image creation.",
      status: "live",
      tags: ["alibaba", "text-to-image", "wan"],
      model_url: "https://wavespeed.ai/models/alibaba/wan-2.5/text-to-image",
      defaultSize: "1440*1440",
      maxWidth: 1440,
      maxHeight: 1440,
    }
  },
  {
    endpoint_id: "alibaba/wan-2.7/text-to-video",
    metadata: {
      display_name: "WAN 2.7 Text-to-Video",
      category: "text-to-video",
      description: "Alibaba WAN 2.7 text-to-video — up to 1080p, 2-15s clips, optional audio sync.",
      status: "live",
      tags: ["alibaba", "text-to-video", "wan", "1080p"],
      model_url: "https://wavespeed.ai/models/alibaba/wan-2.7/text-to-video",
    }
  },
  {
    endpoint_id: "alibaba/wan-2.7/image-to-video",
    metadata: {
      display_name: "WAN 2.7 Image-to-Video",
      category: "image-to-video",
      description: "Alibaba WAN 2.7 image-to-video — animates a reference image into a 2-15s clip at up to 1080p.",
      status: "live",
      tags: ["alibaba", "image-to-video", "wan", "1080p"],
      model_url: "https://wavespeed.ai/models/alibaba/wan-2.7/image-to-video",
    }
  },
  {
    endpoint_id: "alibaba/wan-2.7/reference-to-video",
    metadata: {
      display_name: "WAN 2.7 Reference-to-Video",
      category: "image-to-video",
      description: "Alibaba WAN 2.7 reference-to-video — up to 5 reference images to lock characters/objects across the generated clip.",
      status: "live",
      tags: ["alibaba", "image-to-video", "wan", "reference", "1080p"],
      model_url: "https://wavespeed.ai/models/alibaba/wan-2.7/reference-to-video",
    }
  },
  {
    endpoint_id: "alibaba/wan-2.5/image-edit",
    metadata: {
      display_name: "WAN 2.5 Edit",
      category: "image-to-image",
      description: "Refine existing visuals with Alibaba WAN 2.5 image-edit using prompt-driven adjustments and stylistic upgrades for photos and graphics.",
      status: "live",
      tags: ["alibaba", "image-to-image", "edit", "wan"],
      model_url: "https://wavespeed.ai/models/alibaba/wan-2.5/image-edit",
      maxWidth: 1440,
      maxHeight: 1440,
    }
  },
  {
    endpoint_id: "google/nano-banana-pro/edit",
    metadata: {
      display_name: "Nano Banana Pro Edit",
      category: "image-to-image",
      description: "Google Nano Banana Pro (Gemini 3.0 Pro Image) Edit enables image editing with 4K-capable output.",
      status: "live",
      tags: ["google", "image-to-image", "edit", "gemini", "4k"],
      model_url: "https://wavespeed.ai/models/google/nano-banana-pro/edit",
      maxWidth: 4096,
      maxHeight: 4096,
    }
  },
  {
    endpoint_id: "x-ai/grok-2-image",
    metadata: {
      display_name: "Grok 2 Image",
      category: "text-to-image",
      description: "xAI's latest image generation model converting simple text prompts into sharp, photorealistic visuals. Suitable for product photography, social media content, and conceptual artwork with close adherence to instructions.",
      status: "live",
      tags: ["x-ai", "text-to-image", "grok", "photorealistic", "fast"],
      model_url: "https://api.wavespeed.ai/api/v3/x-ai/grok-2-image",
      maxWidth: 1536,
      maxHeight: 1536,
    }
  },
  {
    endpoint_id: "stability-ai/sdxl",
    metadata: {
      display_name: "SDXL",
      category: "text-to-image",
      description: "Stable Diffusion XL - a text-to-image generator that creates beautiful, high-quality images.",
      status: "live",
      tags: ["stability-ai", "text-to-image", "sdxl", "stable-diffusion"],
      model_url: "https://api.wavespeed.ai/api/v3/stability-ai/sdxl",
      defaultSize: "1024*1024",
      maxWidth: 1536,
      maxHeight: 1536,
    }
  },
  {
    endpoint_id: "wavespeed-ai/chroma",
    metadata: {
      display_name: "Chroma",
      category: "text-to-image",
      description: "Uncensored image generation for creative expression and artistic freedom. No cold starts.",
      status: "live",
      tags: ["wavespeed", "text-to-image", "chroma", "uncensored"],
      model_url: "https://api.wavespeed.ai/api/v3/wavespeed-ai/chroma",
      defaultSize: "1536*1536",
      maxWidth: 1536,
      maxHeight: 1536,
    }
  },
  {
    endpoint_id: "z-ai/cogview-4",
    metadata: {
      display_name: "CogView-4",
      category: "text-to-image",
      description: "Zhipu AI's CogView-4 text-to-image model with HD quality support.",
      status: "live",
      tags: ["z-ai", "text-to-image", "cogview", "hd"],
      model_url: "https://api.wavespeed.ai/api/v3/z-ai/cogview-4",
      defaultSize: "1024*1024",
      fixedSizes: ["1024*1024", "768*1344", "864*1152", "1344*768", "1152*864", "1440*720", "720*1440"],
      supportsQuality: true,
      defaultQuality: "hd",
    }
  },
  {
    endpoint_id: "openai/gpt-image-2/text-to-image",
    metadata: {
      display_name: "GPT-Image-2",
      category: "text-to-image",
      description: "OpenAI GPT-Image-2 text-to-image — uses aspect_ratio + resolution (1k/2k/4k) and quality (low/medium/high). No size or seed parameters.",
      status: "live",
      tags: ["openai", "text-to-image", "gpt-image"],
      model_url: "https://api.wavespeed.ai/api/v3/openai/gpt-image-2/text-to-image",
      noSize: true,
      noSeed: true,
      defaultQuality: "low",
      defaultResolution: "1k",
    }
  },
  {
    endpoint_id: "kwaivgi/kling-image-o1",
    metadata: {
      display_name: "Kling Image O1",
      category: "text-to-image",
      description: "Kuaishou's Kling Image O1 model with reference image support and up to 2K resolution.",
      status: "live",
      tags: ["kuaishou", "kling", "text-to-image", "2k"],
      model_url: "https://api.wavespeed.ai/api/v3/kwaivgi/kling-image-o1",
      supportsNumImages: true,
      maxNumImages: 9,
      supportsReferenceImages: true,
      maxReferenceImages: 10,
    }
  }
];

/**
 * Get the full model endpoint from a short key
 */
export function getModelEndpoint(modelKey) {
  return modelEndpoints[modelKey] || modelKey;
}

/**
 * Get model metadata by key or endpoint
 */
export function getModelInfo(modelKeyOrEndpoint) {
  const endpoint = getModelEndpoint(modelKeyOrEndpoint);
  return allModels.find(m => m.endpoint_id === endpoint);
}

/**
 * Constrain dimensions to model's maximum values while preserving aspect ratio
 * @param {string} size - Size string in format "width*height"
 * @param {string} modelKeyOrEndpoint - Model key or endpoint to check constraints
 * @returns {string} - Constrained size string
 */
export function constrainDimensions(size, modelKeyOrEndpoint) {
  const modelInfo = getModelInfo(modelKeyOrEndpoint);

  if (!modelInfo?.metadata?.maxWidth && !modelInfo?.metadata?.maxHeight) {
    return size; // No constraints for this model
  }

  // Parse the size string
  const [widthStr, heightStr] = size.split('*');
  let width = parseInt(widthStr, 10);
  let height = parseInt(heightStr, 10);

  if (isNaN(width) || isNaN(height)) {
    return size; // Invalid format, return as-is
  }

  const maxWidth = modelInfo.metadata.maxWidth || Infinity;
  const maxHeight = modelInfo.metadata.maxHeight || Infinity;

  // Calculate scaling factor to fit within max dimensions
  const scaleWidth = maxWidth / width;
  const scaleHeight = maxHeight / height;
  const scale = Math.min(scaleWidth, scaleHeight, 1); // Don't upscale

  if (scale < 1) {
    // Need to scale down
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  return `${width}*${height}`;
}
