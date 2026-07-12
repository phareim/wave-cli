# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wave-cli is a CLI tool providing unified interfaces to two AI image and video generation services: Venice.ai and Wavespeed.ai. Each service is implemented as an independent module with its own CLI entry points.

## Development Commands

### Testing
```bash
npm test  # Runs smoke tests for venice and wavespeed
```

The smoke tests use mock modes to verify that each CLI generates/downloads output files without making actual API calls.

### Running Services Locally (Development)

Instead of using the installed global commands, run directly from source:

```bash
# Venice.ai
node venice/index.js --prompt "your prompt here"

# Wavespeed.ai
node wavespeed/index.js --prompt "your prompt here"
```

## Architecture

### Module Independence

Each service module (`venice/`, `wavespeed/`, `xai/`) is completely self-contained with no cross-dependencies. Each has evolved its own structure based on its specific needs:

**Venice structure:**
```
venice/
├── index.js        # Image CLI entry point with orchestration logic
├── cli.js          # Commander.js CLI setup for image generation
├── config.js       # Configuration constants and defaults
├── models.js       # Loads model endpoint mappings from models.json
├── utils.js        # File I/O, image saving
├── get-models.js   # Dynamic model discovery from Venice API
├── video.js        # Video CLI entry point (queue + poll /video/retrieve)
├── video-cli.js    # Commander.js CLI setup for video generation
```

**Wavespeed structure:**
```
wavespeed/
├── index.js                # Main entry point with orchestration logic
├── cli.js                  # Commander.js CLI setup and option parsing
├── config.js               # Configuration constants and defaults
├── models.js               # Model endpoint mappings and metadata
├── parameter-builders.js   # Category-based parameter building
├── response-handlers.js    # Category-based response handling
├── utils.js                # File I/O, HTTP requests, image saving
```

**xai structure (direct x.ai images/generations, "imagine"):**
```
xai/
├── index.js   # CLI entry point + orchestration (single POST, JSON response, b64_json decoded per image)
├── cli.js     # Commander.js CLI setup. Five user-facing flags only: --prompt/--file, --model, --n, --aspect-ratio, --resolution
├── config.js  # Defaults: model `grok-imagine-image-quality`, n 1, aspect-ratio 1:1, resolution 1k
└── utils.js   # saveImage, saveMetadata, getXaiPath — duplicated from venice/utils.js per the module-independence rule
```

xai notes:
- The endpoint always returns JSON; `imagine` requests `response_format: "b64_json"` and decodes each `data[i].b64_json` into a Buffer. The output file extension is derived from `data[i].mime_type` (defaulting to `.jpg` because `grok-imagine-image-quality` returns `image/jpeg`).
- `--n > 1` produces multiple files `xai_<ts>_<i>.<ext>`, each with its own per-image sidecar. Each per-image sidecar records `n: 1` (it represents one image) plus `image_index` and `requested_n` (audit-only) so `wave-replay` reproduces a single-image invocation, not the original N-image batch.
- Cost is read from `response.usage.cost_in_usd_ticks` (1 tick = 1e-8 USD) and surfaced both on stdout (`Cost: $0.0200`) and in the sidecar as `cost_ticks` + `cost_usd`.
- No `--seed`, `--steps`, `--cfg-scale`, `--negative-prompt`, `--variants`, `--width/--height`, `--format`, or `--keywords*` — the x.ai endpoint doesn't accept them and the user explicitly wanted a tight surface.
- API key strictly via `XAI_API_KEY` env var; never via a flag (would leak to shell history and sidecars).
- Smoke mode: `XAI_SMOKE_TEST=1` short-circuits the live request with a JSON mock that mirrors the real shape (b64_json, mime_type, revised_prompt, usage.cost_in_usd_ticks).

### CLI Entry Points (package.json bin)

