// Methodology §6: shares by class from the latest filing's cover page
// (dei:EntityCommonStockSharesOutstanding), each class mapped to its listed ticker
// through the cover's dei:TradingSymbol and SEC's listings for the CIK. Pure: no
// prices here; valuation.ts adds them. Mapping rules: docs/decisions/0007.

import {
  CLASS_OF_STOCK_AXIS,
  selectFact,
  selectShareClassFacts,
  type Selection,
} from "./factSelection";
import type {
  FilingReference,
  Listing,
  MetricUnsupportedReason,
  MetricWarning,
  ReportedFinancialFact,
  ReportedTextFact,
} from "./types";

const SHARES = "dei:EntityCommonStockSharesOutstanding";
const SYMBOL = "dei:TradingSymbol";
export const SINGLE_CLASS = "single";

export interface ShareClassInput {
  facts: readonly ReportedFinancialFact[];
  textFacts: readonly ReportedTextFact[];
  latest: FilingReference; // the latest periodic filing: its cover is the source
  listings: readonly Listing[]; // SEC's listings for the CIK
  balanceSheetDate: string;
}

export interface ShareClass {
  classMember: string; // 'us-gaap:CommonClassBMember', or 'single'
  ticker?: string; // SEC's spelling ('WSO-B'); absent = unlisted class
  exchange?: string;
  coverSymbol?: string; // as the cover shows it ('WSOB')
  shares: number;
  sharesAsOf: string; // the cover date, usually weeks after the balance sheet
  coverFiling: FilingReference;
  fact: ReportedFinancialFact;
}

// Why no market cap can be built from these classes, whatever the prices.
export type ShareClassBlocker =
  | { status: "missing"; reason: string }
  | { status: "unsupported"; reason: MetricUnsupportedReason };

export interface ShareClasses {
  classes: ShareClass[];
  blocker?: ShareClassBlocker;
  warnings: MetricWarning[];
}

// 'WSOB', 'WSO-B', 'WSO.B' and 'WSO/B' all name the same class.
export const normalizeSymbol = (s: string): string =>
  s.toUpperCase().replace(/[.\-/\s]/g, "");

const unsupported = (
  code: MetricUnsupportedReason["code"],
  message: string,
): ShareClassBlocker => ({ status: "unsupported", reason: { code, message } });

export function computeShareClasses(input: ShareClassInput): ShareClasses {
  const { latest } = input;
  const fromLatest = input.facts.filter(
    (f) =>
      f.concept === SHARES &&
      f.source === "filing" &&
      f.filing.accession === latest.accession &&
      f.period.kind === "instant",
  );
  if (fromLatest.length === 0)
    return {
      classes: [],
      blocker: {
        status: "missing",
        reason: "no cover-page share count in the latest filing",
      },
      warnings: [],
    };

  // The cover reports one date; if several appear, the latest is the cover's.
  const sharesAsOf = fromLatest
    .map((f) => f.period.end)
    .reduce((a, b) => (a > b ? a : b));
  const symbols = input.textFacts.filter(
    (t) => t.concept === SYMBOL && t.filing.accession === latest.accession,
  );
  const listingOf = (symbol: string) =>
    input.listings.find(
      (l) => normalizeSymbol(l.ticker) === normalizeSymbol(symbol),
    );

  const warnings: MetricWarning[] = [];
  const consolidated = selectFact(fromLatest, SHARES, { end: sharesAsOf });
  const perClass = selectShareClassFacts(fromLatest, SHARES, {
    end: sharesAsOf,
  });

  const pairs: { member: string; selection: Selection; symbol?: string }[] = [];
  let blocker: ShareClassBlocker | undefined;

  if (perClass.length > 0) {
    for (const { classMember, selection } of perClass)
      pairs.push({
        member: classMember,
        selection,
        symbol: symbols
          .find((t) => t.dimensions[CLASS_OF_STOCK_AXIS] === classMember)
          ?.value.trim(),
      });
  } else {
    // One share count. Its ticker is the cover symbol SEC lists for the CIK; cover
    // symbols for listed notes (Carrier, Trane) aren't in SEC's list and drop out.
    const listed = [
      ...new Set(
        symbols
          .map((t) => t.value.trim())
          .filter((s) => listingOf(s) !== undefined),
      ),
    ];
    const plain = symbols.find((t) => Object.keys(t.dimensions).length === 0);
    if (listed.length > 1)
      blocker = unsupported(
        "SHARE_CLASS_MISMATCH",
        `one cover share count for several listed classes (${listed.join(", ")}); share counts by class are needed`,
      );
    pairs.push({
      member: SINGLE_CLASS,
      selection: consolidated,
      symbol: listed.length === 1 ? listed[0] : plain?.value.trim(),
    });
  }

  const classes: ShareClass[] = [];
  for (const { member, selection, symbol } of pairs) {
    if (selection.kind === "conflict") {
      blocker ??= unsupported(
        "SOURCE_CONFLICT",
        `cover share counts for ${member} disagree within the filing`,
      );
      continue;
    }
    if (selection.kind === "none") continue;
    const listing = symbol ? listingOf(symbol) : undefined;
    if (symbol && !listing)
      warnings.push({
        code: "W_TICKER_NOT_IN_SEC_LIST",
        message: `cover symbol '${symbol}' for ${member} is not in SEC's listings for the company`,
        severity: "caution",
      });
    if (!symbol)
      blocker ??= unsupported(
        "UNLISTED_SHARE_CLASS",
        member === SINGLE_CLASS
          ? `unlisted share class: ${member} (no dei:TradingSymbol on the cover page)`
          : `unlisted share class: ${member}`,
      );
    classes.push({
      classMember: member,
      ...(symbol
        ? { ticker: listing?.ticker ?? symbol, coverSymbol: symbol }
        : {}),
      ...(listing ? { exchange: listing.exchange } : {}),
      shares: selection.fact.value,
      sharesAsOf,
      coverFiling: selection.fact.filing,
      fact: selection.fact,
    });
  }

  if (sharesAsOf > input.balanceSheetDate)
    warnings.push({
      code: "W_SHARES_AFTER_BALANCE_SHEET",
      message: `shares are as of ${sharesAsOf} (cover page), after the ${input.balanceSheetDate} balance sheet`,
      severity: "info",
    });

  return { classes, ...(blocker ? { blocker } : {}), warnings };
}
