#!/usr/bin/env node

import { promises as fs, existsSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import { setupCLI } from "./cli.js";
import { XAI_API_URL } from "./config.js";
import { saveImage, saveMetadata } from "./utils.js";

const SMOKE_MODE = process.env.XAI_SMOKE_TEST === "1";

const slugifyModelTag = (s) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
let localOutputOverride = false;

const resolveAiwdmDir = () => {
    const candidates = [
        process.env.AIWDM_CLI_DIR,
        path.join(os.homedir(), "github/petter/aiwdm/cli"),
        path.join(os.homedir(), "github/aiwdm/cli"),
        "/home/petter/github/aiwdm/cli"
    ].filter(Boolean);
    return candidates.find((p) => existsSync(p));
};

const uploadToAiwdm = async (filePath, { prompt, rating, tags, metadata }) => {
    const args = ["upload", filePath];
    if (rating) args.push("--rating", rating);
    if (tags && tags.length) args.push("--tags", tags.join(","));
    if (prompt) args.push("--prompt", prompt);

    let metadataDir;
    if (metadata) {
        metadataDir = await fs.mkdtemp(path.join(os.tmpdir(), "xai-meta-"));
        const metadataPath = path.join(metadataDir, "metadata.json");
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        args.push("--metadata-file", metadataPath);
    }

    try {
        await new Promise((resolve) => {
            const cwd = resolveAiwdmDir();
            const proc = spawn("aiwdm", args, { stdio: "inherit", ...(cwd ? { cwd } : {}) });
            proc.on("error", (err) => {
                console.error(`aiwdm upload failed: ${err.message}`);
                resolve();
            });
            proc.on("close", (code) => {
                if (code !== 0) console.error(`aiwdm exited with code ${code}`);
                resolve();
            });
        });
    } finally {
        if (metadataDir) {
            try { await fs.rm(metadataDir, { recursive: true, force: true }); } catch {}
        }
    }
};

const readPromptFromFile = async (filePath) => {
    try {
        const prompt = await fs.readFile(filePath, "utf8");
        return prompt.trim();
    } catch (error) {
        if (DEBUG) console.error(`Failed to read prompt from ${filePath}:`, error);
        return null;
    }
};

const buildInput = (options) => {
    const n = Math.max(1, parseInt(options.n, 10) || 1);
    return {
        model: options.model,
        prompt: options.prompt,
        n,
        aspect_ratio: options.aspectRatio,
        resolution: options.resolution,
        response_format: "b64_json"
    };
};

const run = async (options) => {
    if (!process.env.XAI_API_KEY) {
        console.error("Error: XAI_API_KEY environment variable is not set.");
        process.exit(1);
    }

    if (!options.prompt) {
        const promptFilePath = options.file || "./prompt.txt";
        const promptFromFile = await readPromptFromFile(promptFilePath);
        if (promptFromFile) {
            options.prompt = promptFromFile;
            console.log(`Using prompt from ${promptFilePath}.`);
        }
    }

    if (!options.prompt) {
        console.error("Error: No prompt provided. Use --prompt, --file, or create a ./prompt.txt file.");
        process.exit(1);
    }

    const input = buildInput(options);

    if (DEBUG) console.log("Input parameters:", JSON.stringify(input, null, 2));

    try {
        console.log("__Generating image__");
        console.log(`Model: ${input.model}`);
        console.log(`Count: ${input.n} | Aspect ratio: ${input.aspect_ratio} | Resolution: ${input.resolution}`);
        console.log("‾‾\n");

        const startTime = Date.now();
        const progressInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            process.stdout.write(`\r🎨 Generating ${input.n} image${input.n > 1 ? "s" : ""}... ${elapsed}s      `);
        }, 1000);
        process.stdout.write("\r");

        const response = await requestImage(input);

        clearInterval(progressInterval);
        process.stdout.write("\r✨ Generation complete!                                    \n");

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
            console.error(`API Error: ${response.status} - ${body}`);
            return;
        }

        const result = await response.json();
        if (!result?.data?.length) {
            console.error(`API Error: response had no data array. Full body: ${JSON.stringify(result)}`);
            return;
        }

        const generationTimeMs = Date.now() - startTime;
        const ticks = result.usage?.cost_in_usd_ticks;
        // x.ai usage ticks: 100M ticks = $0.01, i.e. 1 tick = $1e-10
        const costUsd = typeof ticks === "number" ? ticks / 1e10 : undefined;
        const timestamp = Date.now();

        const requestedN = input.n;

        for (let i = 0; i < result.data.length; i++) {
            const entry = result.data[i];
            const b64 = stripDataUri(entry.b64_json);
            if (!b64) {
                console.error(`API Error: data[${i}] missing b64_json. Entry: ${JSON.stringify(entry)}`);
                continue;
            }
            const ext = extFromMime(entry.mime_type);
            const fileName = requestedN > 1
                ? `xai_${timestamp}_${i + 1}.${ext}`
                : `xai_${timestamp}.${ext}`;

            const buffer = Buffer.from(b64, "base64");
            const savedPath = await saveImage(buffer, fileName, localOutputOverride);

            const metadataBlob = options.metadata !== false && savedPath ? {
                source: "xai",
                kind: "image",
                generated_at: new Date().toISOString(),
                cli_version: "1.0.0",
                model: input.model,
                model_key: options.model,
                prompt: input.prompt,
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

            const willUpload = !options.local && !SMOKE_MODE && savedPath;
            if (metadataBlob && !willUpload) {
                await saveMetadata(savedPath, metadataBlob);
            }

            if (willUpload) {
                const extraTags = options.aiwdmTags
                    ? options.aiwdmTags.split(",").map((t) => t.trim()).filter(Boolean)
                    : [];
                const modelTag = slugifyModelTag(options.model);
                const tags = [...new Set(["xai", modelTag, ...extraTags].filter(Boolean))];
                await uploadToAiwdm(savedPath, {
                    prompt: options.prompt,
                    rating: options.aiwdmRating,
                    tags,
                    metadata: metadataBlob
                });
            }

            const costStr = typeof costUsd === "number" ? ` | Cost: $${costUsd.toFixed(4)}` : "";
            console.log(`Image ${i + 1}/${result.data.length}${costStr} | ${(generationTimeMs / 1000).toFixed(2)}s`);
        }

        console.log("\n__ Generation Summary __");
        console.log(`Model: ${input.model}`);
        console.log(`Images: ${result.data.length}`);
        if (typeof costUsd === "number") console.log(`Total cost: $${costUsd.toFixed(4)}`);
        console.log(`Total time: ${(generationTimeMs / 1000).toFixed(2)}s`);
        console.log("‾‾\n");
    } catch (error) {
        console.error("Error during image generation:", error);
    }
};

const main = async () => {
    const options = setupCLI();
    DEBUG = options.debug || false;
    localOutputOverride = options.out || false;

    if (options.file && !options.prompt) {
        const filePath = path.resolve(process.cwd(), options.file);
        let stat;
        try {
            stat = await fs.stat(filePath);
        } catch {
            // missing path; let run() surface the read error.
        }
        if (stat?.isDirectory()) {
            let txtFiles;
            try {
                const entries = await fs.readdir(filePath);
                txtFiles = entries.filter((f) => f.endsWith(".txt")).sort();
            } catch (error) {
                console.error(`Failed to read directory ${filePath}:`, error);
                process.exit(1);
            }
            if (txtFiles.length === 0) {
                console.error(`No .txt files found in ${filePath}.`);
                process.exit(1);
            }
            console.log(`Found ${txtFiles.length} prompt file(s) in ${filePath}: ${txtFiles.join(", ")}\n`);
            for (const txtFile of txtFiles) {
                const promptFilePath = path.join(filePath, txtFile);
                console.log(`\n##\n# Processing: ${txtFile}\n##\n`);
                await run({ ...options, file: promptFilePath, prompt: undefined });
            }
            return;
        }
    }

    await run(options);
};

main();