- `venice` → `venice/index.js` (image generation)
- `venice-models` → `venice/get-models.js` (refresh image model catalog)
- `venice-video` → `venice/video.js` (WAN 2.7 video generation)
- `wave` → `wavespeed/index.js` (image + video generation; renamed from `wavespeed` 2026-07-12 so the official `@wavespeed/cli` can own that name globally)
- `imagine` → `xai/index.js` (direct x.ai images/generations endpoint, a.k.a. Grok Imagine). Distinct from `wave --model grok-2-image`, which is the Wavespeed-proxied path; `imagine` talks to api.x.ai directly using `XAI_API_KEY`.
- `wave-replay` → `tools/replay.js` (reconstruct or re-run a CLI invocation from a sidecar)
- `wave-balance` → `tools/balance.js` (show current Venice + Wavespeed account balance; `--json`, `--venice-only`, `--wavespeed-only`)
- `wan2.6-flash` → `venice/wan26-flash.js` (Venice Wan 2.6 Flash image-to-video; positional `<image>` accepts a local path or https URL — local files are read and inlined as a base64 data URI in `image_url`. Defaults: `--prompt "animate"`, `--duration 5s`, `--resolution 720p`. Model rejects `seed` so none is sent.)

These are symlinked when installed globally via `npm install -g`.

### Key Architectural Patterns

**Prompt Handling Strategy**: Both modules support dual-input mode:
1. CLI argument via `--prompt "text"`
2. File-based via `prompt.txt` in the current working directory

The file-based approach enables batch workflows and avoids shell escaping issues.

**Batch directory mode (`--file <dir>`)**: All three CLIs (`venice`, `venice-video`, `wavespeed`) detect when `--file` points at a directory. In that case they iterate over every direct-child `.txt` file in sorted order and run the generation pipeline once per prompt — non-recursive, mirroring the semantics of wavespeed's existing `--all-prompts`. Wavespeed routes through the existing batch loop in `index.js`; venice and venice-video clone `options` per iteration with `prompt: undefined` and `file: <full path>` so the single-file path inside `run()` keeps doing the actual reading. `--prompt` short-circuits batch mode in both venice CLIs (a single prompt is incompatible with multiple files); wavespeed lets `--prompt` win the same way it always has.

In batch-dir / `--all-prompts` mode, wavespeed's `--count` rotates over the file list instead of running each file count times back-to-back: 3 files with `--count 2` produce `file1, file2, file3, file1, file2, file3`, not `file1×2, file2×2, file3×2`. `index.js` does this by wrapping the file loop in an outer round loop and calling `generateBatch` with `count: "1"` per file, so the per-generation banner is replaced by a `Round X of N` banner.

**Keyword-based prompt expansion**: Both `venice` and `wavespeed` accept `--keywords "<csv>"`, which calls Venice's chat completions endpoint (`/api/v1/chat/completions`) via the module-local `text.js`. Two modes:
- **Generate mode** (no `--prompt` and no `prompt.txt`): Venice writes a fresh prompt from the keywords.
- **Rewrite mode** (a prompt is supplied via `--prompt`, `--file`, `prompt.txt`, or per-file in `--all-prompts`): Venice rewrites the existing prompt to incorporate the keywords while preserving subject and style. The user's original prompt is preserved in the sidecar's `original_prompt` field.

Flags: `--keyword-rating <G|PG|PG13|R>` (default `R`) steers content via the system prompt; `--keyword-model <id>` (default `zai-org-glm-4.6`) picks the text model. The keywords, rating, and text model are recorded in the sidecar; `prompt` holds the final text (rewritten or generated). Wavespeed always calls Venice for this — `VENICE_API_TOKEN` is required even though the image generation goes to Wavespeed.

- Implementation: `venice/text.js` and `wavespeed/text.js` are duplicates of the same `generatePromptFromKeywords` helper, mirroring the saveMetadata pattern to preserve module independence — do not consolidate. The helper takes an optional `existingPrompt`; when provided it switches the system prompt into rewrite mode. The wavespeed copy honors both `WAVESPEED_SMOKE_TEST` and `VENICE_SMOKE_TEST` for short-circuiting.
- Wavespeed applies the keyword step inside `generateBatch` so it runs per prompt — including each file in `--all-prompts` mode — and feeds the rewritten/generated prompt into the existing `--optimize` pipeline. When both rewrite and optimize run, `original_prompt` records the user's input (pre-rewrite) and `optimize_mode`/`optimize_style` are only set if optimize actually changed the prompt.
- Smoke tests use `*_SMOKE_TEST=1` to short-circuit the chat call. Generate mode returns `[mock <rating>] cinematic image inspired by: <keywords>`; rewrite mode returns `[mock <rating> rewrite] <existingPrompt> :: incorporating <keywords>`.
- To extend to `venice-video`, mirror the same flag set and call `generatePromptFromKeywords` (with `existingPrompt` when the user supplied one) before the existing prompt-resolution path.

