import { Command } from "commander";
import {
    DEFAULT_MODEL,
    DEFAULT_N,
    DEFAULT_ASPECT_RATIO,
    DEFAULT_RESOLUTION
} from "./config.js";

export function setupCLI() {
    const program = new Command();

    program
        .name("imagine")
        .version("1.0.0")
        .description(
            "Generates images via the direct x.ai images/generations endpoint (Grok Imagine)."
        )
        .option(
            "--prompt <text>",
            "Text prompt for image generation."
        )
        .option(
            "--file <path>",
            "Read prompt from a file, or process every .txt file inside a directory (default: ./prompt.txt)"
        )
        .option(
            "--model <id>",
            "x.ai image model id.",
            DEFAULT_MODEL
        )
        .option(
            "-n, --n <number>",
            "Number of images to generate.",
            (v) => parseInt(v, 10),
            DEFAULT_N
        )
        .option(
            "--aspect-ratio <ratio>",
            "Aspect ratio (e.g. 1:1, 16:9, 1:2). Passed through to the API.",
            DEFAULT_ASPECT_RATIO
        )
        .option(
            "--resolution <res>",
            "Resolution (e.g. 1k, 2k). Passed through to the API.",
            DEFAULT_RESOLUTION
        )
        .option(
            "--out",
            "Save images to the current directory instead of the default folder."
        )
        .option(
            "--local",
            "Skip uploading to the aiwdm media library; only save locally."
        )
        .option(
            "--aiwdm-rating <rating>",
            "Rating passed to aiwdm upload (G, PG, PG13, R).",
            "R"
        )
        .option(
            "--aiwdm-tags <tags>",
            "Extra comma-separated tags passed to aiwdm upload (source tag `xai` is always added)."
        )
        .option(
            "--no-metadata",
            "Skip recording generation metadata (uploaded to aiwdm by default; written as a local sidecar with --local)."
        )
        .option(
            "--debug",
            "Enable debug mode to display additional logs"
        )
        .helpOption("-h, --help", "Display this help message.")
        .addHelpText("after", `
Examples:
  imagine --prompt "A futuristic cityscape at dusk"
  imagine --prompt "Portrait" --aspect-ratio 9:16 --resolution 2k
  imagine --prompt "Surprise me" --n 3
  imagine --file prompts/ --n 1

Notes:
  - The 'XAI_API_KEY' environment variable must be set with your x.ai API key.
  - Images are saved to './images/xai/' (or $XAI_PATH) by default.
  - Aspect ratio and resolution are passed through verbatim; the API decides what's valid.
  - For the Wavespeed-proxied Grok 2 Image surface, use \`wavespeed --model grok-2-image\` instead.
        `);

    program.parse(process.argv);
    return program.opts();
}
