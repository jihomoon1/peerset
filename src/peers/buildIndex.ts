// The pure half of the peer-index build (blueprint §10.1): which companies are in the
// universe, what each record holds, the metadata counts, and the month-to-month diff
// for the refresh PR. scripts/peer-index/build.ts does the file reading.

import { METHODOLOGY_VERSION } from "@/domain/policy";
import type { ScreeningRevenue } from "@/domain/screeningRevenue";
import type { Listing } from "@/domain/types";
import {
  CompanyTickersExchangeSchema,
  parseOrThrow,
  type Submissions,
} from "@/sec/schemas";
import { FOREIGN_FORMS, latestReport } from "@/sec/submissions";
import { padCik } from "@/sec/urls";
import {
  MAJOR_EXCHANGES,
  type PeerIndex,
  type PeerIndexCompany,
  type PeerIndexMeta,
} from "./indexTypes";
import { exclusionFor } from "./screen";

export interface Universe {
  total: number; // CIKs in the ticker list
  listed: Map<string, { name: string; listings: Listing[] }>; // by CIK, file order
  unlisted: Listing[]; // every off-exchange row, file order
}

// company_tickers_exchange.json → the listed universe. A CIK is listed when any of its
// rows is on a major exchange; its listings keep SEC's order, so the first is the
// primary ticker.
export function listedUniverse(raw: unknown): Universe {
  const table = parseOrThrow(
    CompanyTickersExchangeSchema,
    raw,
    "company tickers",
  );
  const all = new Set<string>();
  const listed = new Map<string, { name: string; listings: Listing[] }>();
  const unlisted: Listing[] = [];
  for (const [cikNumber, name, ticker, exchange] of table.data) {
    const cik = padCik(cikNumber);
    all.add(cik);
    if (exchange !== null && MAJOR_EXCHANGES.has(exchange)) {
      const entry = listed.get(cik) ?? { name, listings: [] };
      entry.listings.push({ ticker, exchange });
      listed.set(cik, entry);
    } else unlisted.push({ ticker, exchange: exchange ?? "" });
  }
  return { total: all.size, listed, unlisted };
}

// One company's record. `submissions` is null when the bulk file has no (readable)
// entry; `revenue` is null when companyfacts has none.
export function companyRecord(
  cik: string,
  listed: { name: string; listings: Listing[] },
  submissions: Submissions | null,
  revenue: ScreeningRevenue | { kind: "none"; reason: string },
): PeerIndexCompany {
  const latest = submissions ? latestReport(submissions) : undefined;
  return {
    cik,
    name: submissions?.name ?? listed.name,
    ticker: listed.listings[0].ticker,
    listings: listed.listings,
    sic: submissions?.sic ?? "",
    sicDescription: submissions?.sicDescription ?? "",
    fiscalYearEnd: submissions?.fiscalYearEnd ?? "",
    incorporation: submissions?.stateOfIncorporation ?? "",
    latest: latest
      ? {
          form: latest.form,
          filedDate: latest.filedDate,
          reportDate: latest.reportDate,
          accession: latest.accession,
        }
      : null,
    files20F: latest ? FOREIGN_FORMS.has(latest.form) : false,
    revenue:
      revenue.kind === "ok"
        ? {
            value: revenue.value,
            periodEnd: revenue.periodEnd,
            concept: revenue.concept,
            accession: revenue.accession,
          }
        : null,
    revenueNote: revenue.kind === "ok" ? null : revenue.reason,
  };
}