**Model Endpoint Resolution**:
- **Venice**: Uses `models.js` which dynamically loads model endpoint mappings from `models.json`. Also supports `getModelConstraints()` for model-specific parameter validation.
- **Wavespeed**: Uses `models.js` with hardcoded `modelEndpoints` and `allModels` arrays. Includes `constrainDimensions()` to automatically scale dimensions to fit model-specific max width/height while preserving aspect ratio.

### Authentication

Both services require environment variables set before use:

- `VENICE_API_TOKEN` - Bearer token for Venice.ai
- `WAVESPEED_KEY` - API key for Wavespeed.ai
- `XAI_API_KEY` - Bearer token for api.x.ai (used by `imagine`)

These must be set in the shell environment, not hardcoded.

### Output Directories

- Venice images: `./images/venice/` or `$VENICE_PATH` if set
- Venice videos: `./videos/venice/` or `$VENICE_VIDEO_PATH` if set
- Wavespeed (images + videos): `./images/` or `$WAVESPEED_PATH` if set
- xai images: `./images/xai/` or `$XAI_PATH` if set

File naming: images use `<source>_<timestamp>.png` or a URL-derived name; videos use `venice_<queue_id>.mp4` (Venice) or the `.mp4` URL-derived name (Wavespeed).

### Metadata sidecars

Every generation produces a metadata blob describing the generation parameters (prompt, model, seed, dimensions, LoRA, duration, prediction/queue id, etc.). By default the blob travels with the aiwdm upload and is stored on the media record in D1 as the `metadata` column; **no local file is written in the default path**. `--no-metadata` on any CLI suppresses the blob entirely.

The local sidecar path still exists as a fallback for two cases:
- `--local` (skip the aiwdm upload) — the sidecar is the only place the blob can land.
- Smoke-test mode (`*_SMOKE_TEST=1`) — the smoke tests assert against a local sidecar.

- Remote storage: the wave-cli helper `uploadToAiwdm` writes the blob to a temp JSON file and forwards it to `aiwdm upload --metadata-file <path>`. The aiwdm worker (`worker/src/index.js` upserts) accepts a `metadata` field and stores it via `serializeMetadata` from `worker/src/utils.js`; the serializers parse it back with `parseMetadata` so API consumers see an object. Updates use `metadata = COALESCE(?, metadata)` so re-uploading without metadata preserves the existing blob. Schema lives in `worker/migrations/014_add_metadata.sql` (run with `wrangler d1 migrations apply <db>`).
- Local fallback: each module exports a local `saveMetadata(mediaFilePath, metadata)` from its own `utils.js`. The helpers are duplicated across `venice/utils.js` and `wavespeed/utils.js` to preserve module independence — do not consolidate. `saveMetadata` prunes `undefined`/`null`/empty strings/empty arrays before writing, so the sidecar only contains populated fields.
- Blob shape is deliberately flat. Top-level fields always include `source` (`venice` | `venice-video` | `wavespeed`), `kind` (`image` | `video`), `generated_at`, `cli_version`, `model`, and `prompt`; other fields depend on the source.
- When `wavespeed --optimize` rewrites the prompt, the blob records `prompt` (final) plus `original_prompt`, `optimize_mode`, `optimize_style`.
- The smoke tests run with `*_SMOKE_TEST=1` (which forces the local-sidecar fallback) and assert both the presence of the sidecar and a couple of key fields. When adding a new generator, build the blob the same way and extend the smoke tests.
- Seeds are always present in the blob: each CLI auto-generates a random 32-bit seed (`Math.floor(Math.random() * 2_147_483_647)`) when `--seed` is omitted, sends it to the API, and records it back so every generation is reproducible. The generation banner marks auto-generated seeds with `(auto)`.
- `wave-replay <sidecar-or-media>` reconstructs the original CLI invocation from a sidecar JSON (whether local or downloaded from aiwdm). It dispatches on the `source` field. When you add a new generator or new metadata fields, extend `tools/replay.js` so the round-trip stays complete — the smoke tests cover venice and wavespeed reconstruction plus `--exec` re-runs. For wavespeed blobs with `original_prompt` set, replay uses the post-optimization `prompt` (the optimizer is non-deterministic, so re-optimizing would diverge).

