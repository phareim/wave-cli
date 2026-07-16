import { Command } from "commander";
import {
  modelEndpoints,
  defaultModel,
  modelInfo,
  stylePresets as dynamicStylePresets
} from "./models.js";
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_CFG_SCALE,
  DEFAULT_FORMAT,
  stylePresets as fallbackStylePresets,
  image_size
} from "./config.js";

// Use dynamic presets if available, otherwise fall back to hardcoded ones
const stylePresets = dynamicStylePresets.length > 0 ? dynamicStylePresets : fallbackStylePresets;

export function setupCLI() {
  const program = new Command();

  program
    .name("venice")
    .version("1.0.0")
    .description("Generate images with the Venice.ai image API.")
    .option("--prompt <text>", "Text prompt for image generation.")
    .option("--file <path>", "Read prompt from a file, or process every .txt file inside a directory (default: ./prompt.txt)")
    .option("--negative-prompt <text>", "Negative prompt to guide what not to generate.")
    .option("--model <modelKey>", "AI model to use.", defaultModel)
    .option("--format <formatKey>", "Named image size (square, portrait, landscape, wide, tall).")
    .option("--width <number>", "Image width", parseFloat, DEFAULT_WIDTH)
    .option("--height <number>", "Image height", parseFloat, DEFAULT_HEIGHT)
    .option("--steps <number>", "Number of inference steps (default: the model's own default)", parseFloat)
    .option("--cfg-scale <number>", "Classifier-free guidance scale", parseFloat, DEFAULT_CFG_SCALE)
    .option("--seed <number>", "Random seed for reproducibility", parseFloat)
    .option("--lora <key>", "Apply a LoRA (Venice style preset) to the generation")
    .option("--random-lora", "Randomly select a LoRA (style preset) to apply")
    .option("--lora-strength <number>", "LoRA strength (0-100)", parseFloat)
    .option("--output-format <format>", "Image output format (jpeg, png, webp)", DEFAULT_FORMAT)
    .option("--out", "Save images to the current directory instead of the default folder.")
    .option("--local", "Skip uploading to the aiwdm media library; only save locally.")
    .option("--aiwdm-rating <rating>", "Rating passed to aiwdm upload (G, PG, PG13, R).", "R")
    .option("--aiwdm-tags <tags>", "Extra comma-separated tags passed to aiwdm upload (source tag `venice` is always added).")
    .option("--no-metadata", "Skip recording generation metadata (uploaded to aiwdm by default; written as a local sidecar with --local).")
    .option("--keywords <text>", "Generate (or rewrite) the image prompt from these keywords using a Venice text model.")
    .option("--keyword-rating <rating>", "Content rating used to steer keyword-based prompt generation (G, PG, PG13, R).", "R")
    .option("--keyword-model <id>", "Venice text model used for keyword-based prompt generation.", "zai-org-glm-4.6")
    .option("--debug", "Enable debug mode to display additional logs")
    .helpOption("-h, --help", "Display this help message.")
    .on("--help", () => {
      const availableModels = Object.keys(modelEndpoints)
        .map((key) => {
          const info = modelInfo[modelEndpoints[key]];
          const name = info?.name || modelEndpoints[key];
          const traits = info?.traits?.length > 0 ? ` [${info.traits.join(", ")}]` : "";
          return `  - ${key.padEnd(20)}: ${name}${traits}`;
        })
        .join("\n");

      const availableFormats = Object.keys(image_size)
        .map((key) => `  - ${key.padEnd(10)}: ${image_size[key].width}x${image_size[key].height}`)
        .join("\n");

      console.log(`
Available Models:
${availableModels}

Available Formats:
${availableFormats}

Available LoRAs:
${stylePresets.join(", ")}

Examples:
  venice --prompt "A futuristic cityscape at dusk" --model venice-sd35
  venice --prompt "A serene landscape" --format wide --lora Photographic
  venice --prompt "A cyberpunk scene" --steps 30 --cfg-scale 9 --seed 42
  venice --keywords "neon, rain, alley" --keyword-rating PG13
  venice --file ./prompts/
  venice --prompt "Surprise me" --random-lora

Notes:
  - The 'VENICE_API_TOKEN' environment variable must be set with your Venice AI API key.
  - Images are saved to './images/venice' (or $VENICE_PATH); use '--out' to force the cwd default.
        `);

      process.exit(0);
    });

  program.parse(process.argv);

  return program.opts();
}
