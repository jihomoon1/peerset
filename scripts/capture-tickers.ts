// Freezes SEC's ticker-and-exchange list into tests/fixtures/sec/_shared/.
//
// Usage:
//   npx tsx scripts/capture-tickers.ts
//
// One request, through the same paced client the app uses. Reads SEC_USER_AGENT from
// the environment (or .env.local); it is never written to disk or printed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { createSecClient } from "../src/sec/client";

const URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const OUT_DIR = path.join("tests", "fixtures", "sec", "_shared");
const FILE = "company_tickers_exchange.json.gz";

function fail(message: string): never {
  console.error(`capture-tickers: ${message}`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: { force: { type: "boolean", default: false } },
  });
  if (existsSync(path.join(OUT_DIR, "manifest.json")) && !values.force)
    fail(`${OUT_DIR} already has a manifest; use --force deliberately`);

  if (!process.env.SEC_USER_AGENT && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  const client = createSecClient({ logger: () => {} });

  const res = await client.get(URL);
  if (res.kind !== "ok") fail(`404 for ${URL}`);
  const retrievedAt = new Date().toISOString();
  const body = Buffer.from(res.body);
  const gz = gzipSync(body, { level: 9 });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, FILE), gz);
  const manifest = {
    files: [
      {
        role: "company-tickers-exchange",
        url: URL,
        file: FILE,
        retrievedAt,
        bytes: body.byteLength,
        gzippedBytes: gz.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
      },
    ],
  };
  writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Wrote ${FILE} (${body.byteLength.toLocaleString("en-US")} bytes, ${gz.byteLength.toLocaleString("en-US")} gzipped)`,
  );
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? err.message : String(err)),
);