### aiwdm Upload Integration

Both CLIs upload the saved image into the aiwdm media library by default, by shelling out to the local `aiwdm upload` binary (`~/.npm-global/bin/aiwdm`). The prompt is forwarded via `--prompt` so `aiwdm` uses it verbatim as the description (skipping its AI description step). Pass `--local` to skip the upload (file is still saved on disk).

- Flags: `--local` (skip upload), `--aiwdm-rating <G|PG|PG13|R>` (default `R`), `--aiwdm-tags <a,b>` (comma-separated extras; a source tag `venice` or `wavespeed` is always prepended).
- Skipped in smoke-test mode (`VENICE_SMOKE_TEST=1` / `WAVESPEED_SMOKE_TEST=1`).
- Wavespeed: `fetchImages` returns saved file paths, and `handleResponse` returns `{ ok, savedPaths }`. When adding new response handlers, follow the same shape so the upload keeps working.
- Implementation is inlined in each `index.js` (`uploadToAiwdm`) to preserve module independence — no shared helper.

### API Response Handling

**Venice**: Returns binary image data directly with `return_binary: true`. No polling required.

**Wavespeed**: Uses a polling-based approach with async predictions:
```javascript
// POST to API endpoint creates a prediction
const response = await fetch(apiUrl, { method: "POST", ... });
const predictionData = response.data;

// Poll for completion using prediction.urls.get or prediction.id
while (status !== 'completed') {
  const result = await fetch(predictionUrl);
  // Status: processing → completed | failed
}
```

Response handling uses `response-handlers.js` with category-based handlers. Supports both async (default) and sync modes via `--sync` flag.

**Prompt Optimization (Wavespeed only)**: Wavespeed includes a prompt optimizer API that can enhance prompts before generation:
- Enabled via `--optimize` flag
- Optimizer endpoint: `wavespeed-ai/prompt-optimizer`
- Parameters:
  - `--optimize-mode`: `image` (default) or `video`
  - `--optimize-style`: `default`, `artistic`, `photographic`, `technical`, `anime`, or `realistic`
  - `--optimize-image`: Optional reference image URL for context
- Implementation validates parameters against API spec and falls back to defaults for invalid values
- Returns an enhanced version of the prompt
- Falls back to original prompt on error to ensure generation continues
- Uses async mode with polling (0.5s intervals) to retrieve optimized prompt

## Important Implementation Details

### Image Size Constraints (Venice)

Venice requires dimensions divisible by 16. The code automatically rounds down:
```javascript
_width = Math.floor(_width / 16) * 16;
_height = Math.floor(_height / 16) * 16;
```

Maximum dimensions: 1280x1280 (enforced via `Math.min`).

### Model-Specific Dimension Constraints (Wavespeed)

Wavespeed models have varying maximum dimensions defined in `models.js`:
```javascript
const modelInfo = getModelInfo(modelEndpoint);
const maxWidth = modelInfo.metadata.maxWidth;  // e.g., 4096, 1536, 1440
const maxHeight = modelInfo.metadata.maxHeight;
```

The `constrainDimensions()` function automatically scales down requested dimensions while preserving aspect ratio to fit within model limits. Examples:
- `flux-2-flex` (FLUX.2 [flex]): 1536x1536 max
- `z-image-turbo` (Z-Image-Turbo, default text-to-image): 1536x1536 max
- `z-image-turbo/image-to-image` (turbo-i2i): 1536x1536 max — uses singular `image` field, not `images` array (handled via `singleImageInput` metadata flag)
- `seedream-v5-lite` family (base, edit, sequential, edit-sequential): 4096x4096 max
- `seedream-v4.5` family (base, edit, sequential, edit-sequential): 8192x8192 max
- `seedream-v4` (Seedream v4): 4096x4096 max
- `seedream-v3.1` (Seedream v3.1): 2048x2048 max
- `wan-2.5` (WAN 2.5): 1440x1440 max
- `grok-2-image` (Grok 2 Image): 1536x1536 max

### Video Models (Wavespeed)

Wavespeed video models reuse the existing polling flow but differ in three ways:

