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
            "--prompt <text|file|dir>",
            "Prompt text, a file to read it from, or a directory of .txt prompts (default: ./prompt.txt)."
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
            "--format <format>",
            "Aspect ratio ('1:1', '16:9', '1:2') or a named format (square, wide, …).",
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
  imagine --prompt "Portrait" --format 9:16 --resolution 2k
  imagine --prompt "Surprise me" --n 3
  imagine --prompt prompts/ --n 1

Notes:
  - The 'XAI_API_KEY' environment variable must be set with your x.ai API key.
  - Images are saved to './images/xai/' (or $XAI_PATH) by default.
  - Ratio and resolution are passed to the API as-is; the API decides what's valid.
  - For the Wavespeed-proxied Grok 2 Image surface, use \`wave --model grok-2-image\` instead.
        `);

    program.parse(process.argv);
    return program.opts();
}
