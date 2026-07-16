# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wave-cli is a CLI tool providing unified interfaces to three AI image/video generation services: Venice.ai, Wavespeed.ai, and x.ai (Grok Imagine). Shared plumbing lives in `lib/`; each service module owns only its API specifics.

## Development Commands

```bash
npm test                          # smoke tests for all CLIs (mock mode, no API calls)
node venice/index.js --prompt "…" # run any CLI from source instead of the global bin
node wavespeed/index.js --prompt "…"
```

## Architecture

### Shared library (`lib/`)

All cross-cutting behavior is consolidated here (refactor 2026-07-16 — the old "duplicate helpers per module" convention is gone; do not re-duplicate):

```
lib/
├── ui.js            # Terminal output language: colors (TTY/NO_COLOR-aware), banner()+kv()
│                    # parameter blocks, spinner() with elapsed time, saved/upload lines,
│                    # footer(), batch/file/round headers. ALL user-facing output goes
│                    # through this module — keep the visual grammar consistent.
├── media.js         # resolveOutDir({envVar, defaultDir}, --out), saveMedia, saveMetadata
│                    # (sidecar with pruneEmpty), getFileNameFromUrl, fetchOutputs (URL
│                    # downloads with smoke-mode mockBuffer)
├── aiwdm.js         # uploadToAiwdm (shell-out, metadata via temp JSON file, cwd anchored
│                    # to the aiwdm CLI dir), slugifyModelTag, publishOutputs — the shared
│                    # "upload to aiwdm OR write local sidecar" flow every generator ends with
├── prompts.js       # readPromptFromFile, resolvePrompt (--prompt → --file/prompt.txt →
│                    # --keywords generate/rewrite via Venice chat), runPromptBatch
│                    # (--file <dir> loop), listPromptFiles, generatePromptFromKeywords,
│                    # VALID_RATINGS
└── venice-video.js  # Venice /video/queue + /video/retrieve polling core (content-type
                     # flip to video/mp4 is the completion signal), saveVideo,
                     # resolveImageInput (local file → base64 data URI), isHttpUrl
```

### Service modules

Each module keeps only its API-specific logic and imports the rest from `../lib/`:

```
venice/     index.js (image CLI), cli.js, config.js, models.js + models.json (dynamic
            catalog, refreshed by get-models.js / `venice-models`), video.js + video-cli.js
            (WAN 2.7 via lib/venice-video.js), wan26-flash.js (Wan 2.6 Flash i2v, positional
            <image> arg, no seed — model rejects it)
wavespeed/  index.js, cli.js, config.js, models.js (hardcoded modelEndpoints + allModels +
            constrainDimensions), parameter-builders.js (category-based request params),
            response-handlers.js (download outputs via lib/media.fetchOutputs)
xai/        index.js, cli.js, config.js — direct x.ai images/generations ("imagine")
tools/      replay.js (wave-replay), balance.js (wave-balance)
```

### CLI Entry Points (package.json bin)

- `venice` → `venice/index.js`
- `venice-models` → `venice/get-models.js`
- `venice-video` → `venice/video.js`
- `wan2.6-flash` → `venice/wan26-flash.js`
- `wave` → `wavespeed/index.js` (renamed from `wavespeed` 2026-07-12, ceding the name to the official `@wavespeed/cli`)
- `imagine` → `xai/index.js` (direct api.x.ai; distinct from `wave --model grok-2-image`, the Wavespeed-proxied path)
- `wave-replay` → `tools/replay.js`
- `wave-balance` → `tools/balance.js`

### Output language (lib/ui.js)

Every generator prints the same shapes: `◆ name · kind` banner, aligned `kv()` parameter block (rows with empty values are skipped automatically), a `spinner()` that animates with elapsed time on a TTY and prints a single line when piped, `↳ path` per saved file, `⇡ aiwdm · tags` on upload, and a dim `● …` footer. Colors disable when stdout is not a TTY, `NO_COLOR` is set, or `TERM=dumb` — the smoke tests assert against the plain-text form.

