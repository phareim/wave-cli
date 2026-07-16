import { Command } from "commander";
import { modelEndpoints } from "./models.js";
import { image_size, DEFAULT_MODEL } from "./config.js";

export function setupCLI() {
  const program = new Command();

  program
    .name("wave")
    .version("1.0.0")
    .description("Generate images and video with the Wavespeed.ai API.")
    .option("--prompt <text>", 'Text prompt. If omitted, the content of "prompt.txt" is used.')
    .option("--file <path>", "Read prompt from a file, or process every .txt file inside a directory (default: ./prompt.txt)")
    .option("--model <modelKey>", "AI model to use.", DEFAULT_MODEL)
    .option("--format <formatKey>", "Image size/format (e.g. '2048*2048', 'square', '16:9').")
    .option("--images <urls...>", "Input image URLs for image-to-image / image-to-video models (space-separated, max 10).")
    .option("--negative-prompt <text>", "Negative prompt to guide what to avoid in generation.")
    .option("--seed <number>", "Seed for reproducible results.")
    .option("--aspect-ratio <ratio>", "Aspect ratio (e.g. '1:1', '16:9'). Model-specific.")
    .option("--resolution <res>", "Output resolution: '720p'/'1080p' (video) or '1k'/'2k'/'4k' (images). Model-specific.")
    .option("--output-format <format>", "Output format: 'png' or 'jpeg'. Model-specific.")
    .option("--quality <quality>", "Quality setting (gpt-image-2: low/medium/high; CogView-4: standard/hd).")
    .option("--duration <seconds>", "Video clip length in seconds (video models only, typically 2-15).")
    .option("--audio <url>", "Audio URL to sync with the generated video (video models only).")
    .option("--prompt-expansion", "Let the model auto-expand the prompt before generation (video models only).")
    .option("--count <number>", "Number of generations to run (rotates over files in batch mode).", "1")
    .option("--optimize", "Enhance the prompt with the Wavespeed prompt optimizer before generation.")
    .option("--optimize-style <style>", "Optimizer style: default, artistic, photographic, technical, realistic, random.", "default")
    .option("--keywords <text>", "Generate (or rewrite) the prompt from these keywords using a Venice text model (requires VENICE_API_TOKEN).")
    .option("--keyword-rating <rating>", "Content rating for keyword-based prompt generation (G, PG, PG13, R).", "R")
    .option("--keyword-model <id>", "Venice text model for keyword-based prompt generation.", "zai-org-glm-4.6")
    .option("--out", "Save outputs to the current directory instead of the default.")
    .option("--local", "Skip uploading to the aiwdm media library; only save locally.")
    .option("--aiwdm-rating <rating>", "Rating passed to aiwdm upload (G, PG, PG13, R).", "R")
    .option("--aiwdm-tags <tags>", "Extra comma-separated tags passed to aiwdm upload (source tag `wavespeed` is always added).")
    .option("--no-metadata", "Skip recording generation metadata (uploaded to aiwdm by default; written as a local sidecar with --local).")
    .option("--debug", "Enable debug mode to display additional logs.")
    .helpOption("-h, --help", "Display this help message.")
    .on("--help", () => {
      const availableSizes = Object.keys(image_size).join(", ");

      console.log(`
Default Model:
  ${DEFAULT_MODEL} (${modelEndpoints[DEFAULT_MODEL]})
  Z-Image-Turbo - 6B parameter text-to-image model, photorealistic in sub-second time.

Available Models:
  flux-2-flex, flux2, flex              FLUX.2 [flex] - Fast, flexible text-to-image with enhanced realism
  z-image-turbo, z-image, turbo         Z-Image-Turbo - 6B parameter text-to-image, photorealistic in sub-second time
  turbo-i2i, turbo-edit, z-turbo-i2i    Z-Image-Turbo Image-to-Image - 6B parameter i2i, sub-second transforms
  seedream-v5-pro, seedream-v5, v5      Seedream v5.0 Pro - ByteDance flagship t2i, aspect_ratio + resolution (1k/2k)
  seedream-v4.5, seedream, v4.5         Seedream v4.5 - Text-to-image by ByteDance (8K)
  seedream-v4.5-edit, seedream-edit     Seedream v4.5 Edit - High-fidelity editing with reference preservation (8K)
  seedream-v4.5-sequential, v4.5-seq    Seedream v4.5 Sequential - Multi-image sets with consistent characters (8K)
  seedream-v4.5-edit-sequential         Seedream v4.5 Edit Sequential - Multi-image editing with identity lock (8K)
  seedream-v4, v4                       Seedream v4 - High-fidelity image generation
  seedream-v4-edit, v4-edit             Seedream v4 Edit - State-of-the-art image editing (4K)
  seedream-v3.1, v3.1                   Seedream v3.1 - Strong style fidelity and rich detail
  wan-2.5, wan2.5, wan                  WAN 2.5 - Alibaba text-to-image model
  wan-2.5-edit, wan-edit, wan2.5-edit   WAN 2.5 Edit - Alibaba image editing with stylistic upgrades
  nano-banana-pro-edit, nano-edit       Nano Banana Pro Edit - Google Gemini 3.0 image editing (4K)
  banana-edit, gemini-edit              (aliases for nano-banana-pro-edit)
  grok-2-image, grok2, grok             Grok 2 Image - xAI's photorealistic image generation
  cogview-4, cogview, cog4              CogView-4 - Zhipu AI's HD quality text-to-image
  kling-image-o1, kling-image, kling    Kling Image O1 - Kuaishou's 2K model with reference images
  gpt-image-2, gpt-image, gpt2          OpenAI GPT-Image-2 - aspect_ratio + resolution (1k/2k/4k), quality low/medium/high (default: low)

Video Models:
  wan-2.7-t2v, wan-t2v, wan-video       WAN 2.7 Text-to-Video - up to 1080p, 2-15s, optional audio sync
  wan-2.7-i2v, wan-i2v                  WAN 2.7 Image-to-Video - animate a reference image into a clip
  wan-2.7-r2v, wan-r2v                  WAN 2.7 Reference-to-Video - up to 5 refs for character/object lock

Available Formats:
  ${availableSizes}

Examples:
  # Basic usage (default model: turbo / Z-Image-Turbo)
  wave --prompt "A futuristic cityscape at dusk"

  # Specific models and formats
  wave --model flux2 --prompt "Photorealistic portrait"
  wave --model gpt2 --prompt "Product shot" --quality high --resolution 2k
  wave --prompt "An enchanted forest" --format 16:9

  # Reproducibility and repeats
  wave --prompt "A magical landscape" --seed 12345
  wave --prompt "A magical landscape" --count 4

  # Batch: every .txt file in a directory (use --count to run multiple rounds)
  wave --file ./prompts/
  wave --file . --optimize --optimize-style random --count 2

  # Prompt helpers
  wave --prompt "woman walking" --optimize
  wave --keywords "rain, neon, samurai" --keyword-rating PG13

  # Image-to-image editing
  wave --model turbo-edit --images photo.jpg --prompt "Painterly style"
  wave --model seedream-edit --images img1.jpg img2.jpg --prompt "Enhance lighting"
  wave --model gemini-edit --images photo.jpg --prompt "Enhance details" --resolution 4k

  # Video generation (WAN 2.7)
  wave --model wan-video --prompt "a cat walking through a neon-lit alley" --duration 6 --resolution 1080p
  wave --model wan-i2v --images photo.jpg --prompt "camera slowly pushes in" --duration 5
  wave --model wan-r2v --images ref1.jpg ref2.jpg --prompt "character walks through a market"

Notes:
  - Without --prompt, the script reads from 'prompt.txt' in the current directory.
  - --file may point at a directory; every .txt inside is processed in sorted order.
  - The 'WAVESPEED_KEY' environment variable must be set with your Wavespeed API key.
  - Outputs are saved to $WAVESPEED_PATH or './images' by default.
        `);

      process.exit(0);
    });

  program.parse(process.argv);

  return program.opts();
}
