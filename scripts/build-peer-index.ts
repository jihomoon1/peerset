// Builds data/peer-index.json from SEC bulk data (blueprint §10.1, ADR 0003). Run
// monthly by .github/workflows/refresh-peer-index.yml.
//
// Usage:
//   npx tsx scripts/build-peer-index.ts [--work-dir DIR] [--out FILE] [--summary FILE]
//                                       [--min-listed N] [--skip-download]
//
// Exactly three SEC requests (the ticker list and two zips, about 3 GB), each streamed
// to disk with the project User-Agent and never retried. --skip-download rebuilds from
// files already in --work-dir (it then needs DIR/sources.json from an earlier run).
// SEC_USER_AGENT comes from the environment (or .env.local) and is never printed.

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import {
  companyfactsUnreadableShare,
  diffIndexes,
  summaryMarkdown,
  UNREADABLE_SHARE_LIMIT,
} from "../src/peers/buildIndex";
import { decodeIndex, encodeIndex } from "../src/peers/indexFormat";
import type { PeerIndex, PeerIndexMeta } from "../src/peers/indexTypes";
import { buildFromFiles } from "./peer-index/build";

const SOURCES = {
  tickers: {
    url: "https://www.sec.gov/files/company_tickers_exchange.json",
    file: "company_tickers_exchange.json",
    type: "application/json",
  },
  submissions: {
    url: "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip",
    file: "submissions.zip",
    type: "application/zip",
  },
  companyfacts: {
    url: "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip",
    file: "companyfacts.zip",
    type: "application/zip",
  },
} as const;
type SourceKey = keyof typeof SOURCES;

const MAX_SOURCE_AGE_DAYS = 7; // SEC republishes the zips nightly (ADR 0003)
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

function fail(message: string): never {
  console.error(`build-peer-index: ${message}`);
  process.exit(1);
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

async function download(key: SourceKey, dir: string, userAgent: string) {
  const { url, file, type } = SOURCES[key];
  const started = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (res.status === 403)
    fail(
      `${file}: HTTP 403 from SEC (rate limit or User-Agent rejected); not retrying`,
    );
  if (res.status !== 200 || !res.body) fail(`${file}: HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith(type))
    fail(`${file}: Content-Type is "${contentType}", expected ${type}`);
  const lastModified = res.headers.get("last-modified");
  const modified = lastModified ? Date.parse(lastModified) : NaN;
  if (Number.isNaN(modified))
    fail(`${file}: missing or unreadable Last-Modified`);
  const ageDays = (Date.now() - modified) / 86_400_000;
  if (ageDays > MAX_SOURCE_AGE_DAYS)
    fail(
      `${file}: Last-Modified ${lastModified} is ${ageDays.toFixed(0)} days old; SEC should republish nightly`,
    );

  const target = path.join(dir, file);
  await pipeline(
    Readable.fromWeb(res.body as never),
    createWriteStream(target),
  );
  const bytes = statSync(target).size;
  console.log(
    `downloaded ${file}: ${mb(bytes)} in ${((Date.now() - started) / 1000).toFixed(0)} s, Last-Modified ${lastModified}`,
  );
  return { url, lastModified: lastModified! };
}

function readPrevious(out: string): PeerIndex | null {
  if (!existsSync(out)) return null;
  try {
    return decodeIndex(JSON.parse(readFileSync(out, "utf8")));
  } catch {
    return null;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "work-dir": { type: "string", default: path.join(".peer-index-work") },
      out: { type: "string", default: path.join("data", "peer-index.json") },
      summary: { type: "string" },
      // Refuse to write an index with fewer listed companies (a truncated download).
      "min-listed": { type: "string", default: "0" },
      "skip-download": { type: "boolean", default: false },
    },
  });
  const dir = values["work-dir"]!;
  const out = values.out!;
  mkdirSync(dir, { recursive: true });
  const sourcesFile = path.join(dir, "sources.json");
  const started = Date.now();

  let sources: PeerIndexMeta["sources"];
  if (values["skip-download"]) {
    if (!existsSync(sourcesFile))
      fail(`--skip-download needs ${sourcesFile} from an earlier run`);
    sources = JSON.parse(readFileSync(sourcesFile, "utf8"));
  } else {
    if (!process.env.SEC_USER_AGENT && existsSync(".env.local"))
      process.loadEnvFile(".env.local");
    const userAgent = process.env.SEC_USER_AGENT;
    if (!userAgent) fail("SEC_USER_AGENT is not set");
    // One at a time: three requests, far below SEC's 10 per second.
    sources = {
      tickers: await download("tickers", dir, userAgent),
      submissions: await download("submissions", dir, userAgent),
      companyfacts: await download("companyfacts", dir, userAgent),
    };
    writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
  }

  const buildStarted = Date.now();
  const index = await buildFromFiles({
    tickersPath: path.join(dir, SOURCES.tickers.file),
    submissionsZip: path.join(dir, SOURCES.submissions.file),
    companyfactsZip: path.join(dir, SOURCES.companyfacts.file),
    sources,
    log: (m) => console.log(m),
  });
  console.log(`built in ${((Date.now() - buildStarted) / 1000).toFixed(0)} s`);

  const minListed = Number(values["min-listed"]);
  if (index.meta.counts.listed < minListed)
    fail(
      `only ${index.meta.counts.listed} listed companies (expected at least ${minListed}); not writing ${out}`,
    );

  const share = companyfactsUnreadableShare(index.meta.counts);
  if (share > UNREADABLE_SHARE_LIMIT)
    fail(
      `${index.meta.counts.unreadable.companyfacts} of ${index.meta.counts.listed} listed companies' companyfacts entries are unreadable (${(100 * share).toFixed(2)}%, limit ${100 * UNREADABLE_SHARE_LIMIT}%); SEC's format may have changed. Not writing ${out}`,
    );

  const previous = readPrevious(out);
  const text = encodeIndex(index);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
  const { counts } = index.meta;
  console.log(
    `wrote ${out}: ${mb(Buffer.byteLength(text))}; ${counts.listed} listed of ${counts.total}, ${counts.withRevenue} with screening revenue; exclusions ${JSON.stringify(counts.byExclusionReason)}; unreadable ${JSON.stringify(counts.unreadable)}`,
  );
  if (values.summary)
    writeFileSync(
      values.summary,
      summaryMarkdown(index, diffIndexes(previous, index)),
    );
  console.log(`total ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
