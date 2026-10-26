// SEC-rendered statements (methodology 0.3.0 §7 rule 1). EDGAR renders every XBRL
// filing into FilingSummary.xml plus one R#.htm page per statement. PeerSet reads the
// rendered balance sheet only to learn which concepts the company presents as face
// lines, and their labels; values come from the XBRL instance.
//
// Nothing here throws on a face problem: anything unexpected is "unavailable" with a
// reason, and the domain falls back to the 0.2.1 tag rules with W_FACE_UNAVAILABLE.

import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import {
  BALANCE_SHEET_SHORT_NAME,
  PARENTHETICAL,
  TOTAL_LABEL,
} from "@/domain/policy";
import type { FaceLine } from "@/domain/types";

export type BalanceSheetLocation =
  | { kind: "found"; file: string; shortName: string }
  | { kind: "unavailable"; reason: string };

export type ParsedBalanceSheet =
  | { kind: "parsed"; scale: string | null; lines: FaceLine[] }
  | { kind: "unavailable"; reason: string };

// ── FilingSummary.xml ───────────────────────────────────────────────────────

const summaryParser = new XMLParser({
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "Report",
});

// Only the fields used. Reports without an HtmlFileName (the "All Reports" book
// entry) are allowed and ignored.
const FilingSummarySchema = z.object({
  FilingSummary: z.object({
    MyReports: z.object({
      Report: z.array(
        z.object({
          HtmlFileName: z.string().optional(),
          ShortName: z.string().optional(),
          MenuCategory: z.string().optional(),
          Position: z.string().optional(),
        }),
      ),
    }),
  }),
});

export function locateBalanceSheet(xml: string): BalanceSheetLocation {
  let raw: unknown;
  try {
    raw = summaryParser.parse(xml, true);
  } catch {
    return {
      kind: "unavailable",
      reason: "FilingSummary.xml is not valid XML",
    };
  }
  const parsed = FilingSummarySchema.safeParse(raw);
  if (!parsed.success)
    return {
      kind: "unavailable",
      reason: "FilingSummary.xml has no FilingSummary/MyReports/Report list",
    };

  const candidates = parsed.data.FilingSummary.MyReports.Report.filter(
    (r) =>
      r.MenuCategory === "Statements" &&
      r.ShortName !== undefined &&
      BALANCE_SHEET_SHORT_NAME.test(r.ShortName) &&
      !PARENTHETICAL.test(r.ShortName) &&
      /^R\d+\.htm$/.test(r.HtmlFileName ?? ""),
  ).sort((a, b) => Number(a.Position) - Number(b.Position));
  const best = candidates[0];
  if (!best)
    return {
      kind: "unavailable",
      reason: "no balance sheet among the FilingSummary.xml statements",
    };
  return {
    kind: "found",
    file: best.HtmlFileName!,
    shortName: best.ShortName!,
  };
}

// ── R#.htm ──────────────────────────────────────────────────────────────────
// R files are generated HTML, not reliable XML, so a bounded scanner reads them:
// the first <table class="report">, its header dates, then one <tr> per row. Each
// data row links its concept as Show.showAR(this, 'defref_<prefix>_<Local>', ...).

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

// "Jun. 30, 2026", "Sept. 25, 2026", "September 25, 2026" → ISO date.
function headerDate(text: string): string | null {
  const m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(text);
  const month = m && MONTHS[m[1].toLowerCase()];
  return m && month ? `${m[3]}-${month}-${m[2].padStart(2, "0")}` : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// An out-of-range code point stays as its entity text, like an unknown named entity:
// String.fromCodePoint would throw.
const codePoint = (all: string, n: number) =>
  n <= 0x10ffff ? String.fromCodePoint(n) : all;

function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (all, n: string) => codePoint(all, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (all, n: string) =>
      codePoint(all, parseInt(n, 16)),
    )
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/[\s ]+/g, " ")
    .trim();
}

// defref_us-gaap_LongTermDebtNoncurrent → us-gaap:LongTermDebtNoncurrent. The local
// name never contains "_", so the last "_" separates prefix and name.
function conceptOf(rowHtml: string): string | null {
  const m = /'defref_([A-Za-z0-9_-]+)'/.exec(rowHtml);
  if (!m) return null;
  const cut = m[1].lastIndexOf("_");
  return cut > 0 ? `${m[1].slice(0, cut)}:${m[1].slice(cut + 1)}` : null;
}

export function parseBalanceSheet(
  html: string,
  balanceSheetDate: string,
): ParsedBalanceSheet {
  const unavailable = (reason: string): ParsedBalanceSheet => ({
    kind: "unavailable",
    reason,
  });
  const start = html.search(/<table[^>]*class="report"/);
  const end = html.indexOf("</table>", start);
  if (start < 0 || end < 0)
    return unavailable("no report table in the rendered balance sheet");
  const table = html.slice(start, end);

  const rows = [...table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)];
  const headerRows = rows.filter((r) => /<th\b/.test(r[2]));
  const headers = headerRows.flatMap((r) =>
    [...r[2].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
      cellText(m[1]),
    ),
  );
  const scale = /\$ in (Thousands|Millions|Billions)/.exec(headers[0] ?? "");
  const dates = headers.slice(1).map(headerDate);
  const column = dates.indexOf(balanceSheetDate);
  if (column < 0)
    return unavailable(
      `no column dated ${balanceSheetDate} in the rendered balance sheet`,
    );

  const lines: FaceLine[] = [];
  let order = 0;
  for (const [, attrs, body] of rows) {
    if (/<th\b/.test(body)) continue;
    // An "rh" heading starts a per-member section (WSO's share classes): those rows
    // are dimensional, not consolidated face lines.
    if (/class="rh"/.test(attrs)) break;
    const concept = conceptOf(body);
    if (!concept) continue; // footnotes
    order++;
    if (concept.endsWith("Abstract")) continue;
    const cells = [...body.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].filter(
      (c) => !/class="pl\b/.test(c[1]),
    );
    const label = cellText(/<a\b[^>]*>([\s\S]*?)<\/a>/.exec(body)?.[1] ?? "");
    lines.push({
      order,
      concept,
      label,
      total: TOTAL_LABEL.test(label),
      displayed: cells[column] ? cellText(cells[column][2]) : "",
    });
  }
  if (lines.length === 0)
    return unavailable("no concept rows in the rendered balance sheet");
  return { kind: "parsed", scale: scale?.[1] ?? null, lines };
}