### Prompt resolution (lib/prompts.js)

1. `--prompt` wins; else `--file <path>` (default `./prompt.txt`).
2. `--file <dir>` (all CLIs): `runPromptBatch` runs the generator once per direct-child `.txt` file, sorted, non-recursive. Wavespeed implements its own loop on `listPromptFiles` because `--count` rotates *over* the file list (3 files × `--count 2` → a,b,c,a,b,c) with `↻ round x/n` headers.
3. `--keywords "<csv>"` (venice + wave): `resolvePrompt` calls Venice chat completions — generate mode with no prompt, rewrite mode when a prompt exists (original preserved as `original_prompt` in the metadata). Flags: `--keyword-rating <G|PG|PG13|R>` (default R), `--keyword-model <id>` (default `zai-org-glm-4.6`). Always Venice — `VENICE_API_TOKEN` required even from `wave`.

### Removed flags (2026-07-16 streamlining — do not reintroduce without cause)

- venice: `--return-binary` (always true), `--hide-watermark` (was a no-op; always on), `--embed-exif-metadata`, `--variants` (was broken: flipping return_binary off made the JSON response read as an error). `--steps` now defaults to the model's own default instead of a global 20.
- wave: `--enable-base64` (would break the URL download path), `--sync` (completed-in-initial-response is handled anyway), `--all-prompts` (use `--file .`), `--optimize-mode` (derived from the model category), `--optimize-image`, `--num-images` (use `--count`).
- `tools/replay.js` ignores the corresponding legacy sidecar fields, so old sidecars still replay.

### Authentication

- `VENICE_API_TOKEN` — venice, venice-video, wan2.6-flash, and `--keywords` everywhere
- `WAVESPEED_KEY` — wave
- `XAI_API_KEY` — imagine (strictly env var, never a flag: flags leak to shell history and sidecars)

### Output Directories

- Venice images: `./images/venice/` or `$VENICE_PATH`
- Venice videos: `./videos/venice/` or `$VENICE_VIDEO_PATH`
- Wavespeed (images + videos): `./images/` or `$WAVESPEED_PATH`
- xai images: `./images/xai/` or `$XAI_PATH`
- `--out` on any CLI forces the cwd default, ignoring the env var (`lib/media.resolveOutDir`).

File naming: images `<source>_<timestamp>.<ext>` or URL/prediction-id derived; videos `venice_<queue_id>.mp4` (Venice) or URL-derived `.mp4` (Wavespeed).

### Metadata blobs & aiwdm upload

Every generation builds a flat metadata blob (always includes `source` (`venice` | `venice-video` | `wavespeed` | `xai`), `kind` (`image` | `video`), `generated_at`, `cli_version`, `model`, `prompt`; other fields per source) and hands it to `lib/aiwdm.publishOutputs`, which either:

- **uploads to aiwdm** (default): shells out to `aiwdm upload --prompt … --rating … --tags … --metadata-file <tmp json>`; the blob is stored on the D1 media record (worker `metadata` column, `COALESCE` on update, migration `worker/migrations/014_add_metadata.sql` in the aiwdm repo). Tags are `<source>, <slugified model>` + `--aiwdm-tags` extras; rating from `--aiwdm-rating` (default R). Skipped in smoke mode.
- **writes a local `.json` sidecar** next to each file (with `output_file` added) when the upload is skipped: `--local` or smoke mode. `--no-metadata` suppresses the blob entirely.

Seeds are always present: each CLI generates a random seed client-side when `--seed` is omitted, sends it, and records it (banner shows `seed … · auto`). Exception: wan2.6-flash (model rejects seed). When `wave --optimize` rewrites the prompt, the blob records the final `prompt` plus `original_prompt`, `optimize_mode` (derived image/video), `optimize_style`.

