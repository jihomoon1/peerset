// Freezes the SEC responses for one filing into tests/fixtures/sec/<ticker>/<asof>/.
//
// Usage:
//   npx tsx scripts/capture-fixture.ts --ticker LII --cik 0001069202 \
//     --accession 0001069202-26-000087 --asof 2026Q2
//
// Reads SEC_USER_AGENT from the environment (or .env.local). The User-Agent is sent
// to SEC only; it is never written to disk or printed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const MIN_GAP_MS = 250; // at most 4 requests per second
const TIMEOUT_MS = 30_000;
const PERIODIC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);

type ManifestFile = {
  role: "submissions" | "companyfacts" | "filing-index" | "xbrl-instance";
  url: string;
  file: string;
  retrievedAt: string;
  bytes: number;
  gzippedBytes: number;
  sha256: string; // of the uncompressed response body
};

function fail(message: string): never {
  console.error(`capture-fixture: ${message}`);
  process.exit(1);
}

function readArgs() {
  const { values } = parseArgs({
    options: {
      ticker: { type: "string" },
      cik: { type: "string" },
      accession: { type: "string" },
      asof: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const { ticker, cik, accession, asof, force } = values;
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker))
    fail("--ticker must look like LII");
  if (!cik || !/^\d{10}$/.test(cik))
    fail("--cik must be 10 digits, zero-padded");
  if (!accession || !/^\d{10}-\d{2}-\d{6}$/.test(accession))
    fail("--accession must look like 0001069202-26-000087");
  if (!asof || !/^\d{4}Q[1-4]$/.test(asof))
    fail("--asof must look like 2026Q2");
  return { ticker, cik, accession, asof, force: force ?? false };
}

function loadUserAgent(): string {
  if (!process.env.SEC_USER_AGENT && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) fail("SEC_USER_AGENT is not set (put it in .env.local)");
  return ua;
}

let lastRequestAt = 0;

async function secGet(
  url: string,
  userAgent: string,
): Promise<{ body: Buffer; retrievedAt: string }> {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const retrievedAt = new Date().toISOString();
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status === 403) {
    const title =
      /<title>([^<]*)<\/title>/i.exec(body.toString("utf8"))?.[1] ??
      "(no title)";
    fail(`403 from SEC for ${url} — stopping. Page title: ${title}`);
  }
  if (res.status !== 200) fail(`HTTP ${res.status} for ${url} — stopping`);
  console.log(
    `  ${res.status}  ${body.byteLength.toLocaleString("en-US")} bytes  ${url}`,
  );
  return { body, retrievedAt };
}

async function main() {
  const { ticker, cik, accession, asof, force } = readArgs();
  const userAgent = loadUserAgent();

  const outDir = path.join("tests", "fixtures", "sec", ticker, asof);
  if (existsSync(path.join(outDir, "manifest.json")) && !force) {
    fail(
      `${outDir} already has a manifest; frozen fixtures are not overwritten (use --force deliberately)`,
    );
  }

  const cikUnpadded = String(Number(cik));
  const accessionNoDashes = accession.replaceAll("-", "");
  const archiveBase = `https://www.sec.gov/Archives/edgar/data/${cikUnpadded}/${accessionNoDashes}`;
  const files: ManifestFile[] = [];
  const toWrite: { file: string; gz: Buffer }[] = [];

  function keep(
    role: ManifestFile["role"],
    url: string,
    file: string,
    body: Buffer,
    retrievedAt: string,
  ) {
    const gz = gzipSync(body, { level: 9 });
    toWrite.push({ file, gz });
    files.push({
      role,
      url,
      file,
      retrievedAt,
      bytes: body.byteLength,
      gzippedBytes: gz.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
  }

  console.log(`Capturing ${ticker} ${accession} (${asof})`);

  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const submissions = await secGet(submissionsUrl, userAgent);
  keep(
    "submissions",
    submissionsUrl,
    "submissions.json.gz",
    submissions.body,
    submissions.retrievedAt,
  );

  const recent = JSON.parse(submissions.body.toString("utf8")).filings
    .recent as Record<string, string[]>;
  const row = recent.accessionNumber.indexOf(accession);
  if (row < 0) fail(`${accession} is not in the submissions 'recent' list`);
  const filing = {
    form: recent.form[row],
    filedDate: recent.filingDate[row],
    reportDate: recent.reportDate[row],
  };
  if (!PERIODIC_FORMS.has(filing.form))
    fail(`${accession} is a ${filing.form}, not a 10-K/10-Q`);

  const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await secGet(factsUrl, userAgent);
  keep(
    "companyfacts",
    factsUrl,
    "companyfacts.json.gz",
    facts.body,
    facts.retrievedAt,
  );

  const indexUrl = `${archiveBase}/index.json`;
  const index = await secGet(indexUrl, userAgent);
  keep(
    "filing-index",
    indexUrl,
    "index.json.gz",
    index.body,
    index.retrievedAt,
  );

  const items = JSON.parse(index.body.toString("utf8")).directory.item as {
    name: string;
  }[];
  const instances = items
    .map((item) => item.name)
    .filter((name) => name.endsWith("_htm.xml"));
  if (instances.length !== 1)
    fail(
      `expected one *_htm.xml in the filing index, found ${instances.length}`,
    );
  const instanceUrl = `${archiveBase}/${instances[0]}`;
  const instance = await secGet(instanceUrl, userAgent);
  keep(
    "xbrl-instance",
    instanceUrl,
    `${instances[0]}.gz`,
    instance.body,
    instance.retrievedAt,
  );

  // Write only after every request succeeded, so a failed run leaves nothing half-captured.
  mkdirSync(outDir, { recursive: true });
  for (const { file, gz } of toWrite)
    writeFileSync(path.join(outDir, file), gz);
  const manifest = { ticker, cik, accession, ...filing, asof, files };
  writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  const totalGz = files.reduce((sum, f) => sum + f.gzippedBytes, 0);
  console.log(
    `Wrote ${files.length} files + manifest.json to ${outDir} (${totalGz.toLocaleString("en-US")} bytes gzipped)`,
  );
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? err.message : String(err)),
);
