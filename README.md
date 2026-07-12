# AI Image Generation CLI Tools

A unified command-line interface for AI image generation services: Venice.ai and Wavespeed.ai. Generate images using state-of-the-art AI models.

## Installation

```bash
npm install -g flux-client
```

## Available Commands

### Venice AI (`venice`)
Generate images using Venice AI's models with extensive customization options.

```bash
# Basic usage
venice --prompt "A futuristic cityscape at dusk"

# Advanced options
venice --prompt "A serene landscape" --format wide --lora photographic
venice --prompt "A cyberpunk scene" --steps 25 --cfg-scale 2 --seed 42
venice --prompt "Portrait" --model qwen-image --variants 4 --output-format png
```

**Options:**
- `--prompt <text>`: Text description of the image to generate
- `--negative-prompt <text>`: Describe what to avoid in the image
- `--model <modelKey>`: Choose AI model (run `venice --help` to see available models)
- `--format <formatKey>`: Image size preset (square, portrait, landscape, wide, tall)
- `--width <number>`: Custom image width (default: 1024)
- `--height <number>`: Custom image height (default: 1024)
- `--lora <preset>`: Apply a Venice LoRA/style preset (Anime, Photographic, Cinematic, Fantasy Art, etc.)
- `--steps <number>`: Number of inference steps (default: 20)
- `--cfg-scale <number>`: Guidance scale (default: 2)
- `--seed <number>`: Random seed for reproducible results
- `--output-format <format>`: Output format (jpeg, png, webp - default: webp)
- `--variants <number>`: Generate multiple variants (1-4, only with --return-binary false)
- `--lora-strength <number>`: LoRA strength (0-100)
- `--embed-exif-metadata`: Embed generation parameters in EXIF metadata
- `--hide-watermark`: Hide watermark in generated image
- `--return-binary`: Return image as binary data (default: true)
- `--debug`: Enable debug mode
- `--keywords <text>`: Generate the image prompt from a keyword list using a Venice text model (overrides `--prompt`)
- `--keyword-rating <rating>`: Content rating to steer keyword-based prompt generation: `G`, `PG`, `PG13`, or `R` (default: `R`)
- `--keyword-model <id>`: Venice text model used for keyword expansion (default: `zai-org-glm-4.6`)

**Note:** Images are automatically constrained to dimensions divisible by 16 (model requirement), with a maximum of 1280x1280.

**Keyword-based prompts:** Both `venice` and `wave` support `--keywords` — when set, the CLI calls Venice's chat completions endpoint (always Venice, even from the wave CLI) with the supplied text model and asks it to expand the keywords into a vivid one-paragraph image prompt at the chosen rating, then uses that prompt for generation. The keywords, rating, and text model are recorded in the sidecar alongside the final prompt. The wave variant requires `VENICE_API_TOKEN` in addition to `WAVESPEED_KEY`.

```bash
venice    --keywords "neon alley, woman in trench coat, rain" --keyword-rating PG13
wave --keywords "ferns, dew, morning light" --keyword-rating G --keyword-model llama-3.3-70b
```

### Venice Models (`venice-models`)
Fetch and update the latest available Venice AI models from the API.

```bash
venice-models  # Updates venice/models.json with latest models
```

---

### Wavespeed AI (`wave`)
Generate high-quality images using Wavespeed AI's fast and powerful models, including FLUX.2, Seedream, and more.

#### Basic Usage

```bash
# Basic image generation (default model: z-image-turbo)
wave --prompt "A futuristic cityscape at dusk"

# Using specific models
wave --model flux2 --prompt "Photorealistic portrait"
wave --model seedream --prompt "High quality landscape"
wave --model grok --prompt "Product photography shot"
```

#### Available Models

- **flux-2-flex, flux2, flex** - FLUX.2 [flex]: Fast, flexible text-to-image with enhanced realism (1536x1536 max)
- **z-image-turbo, z-image, turbo** - Z-Image-Turbo: 6B parameter model, photorealistic in sub-second time (1536x1536 max, default)
- **seedream-v4.5, seedream, v4.5** - Seedream v4.5: Latest version by ByteDance with improved quality (4096x4096 max)
- **seedream-v4, v4** - Seedream v4: High-fidelity image generation (4096x4096 max)
- **seedream-v3.1, v3.1** - Seedream v3.1: Strong style fidelity and rich detail (2048x2048 max)
- **wan-2.5, wan2.5, wan** - WAN 2.5: Alibaba text-to-image model (1440x1440 max)
- **grok-2-image, grok2, grok** - Grok 2 Image: xAI's photorealistic image generation (1536x1536 max)

#### Prompt Optimization

Wavespeed includes a built-in prompt optimizer that enhances your prompts before generation:

```bash
# Basic optimization
wave --prompt "woman walking" --optimize

# Optimization for video prompts
wave --prompt "city scene" --optimize --optimize-mode video

# Style-specific optimization
wave --prompt "portrait shot" --optimize --optimize-style photographic
wave --prompt "fantasy art" --optimize --optimize-style artistic
wave --prompt "anime character" --optimize --optimize-style anime

# With reference image
wave --prompt "similar style" --optimize --optimize-image https://example.com/reference.jpg
```

