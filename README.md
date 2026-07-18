# wave-cli — AI image & video generation CLIs

Unified command-line tools for AI image and video generation: **Venice.ai**, **Wavespeed.ai**, and **x.ai (Grok Imagine)**. One shared output language across all commands: a parameter banner, a live spinner with elapsed time, saved-file lines, and a compact footer. Colors and animation switch off automatically when output is piped or `NO_COLOR` is set.

```
◆ venice · image
  prompt  a cat in the rain, cinematic lighting, 35mm
  model   chroma
  size    1024×1024
  steps   10 · cfg 2
  seed    597007731 · auto

⠸ generating · 4s
✔ generated in 6.2s
  ↳ images/venice/venice_1784190268838.png
  ⇡ aiwdm · venice, chroma

● seed 597007731 · 1024×1024 · 6.2s
```

## Commands

| Command | What it does |
|---|---|
| `venice` | Venice.ai image generation |
| `venice-video` | Venice.ai WAN 2.7 video generation (text/image/reference/video-to-video) |
| `wan2.6-flash` | Venice.ai Wan 2.6 Flash image-to-video (`wan2.6-flash <image>`) |
| `venice-models` | Refresh the Venice image-model catalog (`venice/models.json`) |
| `wave` | Wavespeed.ai image + video generation (FLUX.2, Seedream, WAN, GPT-Image-2, …) |
| `imagine` | Direct x.ai images/generations (Grok Imagine) |
| `wave-replay` | Reconstruct or re-run the command that produced a metadata sidecar |
| `wave-balance` | Show current Venice + Wavespeed account balances |
| `wave-history` | Browse Wavespeed prediction history (~7 days); `--upload` publishes completed outputs to aiwdm with a duplicate check |
| `tools/diem-burner.mjs` | Nightly job (not a bin): spends leftover Venice DIEM on random `~/prompts/*.txt` before the 00:00 UTC epoch reset — see "DIEM burner" below |

## Environment variables

```bash
export VENICE_API_TOKEN="…"   # venice, venice-video, wan2.6-flash, and --keywords everywhere
export WAVESPEED_KEY="…"      # wave
export XAI_API_KEY="…"        # imagine
```

## Everyday usage

```bash
# Images
venice --prompt "A futuristic cityscape at dusk"
wave --model flux2 --prompt "Photorealistic portrait"
imagine --prompt "Portrait" --format 9:16 --resolution 2k

# Video
venice-video --prompt "a neon-lit alley at night" --duration 10s --resolution 1080p
wave --model wan-video --prompt "aerial drone shot" --duration 6
wan2.6-flash photo.jpg --prompt "camera slowly pushes in"

# Reproducibility
wave --prompt "A magical landscape" --seed 12345
wave --prompt "A magical landscape" --count 4
```

Run any command with `--help` for its full model list and options.

### One `--prompt` flag: text, file, or directory

Every generator resolves its prompt the same way, based on what the value names on disk:

1. `--prompt "literal text"` — anything that isn't an existing file.
2. `--prompt path/to/file.txt` — an existing file is read as the prompt.
3. `--prompt ./dir/` — an existing directory runs once per `.txt` file inside (sorted, non-recursive). With `wave`, `--count N` rotates over the file list N times (`a, b, a, b` — not `a, a, b, b`).
4. No `--prompt` at all — falls back to `./prompt.txt`.

`--keywords "<csv>"` (venice + wave) asks a Venice text model to write a prompt from the keywords — or, when a prompt is also supplied, to rewrite it so it incorporates them. Steer with `--keyword-rating <G|PG|PG13|R>` and `--keyword-model <id>`. Always calls Venice, so `wave --keywords` needs `VENICE_API_TOKEN` too.

```bash
venice --keywords "neon alley, trench coat, rain" --keyword-rating PG13
wave --prompt ./prompts/ --count 2
```

### One `--format` flag: named, ratio, or pixels

