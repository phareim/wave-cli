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
| `random-art` | Images from random `~/prompts/**/*.txt` files (the diem-burner pool). Venice + seedream-v5-pro at 1K by default; `--count N` generates N artworks with a fresh prompt + format each, `--gpt` → gpt-image-2 (low quality), `--wave` → WaveSpeed, `--prompt <file>` pins the file, `--list` prints the pool, `--dry-run` prints the picks — see "Random art" below |
| `tools/diem-burner.mjs` | Nightly job (not a bin): spends leftover Venice DIEM + a slice of the monthly USD credits on random `~/prompts/*.txt` before the 00:00 UTC epoch reset — see "DIEM burner" below |

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

Whichever spelling you use is converted to what the target model actually accepts. `wave` defaults to `--format 9:16` (and `--model v5`, i.e. seedream-v5-pro) when the flags are omitted:

```bash
wave --model v5 --prompt "editorial portrait" --format 2:3   # ratio → aspect_ratio 2:3
wave --model turbo --prompt "wide shot" --format 16:9        # ratio → 4096*2304 pixels for a pixel model
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

## Random art — one-off images from the prompt pool

`random-art` is the manual sibling of the DIEM burner: it draws from the same `~/prompts/**/*.txt` pool (recursive; `old/`, `short/`, `images/` and dotdirs excluded) and the same env file (`~/.config/diem-burner/env`, for `DIEM_BURNER_FORMATS` and API keys), but carries none of the budget logic — each invocation just generates.

```bash
random-art                                 # one Venice seedream-v5-pro image at 1K, random prompt + format
random-art --count 3                       # three artworks; fresh random prompt + format each, no repeats until the pool is exhausted
random-art --wave --format 2:3             # route through the WaveSpeed CLI at 2:3
random-art --gpt                           # gpt-image-2 at low quality instead of seedream
random-art --prompt ~/prompts/mirror.txt   # pin the prompt file, skip the random pick
random-art --list                          # print the prompt pool
random-art --count 5 --dry-run             # show the five picks + commands, generate nothing
```

Every image auto-uploads to aiwdm tagged `random-art` (vs the burner's `diem-burner`). Exit codes: 0 ok, 1 failure, 2 prompt blocked by Venice moderation. With `--count > 1` a failure or moderation block doesn't abort the batch — a `● N generated · N blocked · N failed` footer sums it up, and the exit code is 1 only if something actually failed.

## DIEM burner — spend leftover Venice DIEM nightly

Venice's daily DIEM allowance expires at 00:00 UTC. `tools/diem-burner.mjs` runs shortly before that (systemd user timer `diem-burner.timer`, 23:10 UTC) and spends whatever is left on artwork:

- Checks the live balance via `GET /api_keys/rate_limits`; unless `--force`, it exits quietly when more than 100 minutes remain before the epoch — so a stray manual/boot-time run can't burn the *new* day's budget.
- Picks random prompts from `~/prompts/**/*.txt` — all subfolders except `old/`, `short/`, and `images/` (plus dotdirs/`node_modules`) — with no repeats within a run, and shells out to `venice --prompt <file> --model <id> --format <ratio> --resolution 1K --aiwdm-tags diem-burner`, so every image auto-uploads to aiwdm tagged `venice, <model>, diem-burner`. The format is drawn at random per image from `DIEM_BURNER_FORMATS` in the env file (comma-separated aspect ratios; currently `9:16`); `--resolution 1K` is pinned because tier-priced models otherwise bill their *default* tier (seedream-v5-pro defaults to 2K: 0.11 instead of 0.06 — verified empirically).
- Model mix: `seedream-v5-pro` (0.06 at 1K) while the budget covers it; `gpt-image-2` at **low quality** (0.02 at 1K, vs 0.26 at its default high) soaks up the tail below one seedream image, so runs burn down to < 0.02 left. Pricing is read live from `/models?type=image`, and the *actual* charge is taken from a balance re-read after each generation.
- Stops when the budget drops below one seedream image, at 12 images per pool, within 5 minutes of the epoch, or after two consecutive `venice` failures.

### USD phase — the monthly subscription credits

After the DIEM phase the burner spends a nightly slice of the **USD balance** (Venice's monthly subscription credits — same `balances` object on `rate_limits`, priced 1:1 with DIEM on every model). The credits are use-it-or-lose-it at the billing-cycle boundary, so the slice is **balance ÷ days-until-cycle-reset**: a steady drip early in the month that ramps up and empties the pool on the last night. The API doesn't expose the reset day — the burner *learns* it by watching for the balance to jump up by more than $5 between runs (the grant landing) and remembers it in `~/.local/share/diem-burner-state.json`. Until a grant has been observed it falls back to balance ÷ 30. Env overrides (in the same env file): `USD_CYCLE_RESET_DAY` (1–28, wins over the learned day) and `USD_NIGHTLY_BUDGET` (fixed nightly amount; `0` disables the USD phase entirely). Log lines carry `pool: "DIEM" | "USD"` and `budget_before`/`budget_after` (previously `diem_before`/`diem_after`).

Flags: `--dry-run` (plan only), `--force` (ignore the window guard), `--max-images N` (per pool). Secrets: `VENICE_API_TOKEN` in `~/.config/diem-burner/env` (loaded by the script; never overrides the ambient env). Log: one JSON line per image in `~/.local/share/diem-burner.jsonl`. Killswitch: `systemctl --user disable --now diem-burner.timer`.

## Development

```bash
npm test                      # smoke tests (mock mode, no API calls)
node venice/index.js --prompt "dev run"
```

Shared plumbing (terminal UI, file I/O, aiwdm upload, prompt resolution, Venice video polling) lives in `lib/`; each service module under `venice/`, `wavespeed/`, `xai/` owns only its API specifics. See [CLAUDE.md](./CLAUDE.md) for the architecture in detail.
