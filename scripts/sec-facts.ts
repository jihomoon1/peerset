// Runs the real SEC pipeline for one ticker against live SEC and prints what the
// adapter returns. A development tool: tests never call live SEC.
//
// Usage:
//   npx tsx scripts/sec-facts.ts --ticker LII
//
// Reads SEC_USER_AGENT from the environment (or .env.local); it is never printed.
// Requests: 1 for the ticker list, then at most 5 for the company.

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import type { ReportedFinancialFact } from "../src/domain/types";
import { PeerSetError } from "../src/lib/errors";
import { formatMillions } from "../src/lib/format";
import { createSecClient } from "../src/sec/client";
import { getCompanyFacts } from "../src/sec/freshness";
import {
  lookupTicker,
  parseTickerTable,
  TICKER_LIST_URL,
} from "../src/sec/tickers";

function fail(message: string): never {
  console.error(`sec-facts: ${message}`);
  process.exit(1);
}

function formatValue(f: ReportedFinancialFact): string {
  if (f.unit === "USD") return `${formatMillions(f.value)} USD m`;
  if (f.unit === "shares") return `${formatMillions(f.value, 3)} m shares`;
  return `${f.value} USD/share`;
}

function formatPeriod(f: ReportedFinancialFact): string {
  return f.period.kind === "instant"
    ? `at ${f.period.end}`
    : `${f.period.start}..${f.period.end}`;
}

async function main() {
  const { values } = parseArgs({ options: { ticker: { type: "string" } } });
  if (!values.ticker) fail("--ticker is required, e.g. --ticker LII");

  if (!process.env.SEC_USER_AGENT && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  let secCalls = 0;
  const client = createSecClient({
    logger: (_event, fields) => {
      secCalls++;
      console.log(
        `  [sec] ${fields.status} ${fields.host}${fields.path} ${fields.ms} ms ${Number(fields.bytes).toLocaleString("en-US")} bytes retries=${fields.retries}`,
      );
    },
  });
  // Scripts may read the clock; domain/ and sec/ never do.
  const asOf = new Date().toISOString().slice(0, 10);

  const tickers = await client.getJson(TICKER_LIST_URL);
  if (tickers.kind !== "ok") fail("ticker list returned 404");
  const match = lookupTicker(parseTickerTable(tickers.data), values.ticker);

  const result = await getCompanyFacts(match.cik, { asOf, client });
  const { identity, freshness } = result;

  console.log("\n== Identity");
  console.log(
    `  ${identity.name}  CIK ${identity.cik}  SIC ${identity.sic} (${identity.sicDescription})`,
  );
  console.log(
    `  Listings: ${identity.tickers.map((t) => `${t.ticker} (${t.exchange})`).join(", ")}`,
  );
  console.log(
    `  Fiscal year end ${identity.fiscalYearEnd}, incorporated ${identity.stateOfIncorporation}`,
  );
  const lp = identity.latestPeriodic;
  if (lp)
    console.log(
      `  Latest periodic: ${lp.form} ${lp.accession}, period ${lp.reportDate}, filed ${lp.filedDate}`,
    );
  console.log(
    `  Support: ${identity.support.supported ? "supported" : identity.support.reason.message}`,
  );

  console.log("\n== Freshness");
  console.log(`  status: ${freshness.status}`);
  console.log(`  latest periodic accession:      ${freshness.latestAccession}`);
  console.log(
    `  companyfacts newest accession:  ${freshness.companyfactsNewestAccession ?? "(none)"}`,
  );
  for (const w of result.warnings)
    console.log(`  warning ${w.code}: ${w.message}`);

  console.log("\n== Requests");
  console.log(
    `  company pipeline: ${result.requestsMade} (budget 5); with ticker list: ${secCalls}`,
  );
  console.log(
    `  facts returned: ${result.facts.length} (${result.facts.filter((f) => f.source === "filing").length} from the filing), text facts: ${result.textFacts.length}`,
  );

  // The latest two period ends among consolidated us-gaap facts, plus cover-page facts.
  const consolidated = result.facts.filter(
    (f) => Object.keys(f.dimensions).length === 0,
  );
  const ends = [
    ...new Set(
      consolidated
        .filter((f) => f.concept.startsWith("us-gaap:"))
        .map((f) => f.period.end),
    ),
  ]
    .sort()
    .slice(-2);
  const rows = result.facts
    .filter((f) =>
      f.concept.startsWith("dei:")
        ? true
        : Object.keys(f.dimensions).length === 0 && ends.includes(f.period.end),
    )
    .sort(
      (a, b) =>
        a.concept.localeCompare(b.concept) ||
        formatPeriod(a).localeCompare(formatPeriod(b)) ||
        a.filing.filedDate.localeCompare(b.filing.filedDate),
    );

  console.log(
    `\n== Facts for period ends ${ends.join(" and ")} (consolidated), plus cover-page facts`,
  );
  const header = ["concept", "period", "value", "source", "accession", "dims"];
  const table = rows.map((f) => [
    f.concept,
    formatPeriod(f),
    formatValue(f),
    f.source,
    f.filing.accession,
    Object.values(f.dimensions).join(",") || "",
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...table.map((r) => r[i].length)),
  );
  const line = (r: string[]) =>
    "  " +
    r
      .map((c, i) => (i === 2 ? c.padStart(widths[i]) : c.padEnd(widths[i])))
      .join("  ");
  console.log(line(header));
  for (const r of table) console.log(line(r));

  console.log("\n== Cover-page text facts");
  for (const t of result.textFacts)
    console.log(
      `  ${t.concept} = ${t.value}${Object.keys(t.dimensions).length ? `  [${Object.values(t.dimensions).join(",")}]` : ""}`,
    );
}

main().catch((err: unknown) => {
  if (err instanceof PeerSetError) fail(`${err.code}: ${err.detail}`);
  fail(err instanceof Error ? err.message : String(err));
});