xai specifics: response is JSON with `b64_json` per image (decoded via mime-derived extension, default `.jpg`); `--n > 1` → files `xai_<ts>_<i>.<ext>`, each with a per-image blob recording `n: 1` + audit-only `image_index`/`requested_n` so replay reproduces a single image; cost from `usage.cost_in_usd_ticks` (1 tick = $1e-10) surfaced in the footer and as `cost_ticks`/`cost_usd`.

### wave-replay

`wave-replay <sidecar-or-media>` reconstructs the original CLI invocation from a metadata blob, dispatching on `source`. When adding a generator or new metadata fields, extend `tools/replay.js` so the round-trip stays complete — the smoke tests cover venice, wavespeed, and xai reconstruction plus `--exec` re-runs. Wavespeed blobs with `original_prompt` replay the post-optimization `prompt` (the optimizer is non-deterministic).

### API Response Handling

- **Venice images**: binary response (`return_binary: true`), no polling. JSON content-type on the response signals an API error.
- **Venice video**: `POST /video/queue` → `queue_id`, then poll `POST /video/retrieve`; JSON `{status: PROCESSING, average_execution_time}` while running (the ETA feeds the spinner), `Content-Type: video/mp4` binary when done. Models are a hardcoded alias map in `video-cli.js`.
- **Wavespeed**: `POST /{endpoint}` creates a prediction; poll `prediction.urls.get` (or `/{endpoint}/{id}`) until `completed`/`failed`. Images poll at 2s/60 attempts; `-to-video` categories at 5s/360 (30 min ceiling). Outputs are URLs downloaded by `response-handlers.js`.
- **Wavespeed prompt optimizer** (`--optimize`): async prediction against `wavespeed-ai/prompt-optimizer` polled at 0.5s; falls back to the original prompt on any error. Mode derived from model category; styles `default|artistic|photographic|technical|realistic` (+`random`).
- **xai**: single POST, JSON response with `b64_json` images, no polling.

## Important Implementation Details

### Dimension constraints

- **Venice**: dimensions must be divisible by the model's `widthHeightDivisor` (default 16, rounded down), max 1280×1280. Steps are capped at the model's `maxSteps`; the default comes from the model's `defaultSteps`.
- **Wavespeed**: `constrainDimensions()` scales requested size to the model's `maxWidth`/`maxHeight` (from `models.js` metadata) preserving aspect ratio. Notable maxes: flux-2-flex/z-image-turbo 1536², seedream-v4.5 family 8192², seedream-v4/v5-lite 4096², seedream-v3.1 2048², wan-2.5 1440², grok-2-image 1536².
- **noSize models** (`gpt-image-2`, `seedream-v5-pro`): take `aspect_ratio` + `resolution` instead of `size` (`noSize`/`noSeed`/`defaultResolution`/`defaultQuality` metadata flags); `--format` is auto-translated to an aspect ratio with a warning. `z-image-turbo/image-to-image` uses a singular `image` field via the `singleImageInput` flag.

### Adding a new model

- **Venice image**: run `venice-models` (refreshes `models.json` from the API), or edit it manually.
- **Venice video**: add an alias to the map in `venice/video-cli.js`.
- **Wavespeed**: add the shortcut to `modelEndpoints` and full metadata (display_name, category, maxWidth/maxHeight or noSize flags) to `allModels` in `wavespeed/models.js`. Video models use `-to-video` categories and pick up the patient polling automatically.

### Smoke tests (`tests/smoke.test.js`)

`VENICE_SMOKE_TEST=1` / `WAVESPEED_SMOKE_TEST=1` / `XAI_SMOKE_TEST=1` short-circuit network calls with mocks that mirror the real response shapes, force the local-sidecar fallback, and disable the aiwdm upload. Tests spawn the CLIs non-TTY, so they assert against the plain (uncolored) output. When adding a generator: build the metadata blob the same way, publish via `publishOutputs`, extend the smoke tests and `tools/replay.js`.

### Debugging

`--debug` on any CLI logs request parameters and full responses. Common issues: missing env vars (checked at startup), invalid model keys (fall back to default with a warning), dimension constraints, rate limits.
