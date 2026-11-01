// Saves every rendered financial statement of one filing (the FilingSummary.xml
// reports in menu category "Statements": income statement, balance sheet, cash
// flows, ...) as evidence for golden values, so each cited line can be re-read
// offline. Evidence only: the app and the fixture loader never read these files.
//
// Usage:
//   npx tsx scripts/fetch-statements.ts --cik 0000833444 \
//     --accession 0000833444-25-000097 --out tests/fixtures/sec/JCI/2026Q2/evidence
//
// Writes <out>/<accession>/FilingSummary.xml.gz, R<n>.htm.gz per statement and
// statements.json (short name, URL, retrievedAt, sha256 for each file).
// Reads SEC_USER_AGENT from the environment (or .env.local). The User-Agent is sent
// to SEC only; it is never written to disk or printed. At most 4 requests a second;
// stops on a 403 or any non-200 status, and writes nothing unless all succeed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const MIN_GAP_MS = 250;
const TIMEOUT_MS = 30_000;

function fail(message: string): never {
  console.error(`fetch-statements: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    cik: { type: "string" },
    accession: { type: "string" },
    out: { type: "string" },
  },
});
const { cik, accession, out } = values;
if (!cik || !/^\d{10}$/.test(cik)) fail("--cik must be 10 digits");
if (!accession || !/^\d{10}-\d{2}-\d{6}$/.test(accession))
  fail("--accession must look like 0000833444-25-000097");
if (!out) fail("--out is required");

if (!process.env.SEC_USER_AGENT && existsSync(".env.local"))
  process.loadEnvFile(".env.local");
const userAgent = process.env.SEC_USER_AGENT;
if (!userAgent) fail("SEC_USER_AGENT is not set (put it in .env.local)");

let lastRequestAt = 0;
async function secGet(url: string) {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent!, "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status === 403) fail(`403 from SEC for ${url} — stopping`);
  if (res.status !== 200) fail(`HTTP ${res.status} for ${url} — stopping`);
  console.log(`  ${res.status}  ${body.byteLength} bytes  ${url}`);
  return { body, retrievedAt: new Date().toISOString() };
}

async function main() {
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession!.replaceAll("-", "")}`;
  const summary = await secGet(`${base}/FilingSummary.xml`);
  const reports = [
    ...summary.body
      .toString("utf8")
      .matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g),
  ]
    .map((m) => {
      const tag = (name: string) =>
        new RegExp(`<${name}>([^<]*)</${name}>`).exec(m[1])?.[1]?.trim() ?? "";
      return {
        file: tag("HtmlFileName"),
        shortName: tag("ShortName"),
        category: tag("MenuCategory"),
      };
    })
    .filter((r) => r.category === "Statements" && /^R\d+\.htm$/.test(r.file));
  if (reports.length === 0) fail("no statements in FilingSummary.xml");

  const files = [
    {
      name: "FilingSummary.xml",
      shortName: "FilingSummary",
      url: `${base}/FilingSummary.xml`,
      ...summary,
    },
  ];
  for (const r of reports) {
    const url = `${base}/${r.file}`;
    files.push({
      name: r.file,
      shortName: r.shortName,
      url,
      ...(await secGet(url)),
    });
  }

  const dir = path.join(out!, accession!);
  mkdirSync(dir, { recursive: true });
  for (const f of files)
    writeFileSync(
      path.join(dir, `${f.name}.gz`),
      gzipSync(f.body, { level: 9 }),
    );
  const index = files.map((f) => ({
    file: `${f.name}.gz`,
    statement: f.shortName,
    url: f.url,
    retrievedAt: f.retrievedAt,
    sha256: createHash("sha256").update(f.body).digest("hex"),
  }));
  writeFileSync(
    path.join(dir, "statements.json"),
    JSON.stringify({ cik, accession, files: index }, null, 2) + "\n",
  );
  console.log(`Saved ${files.length} files to ${dir}`);
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
