// Fetches one end-of-day quote from Alpha Vantage and prints the snapshot. A
// development tool: tests never call Alpha Vantage, and production stays on
// user-entered prices until written approval is filed in docs/licensing.md.
//
// Usage:
//   npx tsx scripts/quote.ts --symbol LII
//   npx tsx scripts/quote.ts --symbol WSO-B --as WSO.B      # try another spelling
//   npx tsx scripts/quote.ts --symbol LII --record tests/fixtures/prices/alphavantage/LII.json
//
// Reads ALPHAVANTAGE_API_KEY from the environment (or .env.local); it is never
// printed, and --record refuses to write a body that still contains it. One call per
// run: the free tier allows 25 a day.

import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PeerSetError } from "../src/lib/errors";
import {
  ALPHA_VANTAGE_HOST,
  parseDailySeries,
  quoteUrl,
  toProviderSymbol,
} from "../src/prices/alphaVantage";

const RECORDED_ROWS = 5; // keep fixtures small: the latest few rows are enough

function fail(message: string): never {
  console.error(`quote: ${message}`);
  process.exit(1);
}

// Keeps only the latest rows so a recorded fixture stays a few hundred bytes.
function trimmed(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const series = (body as Record<string, unknown>)["Time Series (Daily)"];
  if (typeof series !== "object" || series === null) return body;
  const rows = Object.entries(series as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, RECORDED_ROWS);
  return { ...body, "Time Series (Daily)": Object.fromEntries(rows) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      symbol: { type: "string" },
      as: { type: "string" },
      record: { type: "string" },
    },
  });
  if (!values.symbol) fail("--symbol is required, e.g. --symbol LII");
  const symbol = values.symbol.toUpperCase();
  const providerSymbol = values.as ?? toProviderSymbol(symbol);

  if (!process.env.ALPHAVANTAGE_API_KEY && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) fail("ALPHAVANTAGE_API_KEY is not set (.env.local)");

  const url = quoteUrl(providerSymbol, apiKey);
  if (url.host !== ALPHA_VANTAGE_HOST) fail("host not allowed");
  console.log(
    `  [alphavantage] TIME_SERIES_DAILY symbol=${providerSymbol} (1 call)`,
  );
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(
    () => fail("request failed"),
  );
  const text = (await res.text()).replaceAll(apiKey, "[scrubbed]");
  console.log(`  [alphavantage] HTTP ${res.status}, ${text.length} bytes`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`response is not JSON: ${text.slice(0, 200)}`);
  }

  if (values.record) {
    const out = JSON.stringify(trimmed(body), null, 2) + "\n";
    if (out.includes(apiKey)) fail("refusing to record: body contains the key");
    writeFileSync(values.record, out);
    console.log(`  recorded ${values.record}`);
  }

  try {
    const q = parseDailySeries(
      body,
      symbol,
      new Date().toISOString(),
      providerSymbol,
    );
    console.log(JSON.stringify(q, null, 2));
  } catch (err) {
    if (!(err instanceof PeerSetError)) throw err;
    // Show the provider's own message key and text (key already scrubbed).
    console.log(`${err.code}: ${err.detail}`);
    console.log(`  provider said: ${text.slice(0, 300)}`);
    process.exitCode = 2;
  }
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? err.message : String(err)),
);