**Optimization Modes:** `image` (default), `video`
**Optimization Styles:** `default`, `artistic`, `photographic`, `technical`, `anime`, `realistic`

#### Advanced Features

```bash
# Custom image sizes
wave --prompt "Mountain landscape" --format 1920*1080
wave --prompt "Square image" --format square_hd

# Multiple generations
wave --prompt "A magical landscape" --count 4

# With seed for reproducibility
wave --prompt "A magical landscape" --seed 12345

# Synchronous mode (wait for result in single response)
wave --prompt "Quick test" --sync

# Save to current directory
wave --prompt "Local save" --out

# Debug mode
wave --prompt "Test" --debug
```

**Options:**
- `--prompt <text>`: Text prompt for generation
- `--model <modelKey>`: Model to use (default: z-image-turbo)
- `--format <formatKey>`: Image size preset (square, portrait, landscape, wide, tall) or custom dimensions
- `--seed <number>`: Random seed for reproducibility
- `--count <number>`: Number of generations (default: 1)
- `--optimize`: Enable prompt optimization
- `--optimize-mode <mode>`: Optimization mode (image, video)
- `--optimize-style <style>`: Optimization style (default, artistic, photographic, technical, anime, realistic)
- `--optimize-image <url>`: Reference image URL for optimization
- `--sync`: Enable synchronous mode
- `--out`: Save to current directory instead of default
- `--debug`: Enable debug mode

**Note:** Images are automatically constrained to model-specific maximum dimensions while preserving aspect ratio.

## Environment Variables

Both services require their respective API credentials to be set as environment variables:

```bash
export VENICE_API_TOKEN="your-venice-api-token"
export WAVESPEED_KEY="your-wavespeed-api-key"
```

Add these to your `~/.bashrc`, `~/.zshrc`, or equivalent shell configuration file for persistence.

## Output Directories

Generated images are automatically saved to the following locations:

- **Venice AI**: `./images/venice/` (or `$VENICE_PATH` if set)
- **Wavespeed AI**: `./images/` (or `$WAVESPEED_PATH` if set)

File naming convention: `<source>_<timestamp>.<ext>` or extracted from URL for downloads.

### Metadata Sidecars

Every saved image/video is accompanied by a `.json` sidecar sharing the same base name (for example, `venice_1730000000.png` → `venice_1730000000.json`). The sidecar captures the prompt, model, seed, dimensions, LoRA, duration, and other generation parameters so the image/video remains self-describing months later.

```bash
# Default behaviour — sidecar is written automatically
venice --prompt "A serene landscape"

# Opt out if you don't want sidecars
venice --prompt "A serene landscape" --no-metadata
wave --prompt "A futuristic city" --no-metadata
venice-video --prompt "drone shot over forest" --no-metadata
```

For Wavespeed runs with `--optimize`, the sidecar records both the `prompt` actually sent to the model and the `original_prompt` you typed.

If you omit `--seed`, each CLI generates a random 32-bit seed client-side, sends it to the API, and records it in the sidecar — so every generation is reproducible by copying the seed back into a subsequent `--seed <n>` run. The generation banner marks auto-generated seeds with `(auto)`.

### Replay a generation — `wave-replay`

`wave-replay` reads a metadata sidecar and reconstructs the exact `wave-cli` command that produced it. Useful when you want to regenerate, tweak one parameter, or remind yourself how a saved image was made.

```bash
# Print the original command (paste it back, or pipe to a shell)
wave-replay images/venice/venice_1730000000.json
wave-replay images/venice/venice_1730000000.png      # also works — finds the .json next to it

# Re-run it directly (uses the matching wave-cli script from this install)
wave-replay videos/venice/venice_<id>.mp4 --exec
```

For Wavespeed sidecars produced with `--optimize`, replay uses the *post-optimization* prompt (the one actually sent to the model) — re-running the optimizer is non-deterministic and would diverge from the saved output.

## Prompt Files

Both services support reading prompts from a `prompt.txt` file in the current directory:

```bash
# Create a prompt file
echo "A serene mountain landscape at sunset" > prompt.txt

# Generate without --prompt flag (uses prompt.txt)
venice
wave
```

This approach is useful for:
- Avoiding shell escaping issues with complex prompts
- Batch workflows
- Long prompts that exceed command-line limits

## Additional Features

### Debug Mode
Enable verbose logging with the `--debug` flag:
```bash
venice --prompt "test" --debug
wave --prompt "test" --debug
```

### Upload to aiwdm

Both CLIs can push the generated image straight into the [aiwdm](https://github.com/phareim/aiwdm) media library after saving it locally. The local `aiwdm` CLI must be on `PATH`.

```bash
venice --prompt "A serene mountain" --aiwdm
wave --prompt "A futuristic city" --aiwdm --aiwdm-rating G --aiwdm-tags "scifi,city"
```

The prompt is passed to `aiwdm upload --prompt …` as the description (skipping AI description generation). A source tag (`venice` or `wavespeed`) is always added; `--aiwdm-tags` appends extras.

**Options:**
- `--aiwdm`: Upload saved image(s) to aiwdm
- `--aiwdm-rating <rating>`: `G`, `PG`, `PG13`, or `R` (default: `R`)
- `--aiwdm-tags <tags>`: Comma-separated extra tags

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed development documentation, architecture details, and contribution guidelines.