1. **Categories**: `text-to-video` and `image-to-video` (distinct from `text-to-image` / `image-to-image`). The category comes from `allModels[].metadata.category`.
2. **Parameters**: video models ignore `size` and instead take `duration` (seconds, typically 2-15), `resolution` (`720p`/`1080p`), `aspect_ratio`, `audio` (URL), `negative_prompt`, `seed`, and `enable_prompt_expansion`. Built in `parameter-builders.js` under the video category branch.
3. **Poll timing**: `index.js` bumps `pollPrediction` to `interval=5s, maxAttempts=360` (30 min ceiling) when the category ends with `-to-video`, since generation takes minutes.

The response handler in `response-handlers.js` saves outputs by URL just like images; `getFileNameFromUrl` picks up the `.mp4` extension from the URL automatically, so no separate video saving path is needed.

WAN 2.7 is the current video family (`alibaba/wan-2.7/text-to-video`, `…/image-to-video`, `…/reference-to-video`). To add new video models, follow the same pattern: add to `modelEndpoints` + `allModels` with the appropriate `-to-video` category.

### Video Generation (Venice)

`venice-video` is a separate entry point because the Venice video API has a different shape from image generation:

- **Flow**: `POST /api/v1/video/queue` (returns `queue_id`) → poll `POST /api/v1/video/retrieve` with `{model, queue_id}`. While processing the response is JSON `{status: "PROCESSING", average_execution_time, execution_duration}`; when complete the response is `Content-Type: video/mp4` binary. The content-type header is the completion signal.
- **Models** live as a hardcoded alias map in `video-cli.js` (`wan-2.7-t2v`, `wan-i2v`, `wan-r2v`, `wan-edit`) — Venice doesn't get dynamic video model refresh yet; add new aliases in the same file.
- **Request body** includes `prompt`, `duration` (`"5s"`/`"10s"`/`"15s"`), `resolution` (`"720p"`/`"1080p"`), `aspect_ratio` (only for text-to-video), plus optional `image_url`/`reference_image_urls`/`video_url`/`audio_url`/`negative_prompt`/`seed` per model type.
- **Output**: saved as `venice_<queue_id>.mp4` under `$VENICE_VIDEO_PATH` or `./videos/venice/`. `--aiwdm` uploads with the `venice-video` source tag.
- **Smoke testing** reuses `VENICE_SMOKE_TEST=1` — mock mode short-circuits `queueJob` and `retrieveJob` to produce a fake MP4 buffer.

### Dynamic Model Updates (Venice)

The `venice-models` command fetches the latest available models from Venice's API and updates `venice/models.json`. This file is version-controlled but can be refreshed when Venice adds new models.

## Common Development Scenarios

### Adding a New Model (Venice)

Run `venice-models` to auto-update, or manually edit `venice/models.json`:
```json
{
  "modelEndpoints": {
    "model-key": "venice/model-endpoint"
  }
}
```

### Adding a New Model (Wavespeed)

Wavespeed models are hardcoded in `wavespeed/models.js`:

1. Add shortcut mapping to `modelEndpoints`:
```javascript
export const modelEndpoints = {
  "your-key": "provider/model-name/endpoint",
  // ...
};
```

2. Add full model metadata to `allModels`:
```javascript
{
  endpoint_id: "provider/model-name/endpoint",
  metadata: {
    display_name: "Model Name",
    category: "text-to-image",
    description: "Model description",
    status: "live",
    tags: ["provider", "text-to-image"],
    model_url: "https://...",
    maxWidth: 4096,
    maxHeight: 4096,
  }
}
```

The `constrainDimensions()` function will automatically enforce the max dimensions.

### Debugging API Issues

Set `--debug` flag (both services) to enable verbose output:
- Venice: Logs full input parameters
- Wavespeed: Logs API URL, request parameters, and full responses

Check for common issues:
- Missing environment variables (error on startup)
- Invalid model keys (falls back to default)
- API rate limits or authentication failures
- Image dimension constraints

### Testing Changes to CLI Options

There are smoke tests in `tests/smoke.test.js` that verify basic functionality. To run them:
```bash
npm test
```

Smoke tests use special environment variables to enable mock mode:
- `VENICE_SMOKE_TEST=1` - Venice returns mock binary data
- `WAVESPEED_SMOKE_TEST=1` - Wavespeed returns mock predictions

For manual testing of new CLI options:
1. Run with new options to ensure parsing works
2. Check default values when options are omitted
3. Verify file-based prompt fallback when `--prompt` not provided
4. Test error handling for missing environment variables
