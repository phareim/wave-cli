#!/usr/bin/env node

import { setupCLI } from "./cli.js";
import { XAI_API_URL } from "./config.js";
import * as ui from "../lib/ui.js";
import { saveMedia } from "../lib/media.js";
import { publishOutputs } from "../lib/aiwdm.js";
import { resolvePrompt, runPromptBatch } from "../lib/prompts.js";

const SMOKE_MODE = process.env.XAI_SMOKE_TEST === "1";
const DIR_SPEC = { envVar: "XAI_PATH", defaultDir: "images/xai" };

const MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

const extFromMime = (mime) => MIME_TO_EXT[String(mime || "").toLowerCase()] || "jpg";

const stripDataUri = (b64) =>
    typeof b64 === "string" ? b64.replace(/^data:[^;]+;base64,/, "") : b64;

const mockResponse = (n = 1) => {
    const buffer = Buffer.from("mock xai image");
    const b64 = buffer.toString("base64");
    const data = Array.from({ length: n }, () => ({
        b64_json: b64,
        mime_type: "image/jpeg",
        revised_prompt: "mock revised prompt"
    }));
    return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name?.toLowerCase() === "content-type" ? "application/json" : null) },
        json: async () => ({
            data,
            usage: { cost_in_usd_ticks: 200_000_000 }
        })
    };
};

const requestImage = async (body) => {
    if (SMOKE_MODE) return mockResponse(body.n);

    return fetch(XAI_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
};

let DEBUG = false;

const run = async (options) => {
    if (!process.env.XAI_API_KEY) {
        ui.err("XAI_API_KEY environment variable is not set.");
        process.exit(1);
    }

    const { prompt } = await resolvePrompt(options, { debug: DEBUG });
    if (!prompt) {
        ui.err("No prompt provided. Use --prompt, --file, or create a ./prompt.txt file.");
        process.exit(1);
    }
    options.prompt = prompt;

    const n = Math.max(1, parseInt(options.n, 10) || 1);
    const input = {
        model: options.model,
        prompt,
        n,
        aspect_ratio: options.aspectRatio,
        resolution: options.resolution,
        response_format: "b64_json"
    };

    if (DEBUG) console.log("Input parameters:", JSON.stringify(input, null, 2));

    ui.banner("imagine", "x.ai image");
    ui.kv([
        ["prompt", ui.truncate(prompt)],
        ["model", input.model],
        ["count", n > 1 ? n : undefined],
        ["aspect", input.aspect_ratio],
        ["resolution", input.resolution],
    ]);

    const spin = ui.spinner(n > 1 ? `generating ${n} images` : "generating");
    try {
        const response = await requestImage(input);

        const contentType = response.headers.get("content-type");
        if (!response.ok) {
            let body;
            try {
                body = contentType && contentType.includes("application/json")
                    ? JSON.stringify(await response.json(), null, 2)
                    : await response.text();
            } catch {
                body = "<unreadable body>";
            }
            spin.fail(`API Error: ${response.status} - ${body}`);
            process.exitCode = 1;
            return;
        }

        const result = await response.json();
        if (!result?.data?.length) {
            spin.fail(`API Error: response had no data array. Full body: ${JSON.stringify(result)}`);
            process.exitCode = 1;
            return;
        }

        const generationTimeMs = spin.elapsed();
        const ticks = result.usage?.cost_in_usd_ticks;
        // x.ai usage ticks: 100M ticks = $0.01, i.e. 1 tick = $1e-10
        const costUsd = typeof ticks === "number" ? ticks / 1e10 : undefined;
        spin.succeed(`generated ${result.data.length} image${result.data.length > 1 ? "s" : ""} in ${ui.fmtDuration(generationTimeMs)}`);

        const timestamp = Date.now();
        const requestedN = n;

        for (let i = 0; i < result.data.length; i++) {
            const entry = result.data[i];
            const b64 = stripDataUri(entry.b64_json);
            if (!b64) {
                ui.err(`API Error: data[${i}] missing b64_json. Entry: ${JSON.stringify(entry)}`);
                continue;
            }
            const ext = extFromMime(entry.mime_type);
            const fileName = requestedN > 1
                ? `xai_${timestamp}_${i + 1}.${ext}`
                : `xai_${timestamp}.${ext}`;

            const buffer = Buffer.from(b64, "base64");
            const savedPath = await saveMedia(buffer, fileName, DIR_SPEC, options.out);

            // Each per-image sidecar records n: 1 (it represents one image) plus
            // image_index / requested_n (audit-only) so wave-replay reproduces a
            // single-image invocation, not the original N-image batch.
            const metadataBlob = options.metadata !== false && savedPath ? {
                source: "xai",
                kind: "image",
                generated_at: new Date().toISOString(),
                cli_version: "1.0.0",
                model: input.model,
                model_key: options.model,
                prompt,
                revised_prompt: entry.revised_prompt,
                aspect_ratio: input.aspect_ratio,
                resolution: input.resolution,
                n: 1,
                image_index: requestedN > 1 ? i + 1 : undefined,
                requested_n: requestedN > 1 ? requestedN : undefined,
                cost_ticks: ticks,
                cost_usd: costUsd,
                generation_time_ms: generationTimeMs
            } : null;

            await publishOutputs(savedPath ? [savedPath] : [], metadataBlob, {
                sourceTag: "xai",
                modelTag: options.model,
                prompt,
                options,
                smoke: SMOKE_MODE,
            });
        }

        ui.footer([
            `${result.data.length} image${result.data.length > 1 ? "s" : ""}`,
            typeof costUsd === "number" ? `$${costUsd.toFixed(4)}` : null,
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

    if (await runPromptBatch(options, run)) return;
    await run(options);
};

main();
