// Shared terminal UI for all wave-cli generators.
//
// Design language:
//   ◆ name · subtitle          header (one per generation)
//     key     value            aligned parameter block
//   ⠸ label · 12s              live spinner while waiting (TTY only)
//   ✔ done in 14.2s            completion line
//     ↳ path/to/output.png     saved file
//     ⇡ aiwdm · tag, tag       upload note
//   ● seed 123 · 14.2s         compact footer (replaces the old summary block)
//
// Colors auto-disable when stdout is not a TTY or NO_COLOR is set, so piped
// output and the smoke tests see plain text.

const COLOR_ENABLED =
  process.stdout.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb";

const style = (open, close) => (s) =>
  COLOR_ENABLED ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

export const c = {
  bold: style(1, 22),
  dim: style(2, 22),
  red: style(31, 39),
  green: style(32, 39),
  yellow: style(33, 39),
  magenta: style(35, 39),
  cyan: style(36, 39),
};

export const truncate = (s, max = 100) => {
  const str = String(s);
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
};

export const fmtDuration = (ms) => {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
};

/** Header: `◆ venice · image` */
export const banner = (name, subtitle) => {
  const sub = subtitle ? ` ${c.dim(`· ${subtitle}`)}` : "";
  console.log(`\n${c.cyan("◆")} ${c.bold(name)}${sub}`);
};

/**
 * Aligned key/value block under a banner. Rows with null/undefined/empty
 * values are skipped, so callers can list everything unconditionally.
 * @param {Array<[string, any]>} rows
 */
export const kv = (rows) => {
  const live = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (live.length === 0) return;
  const width = Math.max(...live.map(([k]) => k.length));
  for (const [key, value] of live) {
    console.log(`  ${c.dim(key.padEnd(width))}  ${value}`);
  }
  console.log("");
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Live progress line. On a TTY it animates in place with elapsed time; when
 * piped it prints the label once and stays quiet until succeed/fail.
 * `note(text)` appends a dim suffix (e.g. an ETA) to the running line.
 */
export const spinner = (label) => {
  const start = Date.now();
  let currentLabel = label;
  let suffix = "";
  let interval = null;

  const render = (frame) => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const line = `${c.cyan(frame)} ${currentLabel} ${c.dim(`· ${elapsed}s${suffix}`)}`;
    process.stdout.write(`\r\x1b[2K${line}`);
  };

  if (COLOR_ENABLED) {
    let i = 0;
    interval = setInterval(() => render(FRAMES[i++ % FRAMES.length]), 80);
    render(FRAMES[0]);
  } else {
    console.log(`${currentLabel}…`);
  }

  const clear = () => {
    if (interval) clearInterval(interval);
    interval = null;
    if (COLOR_ENABLED) process.stdout.write("\r\x1b[2K");
  };

  return {
    update(text) { currentLabel = text; },
    note(text) { suffix = text ? ` ${text}` : ""; },
    elapsed: () => Date.now() - start,
    succeed(text) {
      clear();
      console.log(`${c.green("✔")} ${text ?? `done in ${fmtDuration(Date.now() - start)}`}`);
    },
    fail(text) {
      clear();
      if (text) console.error(`${c.red("✖")} ${text}`);
    },
    stop: clear,
  };
};

export const ok = (text) => console.log(`${c.green("✔")} ${text}`);
export const warn = (text) => console.warn(`${c.yellow("▲")} ${text}`);
export const err = (text) => console.error(`${c.red("✖")} ${text}`);
export const info = (text) => console.log(`${c.dim(text)}`);

/** Saved-file line: `  ↳ images/venice/venice_123.png` */
export const saved = (filePath) => console.log(`  ${c.green("↳")} ${filePath}`);

/** Upload note: `  ⇡ aiwdm · venice, chroma` */
export const upload = (note) => console.log(`  ${c.cyan("⇡")} ${note}`);

/** Compact footer replacing the old repeated summary block. */
export const footer = (parts) => {
  const live = parts.filter(Boolean);
  if (live.length) console.log(`\n${c.dim("●")} ${c.dim(live.join(" · "))}\n`);
};

/** Batch-mode: `▶ prompts/ · 3 prompt files` */
export const batchHeader = (dir, count) =>
  console.log(`${c.cyan("▶")} ${c.bold(dir)} ${c.dim(`· ${count} prompt file${count === 1 ? "" : "s"}`)}`);

/** Batch-mode per-file header: `── a.txt (1/3) ──` */
export const fileHeader = (name, index, total) =>
  console.log(`\n${c.dim("──")} ${c.bold(name)} ${c.dim(`(${index}/${total}) ──────────`)}`);

/** Repeat-mode header: `↻ round 2/3` or `↻ generation 2/3` */
export const roundHeader = (noun, index, total) =>
  console.log(`\n${c.cyan("↻")} ${noun} ${c.bold(`${index}/${total}`)}`);
