# Repository Guidelines

## Project Structure & Module Organization
Shared plumbing (terminal UI, file I/O, aiwdm upload, prompt resolution, Venice video polling) lives in `lib/`. `venice/`, `wavespeed/`, and `xai/` each expose CLI entry points plus provider-specific helpers (`cli.js`, `config.js`, `models.js`). `venice/models.json` is the cached catalog refreshed by `venice-models`. Extra CLIs live under `tools/` (`wave-replay`, `wave-balance`), while generated media lands in `images/` (Wavespeed), `images/venice/`, `images/xai/`, or `videos/venice/`. Keep large assets or credentials outside the repo.

## Build, Test & Development Commands
- `npm install`: install CLI dependencies; rerun after updating `package.json`.
- `npm link` or `npm install -g .`: expose `venice`, `wavespeed`, and `venice-models` globally for manual testing.
- `npm test`: runs `tests/smoke.test.js` with mocked network responses.

## Coding Style & Naming Conventions
JavaScript files use ES modules, 4-space indentation, and single quotes for strings unless interpolation requires template literals. CLI flags prefer kebab-case (e.g., `--file`). Functions are camelCase (`getModelConstraints`), constants are SCREAMING_SNAKE_CASE, and file names stay lowercase with hyphens where needed (`get-models.js`). Run `node venice/index.js --help` and `node wavespeed/index.js --help` after large edits to ensure flag descriptions match implementation.

## Testing Guidelines
Run `npm test` to execute `tests/smoke.test.js`, which spawns each CLI with mock network responses (via `*_SMOKE_TEST=1`) and verifies files land in temp directories. Extend that suite when adding new providers or output types. For manual checks, still spot-test:
1. `venice --prompt "Smoke test"` saving under `images/venice/`.
2. `wavespeed --prompt "Smoke test" --out` to confirm image downloads.
Document intentionally skipped scenarios in PR descriptions alongside sample artifacts.

## Commit & Pull Request Guidelines
Follow the existing concise, imperative style (`better help messages`, `update models`). Scope commits narrowly per provider or feature. PRs should include: summary bullet list, reproduction steps or CLI commands, expected/actual output, and screenshots or sample file paths when UI/asset changes occur. Link to relevant issues or TODOs in `CLAUDE.md`, call out required secrets (VENICE_API_TOKEN, WAVESPEED_KEY), and request review from domain owners before merging.

## Security & Configuration Tips
Never commit API tokens; load them via shell exports (`export VENICE_API_TOKEN=...`). Prefer `.env.local` ignored by git for local experiments. When handling uploaded source images, scrub paths before logging. Rotate cached `venice/models.json` after provider updates to avoid stale endpoints.