// The index with its metadata. generatedAt is the newest source Last-Modified, so the
// same SEC files always give the same bytes (no clock read) and an unchanged month
// opens no PR.
export function assembleIndex(
  universe: Universe,
  companies: PeerIndexCompany[],
  sources: PeerIndexMeta["sources"],
  unreadable: PeerIndexMeta["counts"]["unreadable"],
): PeerIndex {
  const generatedAt = new Date(
    Math.max(...Object.values(sources).map((s) => Date.parse(s.lastModified))),
  ).toISOString();
  const day = generatedAt.slice(0, 10);

  const byExclusionReason: Record<string, number> = {};
  for (const c of companies) {
    const why = exclusionFor(c, day);
    if (why)
      byExclusionReason[why.code] = (byExclusionReason[why.code] ?? 0) + 1;
  }
  return {
    meta: {
      generatedAt,
      methodologyVersion: METHODOLOGY_VERSION,
      sources,
      counts: {
        total: universe.total,
        listed: companies.length,
        withRevenue: companies.filter((c) => c.revenue).length,
        byExclusionReason: sortKeys(byExclusionReason),
        unreadable,
      },
    },
    companies: [...companies].sort((a, b) => a.cik.localeCompare(b.cik)),
    unlisted: universe.unlisted,
  };
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export interface IndexDiff {
  added: PeerIndexCompany[];
  removed: PeerIndexCompany[];
  reclassified: { company: PeerIndexCompany; fromSic: string }[];
}

// What changed since the committed index, for the refresh PR body.
export function diffIndexes(
  prev: PeerIndex | null,
  next: PeerIndex,
): IndexDiff {
  const before = new Map(prev?.companies.map((c) => [c.cik, c]) ?? []);
  const after = new Set(next.companies.map((c) => c.cik));
  const added: PeerIndexCompany[] = [];
  const reclassified: IndexDiff["reclassified"] = [];
  for (const c of next.companies) {
    const old = before.get(c.cik);
    if (!old) added.push(c);
    else if (old.sic !== c.sic)
      reclassified.push({ company: c, fromSic: old.sic });
  }
  const removed = (prev?.companies ?? []).filter((c) => !after.has(c.cik));
  return { added, removed, reclassified };
}

const LIST_LIMIT = 50;

function listLines<T>(items: T[], line: (t: T) => string): string[] {
  const shown = items.slice(0, LIST_LIMIT).map((t) => `- ${line(t)}`);
  if (items.length > LIST_LIMIT)
    shown.push(`- … and ${items.length - LIST_LIMIT} more`);
  return shown;
}

// The refresh PR body (Markdown): counts, then added, removed and reclassified.
export function summaryMarkdown(next: PeerIndex, diff: IndexDiff): string {
  const { counts, sources, generatedAt, methodologyVersion } = next.meta;
  const who = (c: PeerIndexCompany) =>
    `${c.ticker} · ${c.name} (CIK ${c.cik}, SIC ${c.sic || "none"})`;
  return [
    "Monthly refresh of `data/peer-index.json` from SEC bulk data (blueprint §10.1).",
    "",
    `- Data as of: ${generatedAt} · methodology ${methodologyVersion}`,
    `- Sources (Last-Modified): ticker list ${sources.tickers.lastModified}; submissions.zip ${sources.submissions.lastModified}; companyfacts.zip ${sources.companyfacts.lastModified}`,
    `- Companies in SEC's ticker list: ${counts.total}; listed on NYSE, Nasdaq or Cboe: ${counts.listed}; with screening revenue: ${counts.withRevenue}`,
    `- Excluded on the data date, by reason: ${
      Object.entries(counts.byExclusionReason)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ") || "none"
    }`,
    `- Unreadable bulk entries: submissions ${counts.unreadable.submissions}, companyfacts ${counts.unreadable.companyfacts}`,
    "",
    `### Added (${diff.added.length})`,
    ...listLines(diff.added, who),
    "",
    `### Removed (${diff.removed.length})`,
    ...listLines(diff.removed, who),
    "",
    `### Reclassified SIC (${diff.reclassified.length})`,
    ...listLines(
      diff.reclassified,
      (r) => `${who(r.company)}: was SIC ${r.fromSic || "none"}`,
    ),
    "",
  ].join("\n");
}
