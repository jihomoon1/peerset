// Methodology §1 rule 1: for a (concept, period), use the consolidated fact from the
// most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports exactly that period.
// This one rule handles duplicates, restatements, amendments and split-restated
// comparatives. Share classes (§6) are the only dimensional facts we select.

import { PERIODIC_FORMS } from "./policy";
import type { ReportedFinancialFact } from "./types";

// start present = a duration; absent = an instant.
export interface PeriodKey {
  start?: string;
  end: string;
}

export type Selection =
  | { kind: "found"; fact: ReportedFinancialFact }
  // Facts filed on the same day disagree, so no latest value can be chosen.
  | { kind: "conflict"; facts: ReportedFinancialFact[] }
  | { kind: "none" };

export const CLASS_OF_STOCK_AXIS = "us-gaap:StatementClassOfStockAxis";

function matchesPeriod(f: ReportedFinancialFact, p: PeriodKey): boolean {
  if (f.period.end !== p.end) return false;
  if (p.start === undefined) return f.period.kind === "instant";
  return f.period.kind === "duration" && f.period.start === p.start;
}

// Order among facts filed the same day with the same value: the filing's own
// instance over companyfacts, an amendment over the original, then the higher
// accession. Values are equal, so this only decides whose provenance is shown.
function preference(f: ReportedFinancialFact): [number, number, string] {
  return [
    f.source === "filing" ? 1 : 0,
    f.filing.form.endsWith("/A") ? 1 : 0,
    f.filing.accession,
  ];
}

function preferred(
  a: ReportedFinancialFact,
  b: ReportedFinancialFact,
): ReportedFinancialFact {
  const [pa, pb] = [preference(a), preference(b)];
  for (let i = 0; i < pa.length; i++)
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? a : b;
  return a;
}

function latestFiled(candidates: ReportedFinancialFact[]): Selection {
  if (candidates.length === 0) return { kind: "none" };
  let latestDate = "";
  for (const f of candidates)
    if (f.filing.filedDate > latestDate) latestDate = f.filing.filedDate;
  const latest = candidates.filter((f) => f.filing.filedDate === latestDate);
  if (latest.some((f) => f.value !== latest[0].value))
    return { kind: "conflict", facts: latest };
  return { kind: "found", fact: latest.reduce(preferred) };
}

export function selectFact(
  facts: readonly ReportedFinancialFact[],
  concept: string,
  period: PeriodKey,
): Selection {
  return latestFiled(
    facts.filter(
      (f) =>
        f.concept === concept &&
        PERIODIC_FORMS.has(f.filing.form) &&
        Object.keys(f.dimensions).length === 0 &&
        matchesPeriod(f, period),
    ),
  );
}

export interface ShareClassFact {
  classMember: string; // 'us-gaap:CommonClassBMember'
  selection: Exclude<Selection, { kind: "none" }>;
}

// One selection per class of stock, for facts dimensioned only by
// StatementClassOfStockAxis. A conflicting class is returned, never dropped, so a
// class can't silently vanish from market cap.
export function selectShareClassFacts(
  facts: readonly ReportedFinancialFact[],
  concept: string,
  period: PeriodKey,
): ShareClassFact[] {
  const byClass = new Map<string, ReportedFinancialFact[]>();
  for (const f of facts) {
    const keys = Object.keys(f.dimensions);
    if (
      f.concept !== concept ||
      !PERIODIC_FORMS.has(f.filing.form) ||
      keys.length !== 1 ||
      keys[0] !== CLASS_OF_STOCK_AXIS ||
      !matchesPeriod(f, period)
    )
      continue;
    const member = f.dimensions[CLASS_OF_STOCK_AXIS];
    byClass.set(member, [...(byClass.get(member) ?? []), f]);
  }
  const out: ShareClassFact[] = [];
  for (const [classMember, candidates] of [...byClass].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const selection = latestFiled(candidates);
    if (selection.kind !== "none") out.push({ classMember, selection });
  }
  return out;
}
