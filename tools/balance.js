#!/usr/bin/env node

import { Command } from "commander";
import * as ui from "../lib/ui.js";

const VENICE_URL = "https://api.venice.ai/api/v1/api_keys/rate_limits";
const WAVESPEED_URL = "https://api.wavespeed.ai/api/v3/balance";

const fetchVenice = async () => {
  const token = process.env.VENICE_API_TOKEN;
  if (!token) return { ok: false, skipped: true, error: "VENICE_API_TOKEN is not set" };
  try {
    const res = await fetch(VENICE_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    const balances = json?.data?.balances || {};
    return {
      ok: true,
      usd: typeof balances.USD === "number" ? balances.USD : null,
      diem: typeof balances.DIEM === "number" ? balances.DIEM : null,
      tier: json?.data?.apiTier?.id || null,
      nextEpoch: json?.data?.nextEpochBegins || null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

const fetchWavespeed = async () => {
  const token = process.env.WAVESPEED_KEY;
  if (!token) return { ok: false, skipped: true, error: "WAVESPEED_KEY is not set" };
  try {
    const res = await fetch(WAVESPEED_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json();
    const balance = json?.data?.balance;
    return {
      ok: true,
      usd: typeof balance === "number" ? balance : null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

const formatUsd = (n) => (n === null || n === undefined ? "?" : `$${n.toFixed(2)}`);

const printAccount = (name, result) => {
  ui.banner(name);
  if (result.ok) {
    const rows = [["balance", ui.c.bold(formatUsd(result.usd))]];
    if (result.diem !== null && result.diem !== undefined) rows.push(["diem", result.diem.toFixed(4)]);
    if (result.tier) rows.push(["tier", result.tier]);
    ui.kv(rows);
  } else {
    console.log(`  ${result.skipped ? ui.c.dim(`skipped · ${result.error}`) : ui.c.red(result.error)}\n`);
  }
};

const program = new Command();
program
  .name("wave-balance")
  .description("Show current account balance for Venice and Wavespeed")
  .option("--json", "Output JSON instead of a human-readable summary")
  .option("--venice-only", "Only check Venice")
  .option("--wavespeed-only", "Only check Wavespeed")
  .parse(process.argv);

const opts = program.opts();

const run = async () => {
  const [venice, wavespeed] = await Promise.all([
    opts.wavespeedOnly ? null : fetchVenice(),
    opts.veniceOnly ? null : fetchWavespeed(),
  ]);

  if (opts.json) {
    const out = {};
    if (venice) out.venice = venice;
    if (wavespeed) out.wavespeed = wavespeed;
    console.log(JSON.stringify(out, null, 2));
  } else {
    if (venice) printAccount("venice", venice);
    if (wavespeed) printAccount("wavespeed", wavespeed);
  }

  const checked = [venice, wavespeed].filter(Boolean);
  const anyHardError = checked.some((r) => !r.ok && !r.skipped);
  process.exit(anyHardError ? 1 : 0);
};

run();