`--format` is the single shape/size flag everywhere (it replaced `--aspect-ratio` and venice's `--width`/`--height`):

- **named** — `square`, `portrait`, `landscape`, `wide`, `tall`
- **ratio** — `2:3`, `16:9`, … forwarded *verbatim* to models that take an aspect ratio (all video models, `gpt-image-2`, `seedream-v5-pro`, `imagine`)
- **pixels** — `1024x1280` or `2048*2048` for pixel-size models (auto-constrained to each model's max dimensions)

Whichever spelling you use is converted to what the target model actually accepts:

```bash
wave --model v5 --prompt "editorial portrait" --format 2:3   # ratio → aspect_ratio 2:3
wave --prompt "wide shot" --format 16:9                      # ratio → 4096*2304 pixels for a pixel model
venice --prompt "test" --format 1024x768                     # pixels, clamped to 1280 and the 16-grid
venice-video --prompt "vertical clip" --format 9:16
```

**Resolution-tier Venice models** (`seedream-v5-pro`, `gpt-image-2`, `nano-banana-*`) ignore width/height entirely: they take `aspect_ratio` + `resolution` and **bill by tier**. `venice` translates `--format` to the aspect ratio and adds `--resolution <1K|2K|4K>` / `--quality <low|medium|high>` (gpt-image-2 only). Omit `--resolution` and the model's *default* tier is billed — seedream-v5-pro defaults to 2K (0.11 DIEM) even for small requests, so pass `--resolution 1K` (0.06) when that's what you mean:

```bash
venice --model seedream-v5-pro --prompt "…" --format 2:3 --resolution 1K
venice --model gpt-image-2 --prompt "…" --format 3:2 --resolution 1K --quality medium
```

### Prompt optimization (wave only)

`--optimize` runs the prompt through Wavespeed's prompt optimizer before generation. The mode (image/video) is derived from the model automatically; pick a flavor with `--optimize-style <default|artistic|photographic|technical|realistic|random>`.

## Where output lands

- Venice images: `./images/venice/` (or `$VENICE_PATH`)
- Venice videos: `./videos/venice/` (or `$VENICE_VIDEO_PATH`)
- Wavespeed images + videos: `./images/` (or `$WAVESPEED_PATH`)
- x.ai images: `./images/xai/` (or `$XAI_PATH`)

`--out` forces the cwd default, ignoring the env var.

## aiwdm upload (default) and metadata

Every generation is uploaded into the [aiwdm](https://github.com/phareim/aiwdm) media library by default (the local `aiwdm` CLI must be on `PATH`), with the prompt as its description and tags `<source>, <model>` plus any `--aiwdm-tags` extras; rate it with `--aiwdm-rating <G|PG|PG13|R>`.

- `--local` skips the upload (file still saved on disk).
- A flat **metadata blob** (prompt, model, seed, dimensions, cost, ids, …) travels with the upload and is stored on the aiwdm media record. With `--local` it is written as a `.json` sidecar next to the file instead. `--no-metadata` suppresses it entirely.
- Seeds are always recorded: when `--seed` is omitted a random one is generated client-side and shown as `seed … · auto`, so every generation is reproducible.

### Replay a generation — `wave-replay`

`wave-replay` reads a metadata sidecar (or a media file with one next to it) and reconstructs the exact command that produced it:

```bash
wave-replay images/venice/venice_1730000000.json
wave-replay images/venice/venice_1730000000.png     # finds the .json next to it
wave-replay videos/venice/venice_<id>.mp4 --exec    # re-run it directly
```

Wavespeed sidecars produced with `--optimize` replay the *post-optimization* prompt — re-running the optimizer is non-deterministic and would diverge from the saved output.

## DIEM burner — spend leftover Venice DIEM nightly

Venice's daily DIEM allowance expires at 00:00 UTC. `tools/diem-burner.mjs` runs shortly before that (systemd user timer `diem-burner.timer`, 23:10 UTC) and spends whatever is left on artwork:

- Checks the live balance via `GET /api_keys/rate_limits`; unless `--force`, it exits quietly when more than 100 minutes remain before the epoch — so a stray manual/boot-time run can't burn the *new* day's budget.
- Picks random prompts from top-level `~/prompts/*.txt` (no repeats within a run) and shells out to `venice --prompt <file> --model <id> --format <2:3|3:2> --resolution 1K --aiwdm-tags diem-burner`, so every image auto-uploads to aiwdm tagged `venice, <model>, diem-burner`. Format is randomized per image between portrait 2:3 and landscape 3:2; `--resolution 1K` is pinned because tier-priced models otherwise bill their *default* tier (seedream-v5-pro defaults to 2K: 0.11 instead of 0.06 — verified empirically).
- Model mix: `seedream-v5-pro` by default; one `gpt-image-2` per run when the budget is ≥ 0.35 DIEM. Pricing is read live from `/models?type=image`, and the *actual* charge is taken from a balance re-read after each generation.
- Stops when the budget drops below one seedream image, at 12 images, within 5 minutes of the epoch, or after two consecutive `venice` failures.

Flags: `--dry-run` (plan only), `--force` (ignore the window guard), `--max-images N`. Secrets: `VENICE_API_TOKEN` in `~/.config/diem-burner/env` (loaded by the script; never overrides the ambient env). Log: one JSON line per image in `~/.local/share/diem-burner.jsonl`. Killswitch: `systemctl --user disable --now diem-burner.timer`.

## Development

```bash
npm test                      # smoke tests (mock mode, no API calls)
node venice/index.js --prompt "dev run"
```

Shared plumbing (terminal UI, file I/O, aiwdm upload, prompt resolution, Venice video polling) lives in `lib/`; each service module under `venice/`, `wavespeed/`, `xai/` owns only its API specifics. See [CLAUDE.md](./CLAUDE.md) for the architecture in detail.
