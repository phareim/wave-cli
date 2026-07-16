#!/usr/bin/env node

import { setupCLI } from "./cli.js";
import {
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_STEPS,
    DEFAULT_CFG_SCALE,
    image_size,
    stylePresets
} from "./config.js";
import {
    getModelEndpoint,
    getModelConstraints,
    stylePresets as dynamicStylePresets
} from "./models.js";
import * as ui from "../lib/ui.js";
import { saveMedia } from "../lib/media.js";
import { publishOutputs } from "../lib/aiwdm.js";
import { resolvePrompt, runPromptBatch } from "../lib/prompts.js";
import { parseFormat, fitRatioToBox } from "../lib/format.js";

const VENICE_API_URL = "https://api.venice.ai/api/v1/image/generate";
const SMOKE_MODE = process.env.VENICE_SMOKE_TEST === "1";
const DIR_SPEC = { envVar: "VENICE_PATH", defaultDir: "images/venice" };

const mockResponse = () => {
    const buffer = Buffer.from("mock venice image");
    return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name?.toLowerCase() === "content-type" ? "image/png" : null) },
        arrayBuffer: async () => buffer,
        json: async () => ({ message: "mocked response" })
    };
};

const requestImage = async (body) => {
    if (SMOKE_MODE) return mockResponse();

    return fetch(VENICE_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.VENICE_API_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
};

let DEBUG = false;

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

// --format accepts a named size (square, wide, …), a ratio ("2:3" — scaled to
// fill the 1280 box), or explicit pixels ("1024x1280"). Default 1024×1024.
const resolveDimensions = (format) => {
    const f = parseFormat(format);
    if (f?.type === "pixels") return { width: f.width, height: f.height };
    if (f?.type === "ratio") return fitRatioToBox(f.w, f.h, 1280);
    if (f?.type === "named") {
        const named = image_size[f.name];
        if (named) return named;
        ui.warn(`Unknown format '${format}'. Valid: ${Object.keys(image_size).join(", ")}, W:H, WxH. Using ${DEFAULT_WIDTH}×${DEFAULT_HEIGHT}.`);
    }
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
};

const buildInput = (options) => {
    const constraints = getModelConstraints(options.model);
    const divisor = constraints.widthHeightDivisor;

    const requested = resolveDimensions(options.format);
    let _width = Math.min(requested.width, 1280);
    let _height = Math.min(requested.height, 1280);
    _width = Math.floor(_width / divisor) * divisor;
    _height = Math.floor(_height / divisor) * divisor;

    // No --steps → the model's own default; explicit values are capped at the model max.
    const requestedSteps = parseInt(options.steps) || constraints.defaultSteps || DEFAULT_STEPS;
    if (options.steps && requestedSteps > constraints.maxSteps) {
        ui.warn(`Steps capped at ${constraints.maxSteps} (maximum for this model)`);
    }

    const input = {
        model: getModelEndpoint(options.model),
        prompt: options.prompt,
        width: _width,
        height: _height,
        steps: Math.min(requestedSteps, constraints.maxSteps),
        cfg_scale: parseFloat(options.cfgScale) || DEFAULT_CFG_SCALE,
        hide_watermark: true,
        return_binary: true,
        safe_mode: false,
        seed: options.seed !== undefined ? parseInt(options.seed) : randomSeed(),
    };
    if (options.lora) input.style_preset = options.lora;
    if (options.negativePrompt) input.negative_prompt = options.negativePrompt;
    if (options.outputFormat) input.format = options.outputFormat;
    if (options.loraStrength !== undefined) {
        input.lora_strength = Math.min(Math.max(parseInt(options.loraStrength), 0), 100);
    }

    return input;
};

const run = async (options) => {
    if (!process.env.VENICE_API_TOKEN) {
        ui.err("VENICE_API_TOKEN environment variable is not set.");
        process.exit(1);
    }

    const { prompt, originalPrompt } = await resolvePrompt(options, { debug: DEBUG });
    if (!prompt) {
        ui.err("No prompt provided. Use --prompt (text, file, or directory), --keywords, or create ./prompt.txt.");
        process.exit(1);
    }
    options.prompt = prompt;

    const seedProvidedByUser = options.seed !== undefined;
    const input = buildInput(options);

    if (DEBUG) console.log("Input parameters:", JSON.stringify(input, null, 2));

    ui.banner("venice", "image");
    ui.kv([
        ["prompt", ui.truncate(input.prompt)],
        ["model", input.model],
        ["size", `${input.width}×${input.height}`],
        ["steps", `${input.steps} · cfg ${input.cfg_scale}`],
        ["lora", input.style_preset],
        ["seed", `${input.seed}${seedProvidedByUser ? "" : ui.c.dim(" · auto")}`],
    ]);

    const spin = ui.spinner("generating");
    try {
        const response = await requestImage(input);

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const result = await response.json();
            spin.fail(`API Error: ${response.status} - ${JSON.stringify(result, null, 2)}`);
            process.exitCode = 1;
            return;
        }
        if (!response.ok) {
            spin.fail(`API Error: ${response.status}`);
            process.exitCode = 1;
            return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const generationTimeMs = spin.elapsed();
        spin.succeed(`generated in ${ui.fmtDuration(generationTimeMs)}`);

        const savedPath = await saveMedia(buffer, `venice_${Date.now()}.png`, DIR_SPEC, options.out);

        // Metadata is the system of record for replay/debugging. By default it
        // travels to aiwdm as a JSON blob alongside the upload; publishOutputs
        // falls back to a local sidecar when the upload is skipped.
        const metadataBlob = options.metadata !== false && savedPath ? {
            source: "venice",
            kind: "image",
            generated_at: new Date().toISOString(),
            cli_version: "1.0.0",
            model: input.model,
            model_key: options.model,
            prompt: input.prompt,
            original_prompt: originalPrompt,
            keywords: options.keywords,
            keyword_rating: options.keywords ? options.keywordRating : undefined,
            keyword_model: options.keywords ? options.keywordModel : undefined,
            negative_prompt: input.negative_prompt,
            width: input.width,
            height: input.height,
            steps: input.steps,
            cfg_scale: input.cfg_scale,
            seed: input.seed,
            style_preset: input.style_preset,
            lora_strength: input.lora_strength,
            output_format: input.format,
            hide_watermark: input.hide_watermark,
            generation_time_ms: generationTimeMs,
        } : null;

        await publishOutputs(savedPath ? [savedPath] : [], metadataBlob, {
            sourceTag: "venice",
            modelTag: options.model,
            prompt: options.prompt,
            options,
            smoke: SMOKE_MODE,
        });

        ui.footer([
            `seed ${input.seed}`,
            `${input.width}×${input.height}`,
            ui.fmtDuration(generationTimeMs),
        ]);
    } catch (error) {
        spin.fail(`Error during image generation: ${error.message || error}`);
        process.exitCode = 1;
    }
};

const main = async () => {
    const options = setupCLI();
    DEBUG = options.debug || false;

    if (options.randomLora) {
        const presets = dynamicStylePresets.length > 0 ? dynamicStylePresets : stylePresets;
        options.lora = presets[Math.floor(Math.random() * presets.length)];
        console.log(`${ui.c.cyan("🎲")} random LoRA: ${ui.c.bold(options.lora)}`);
    }

    if (await runPromptBatch(options, run)) return;
    await run(options);
};

main();
