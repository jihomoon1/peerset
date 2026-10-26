// Freezes the SEC responses for one filing into tests/fixtures/sec/<ticker>/<asof>/.
//
// Usage:
//   npx tsx scripts/capture-fixture.ts --ticker LII --cik 0001069202 \
//     --accession 0001069202-26-000087 --asof 2026Q2
//
// --add-statements adds only FilingSummary.xml and the balance-sheet R file to an
// existing fixture, leaving its other frozen files (and the goldens built on them)
// untouched.
//
// Reads SEC_USER_AGENT from the environment (or .env.local). The User-Agent is sent
// to SEC only; it is never written to disk or printed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const MIN_GAP_MS = 250; // at most 4 requests per second
const TIMEOUT_MS = 30_000;
const PERIODIC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);

type ManifestFile = {
  role:
    | "submissions"
    | "companyfacts"
    | "filing-index"
    | "xbrl-instance"
    | "filing-summary"
    | "statement-balance-sheet";
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
      "add-statements": { type: "boolean", default: false },
    },
  });
  const { ticker, cik, accession, asof, force } = values;
  const addStatements = values["add-statements"] ?? false;
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker))
    fail("--ticker must look like LII");
  if (!cik || !/^\d{10}$/.test(cik))
    fail("--cik must be 10 digits, zero-padded");
  if (!accession || !/^\d{10}-\d{2}-\d{6}$/.test(accession))
    fail("--accession must look like 0001069202-26-000087");
  if (!asof || !/^\d{4}Q[1-4]$/.test(asof))
    fail("--asof must look like 2026Q2");
  return {
    ticker,
    cik,
    accession,
    asof,
    force: force ?? false,
    addStatements,
  };
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
  const { ticker, cik, accession, asof, force, addStatements } = readArgs();
  const userAgent = loadUserAgent();

  const outDir = path.join("tests", "fixtures", "sec", ticker, asof);
  if (addStatements) return addStatementsTo(outDir, cik, accession, userAgent);
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
  reportNewerPeriodic(recent, accession, filing.filedDate);

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

  for (const s of await fetchStatements(archiveBase, userAgent))
    keep(s.role, s.url, s.file, s.body, s.retrievedAt);

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

// Says so when the captured filing is no longer the company's latest 10-K/10-Q.
function reportNewerPeriodic(
  recent: Record<string, string[]>,
  accession: string,
  filedDate: string,
) {
  const newer = recent.accessionNumber
    .map((acc, i) => ({
      acc,
      form: recent.form[i],
      filed: recent.filingDate[i],
    }))
    .filter((f) => PERIODIC_FORMS.has(f.form) && f.filed > filedDate);
  if (newer.length === 0)
    console.log(`  ${accession} is the latest periodic filing`);
  else
    for (const f of newer)
      console.log(
        `  NOTE: newer periodic filing exists: ${f.form} ${f.acc} filed ${f.filed}`,
      );
}

// The balance sheet in FilingSummary.xml: a "Statements" report whose short name is a
// balance sheet / financial position / financial condition, not "Parenthetical";
// the lowest Position wins. The adapter (src/sec/statements.ts) applies the same rule.
function locateBalanceSheetFile(summaryXml: string): string {
  const candidates = [
    ...summaryXml.matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g),
  ]
    .map((m) => {
      const tag = (name: string) =>
        new RegExp(`<${name}>([^<]*)</${name}>`).exec(m[1])?.[1]?.trim() ?? "";
      return {
        file: tag("HtmlFileName"),
        shortName: tag("ShortName"),
        category: tag("MenuCategory"),
        position: Number(tag("Position")),
      };
    })
    .filter(
      (r) =>
        r.category === "Statements" &&
        /balance sheet|financial position|financial condition/i.test(
          r.shortName,
        ) &&
        !/parenthetical/i.test(r.shortName) &&
        /^R\d+\.htm$/.test(r.file),
    )
    .sort((a, b) => a.position - b.position);
  if (candidates.length === 0) fail("no balance sheet in FilingSummary.xml");
  console.log(
    `  balance sheet: ${candidates[0].file} "${candidates[0].shortName}"`,
  );
  return candidates[0].file;
}

async function fetchStatements(archiveBase: string, userAgent: string) {
  const summaryUrl = `${archiveBase}/FilingSummary.xml`;
  const summary = await secGet(summaryUrl, userAgent);
  const rFile = locateBalanceSheetFile(summary.body.toString("utf8"));
  const rUrl = `${archiveBase}/${rFile}`;
  const r = await secGet(rUrl, userAgent);
  return [
    {
      role: "filing-summary" as const,
      url: summaryUrl,
      file: "FilingSummary.xml.gz",
      ...summary,
    },
    {
      role: "statement-balance-sheet" as const,
      url: rUrl,
      file: `${rFile}.gz`,
      ...r,
    },
  ];
}

async function addStatementsTo(
  outDir: string,
  cik: string,
  accession: string,
  userAgent: string,
) {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!existsSync(manifestPath)) fail(`${manifestPath} does not exist`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    accession: string;
    files: ManifestFile[];
  };
  if (manifest.accession !== accession)
    fail(`${manifestPath} is for ${manifest.accession}, not ${accession}`);
  if (manifest.files.some((f) => f.role === "filing-summary"))
    fail(`${outDir} already has statements`);

  console.log(`Adding statements to ${outDir}`);
  const archiveBase = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}`;
  const statements = await fetchStatements(archiveBase, userAgent);
  for (const s of statements) {
    const gz = gzipSync(s.body, { level: 9 });
    writeFileSync(path.join(outDir, s.file), gz);
    manifest.files.push({
      role: s.role,
      url: s.url,
      file: s.file,
      retrievedAt: s.retrievedAt,
      bytes: s.body.byteLength,
      gzippedBytes: gz.byteLength,
      sha256: createHash("sha256").update(s.body).digest("hex"),
    });
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Added ${statements.length} files to ${outDir}`);
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? err.message : String(err)),
);
