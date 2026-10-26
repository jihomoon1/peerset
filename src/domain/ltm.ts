// LTM construction (methodology §2). After a 10-K, LTM is that fiscal year. After a
// 10-Q, LTM = FY(prior) + YTD(current) − YTD(prior year), used only when every check
// passes. Concept choice follows §3: the highest-priority concept that has every
// component, never mixing concepts across components. Pure: no clock, no I/O.

import { addDays, daysBetween } from "./dates";
import { selectFact, type PeriodKey } from "./factSelection";
import {
  FISCAL_YEAR_DAYS,
  PERIODIC_FORMS,
  PRIOR_YTD_DURATION_TOLERANCE_DAYS,
  PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS,
  YTD_START_TOLERANCE_DAYS,
} from "./policy";
import type {
  FreshnessStatus,
  LTMCalculation,
  LTMCheck,
  MetricUnsupportedReason,
  MetricWarning,
  PeriodicForm,
  ReportedFinancialFact,
  ReportingPeriod,
} from "./types";

export interface LtmInput {
  facts: readonly ReportedFinancialFact[];
  ltmEnd: string; // period end of the latest 10-K or 10-Q
  latestForm: PeriodicForm;
  freshness: FreshnessStatus;
}

export type LtmResult =
  | {
      kind: "ok";
      value: number;
      period: ReportingPeriod; // the LTM window
      calc: LTMCalculation;
      warnings: MetricWarning[];
    }
  | {
      kind: "unsupported";
      reason: MetricUnsupportedReason;
      warnings: MetricWarning[];
      calc?: LTMCalculation; // present when the components were found but a check failed
    };

// Search bounds that decide which periods are candidates for each component. They
// never decide the result on their own: a period outside them is "missing", one
// inside them still has to pass the §2 checks. Both outcomes are Unsupported.
const MIN_ANNUAL_DAYS = 300; // longer than any 9-month YTD (≤ 280 days for 40 weeks)
const PRIOR_YTD_SEARCH_DAYS = 45;

const YEAR_DAYS = 365;
const WEEKS_53_DAYS = 371;

// Inclusive length: 2025-01-01 to 2025-12-31 is 365 days.
const lengthDays = (start: string, end: string) => daysBetween(start, end) + 1;

interface Candidate {
  start: string;
  end: string;
  annualFiling: boolean; // reported by a 10-K or 10-K/A
}

function candidatePeriods(
  facts: readonly ReportedFinancialFact[],
  concept: string,
): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const f of facts) {
    if (
      f.concept !== concept ||
      f.period.kind !== "duration" ||
      !f.period.start ||
      Object.keys(f.dimensions).length > 0 ||
      !PERIODIC_FORMS.has(f.filing.form)
    )
      continue;
    const key = `${f.period.start}/${f.period.end}`;
    const c = byKey.get(key) ?? {
      start: f.period.start,
      end: f.period.end,
      annualFiling: false,
    };
    if (f.filing.form.startsWith("10-K")) c.annualFiling = true;
    byKey.set(key, c);
  }
  return [...byKey.values()];
}

type Component =
  | { kind: "found"; fact: ReportedFinancialFact }
  | { kind: "missing"; what: string }
  | { kind: "conflict"; what: string; facts: ReportedFinancialFact[] };

function pick(
  facts: readonly ReportedFinancialFact[],
  concept: string,
  period: PeriodKey | undefined,
  what: string,
): Component {
  if (!period) return { kind: "missing", what };
  const s = selectFact(facts, concept, period);
  if (s.kind === "found") return { kind: "found", fact: s.fact };
  if (s.kind === "conflict") return { kind: "conflict", what, facts: s.facts };
  return { kind: "missing", what };
}

function closest<T>(items: T[], distance: (t: T) => number): T | undefined {
  let best: T | undefined;
  for (const t of items)
    if (best === undefined || distance(t) < distance(best)) best = t;
  return best;
}

// The components for one concept, before any check is applied.
function findComponents(
  input: LtmInput,
  concept: string,
): { annual: boolean; components: Component[] } {
  const { facts, ltmEnd } = input;
  const periods = candidatePeriods(facts, concept);
  const annual = input.latestForm.startsWith("10-K");
  const isFy = (c: Candidate) =>
    c.annualFiling && lengthDays(c.start, c.end) >= MIN_ANNUAL_DAYS;

  if (annual) {
    const fy = periods.find((c) => isFy(c) && c.end === ltmEnd);
    return {
      annual,
      components: [pick(facts, concept, fy, "fiscal year")],
    };
  }

  // Latest fiscal year ending before the LTM end.
  const fy = periods
    .filter((c) => isFy(c) && c.end < ltmEnd)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  // Current YTD: ends at the LTM end, starts nearest the day after the FY ends.
  const ytd = fy
    ? closest(
        periods.filter(
          (c) =>
            c.end === ltmEnd && lengthDays(c.start, c.end) < MIN_ANNUAL_DAYS,
        ),
        (c) => Math.abs(daysBetween(addDays(fy.end, 1), c.start)),
      )
    : undefined;
  // Prior-year YTD: starts about a year before the current YTD, similar length.
  const prior = ytd
    ? closest(
        periods.filter(
          (c) =>
            c.end < ytd.start &&
            Math.abs(daysBetween(c.start, ytd.start) - YEAR_DAYS) <=
              PRIOR_YTD_SEARCH_DAYS,
        ),
        (c) =>
          Math.abs(daysBetween(c.start, ytd.start) - YEAR_DAYS) +
          Math.abs(lengthDays(c.start, c.end) - lengthDays(ytd.start, ytd.end)),
      )
    : undefined;

  return {
    annual,
    components: [
      pick(facts, concept, fy, "fiscal year"),
      pick(facts, concept, ytd, "current YTD"),
      pick(facts, concept, prior, "prior-year YTD"),
    ],
  };
}

function runChecks(
  fy: ReportedFinancialFact,
  ytd?: ReportedFinancialFact,
  prior?: ReportedFinancialFact,
): LTMCheck[] {
  const span = (f: ReportedFinancialFact) => ({
    start: f.period.start!,
    end: f.period.end,
    days: lengthDays(f.period.start!, f.period.end),
  });
  const y = span(fy);
  const checks: LTMCheck[] = [
    {
      name: "fiscal-year-duration",
      passed: y.days >= FISCAL_YEAR_DAYS.min && y.days <= FISCAL_YEAR_DAYS.max,
      detail: `FY ${y.start} to ${y.end} is ${y.days} days (allowed ${FISCAL_YEAR_DAYS.min}–${FISCAL_YEAR_DAYS.max})`,
    },
  ];
  if (!ytd || !prior) return checks;

  const c = span(ytd);
  const p = span(prior);
  const startGap = daysBetween(y.end, c.start) - 1;
  const lengthGap = p.days - c.days;
  const offset = daysBetween(p.start, c.start);
  checks.push(
    {
      name: "ytd-starts-after-fiscal-year",
      passed: Math.abs(startGap) <= YTD_START_TOLERANCE_DAYS,
      detail: `current YTD starts ${c.start}, ${startGap} days from the day after FY end ${y.end} (allowed ±${YTD_START_TOLERANCE_DAYS})`,
    },
    {
      name: "prior-ytd-duration",
      passed: Math.abs(lengthGap) <= PRIOR_YTD_DURATION_TOLERANCE_DAYS,
      detail: `prior-year YTD is ${p.days} days vs current YTD ${c.days} days (allowed ±${PRIOR_YTD_DURATION_TOLERANCE_DAYS})`,
    },
    {
      name: "prior-ytd-start-offset",
      passed:
        Math.abs(offset - YEAR_DAYS) <= PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS,
      detail: `prior-year YTD starts ${p.start}, ${offset} days before ${c.start} (allowed ${YEAR_DAYS} ±${PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS})`,
    },
    {
      name: "same-concept",
      passed: fy.concept === ytd.concept && ytd.concept === prior.concept,
      detail: `all three components use ${fy.concept}`,
    },
  );
  return checks;
}

const unsupported = (
  code: MetricUnsupportedReason["code"],
  message: string,
  warnings: MetricWarning[] = [],
  calc?: LTMCalculation,
): LtmResult => ({
  kind: "unsupported",
  reason: { code, message },
  warnings,
  calc,
});

// LTM for one concept. "no-components" means the concept lacks a component, so the
// caller may try the next concept in the priority list.
export function ltmForConcept(
  input: LtmInput,
  concept: string,
): LtmResult | { kind: "no-components"; missing: string[] } {
  const { annual, components } = findComponents(input, concept);

  const conflict = components.find((c) => c.kind === "conflict");
  if (conflict?.kind === "conflict") {
    const accessions = [
      ...new Set(conflict.facts.map((f) => f.filing.accession)),
    ];
    const message = `${concept} ${conflict.what}: companyfacts and the filing disagree (${conflict.facts.map((f) => `${f.source} ${f.value}`).join(" vs ")}, ${accessions.join(", ")})`;
    return unsupported("SOURCE_CONFLICT", message, [
      { code: "W_SOURCE_CONFLICT", message, severity: "caution" },
    ]);
  }
  const missing = components.flatMap((c) =>
    c.kind === "missing" ? [c.what] : [],
  );
  if (missing.length > 0) return { kind: "no-components", missing };

  const [fy, ytdCurrent, ytdPrior] = components.map(
    (c) => (c as { fact: ReportedFinancialFact }).fact,
  );
  const checks = runChecks(fy, ytdCurrent, ytdPrior);
  const calc: LTMCalculation = annual
    ? { method: "annual", concept, ltmEnd: input.ltmEnd, fy, checks }
    : {
        method: "fy_plus_ytd_minus_prior_ytd",
        concept,
        ltmEnd: input.ltmEnd,
        fy,
        ytdCurrent,
        ytdPrior,
        checks,
      };

  const failed = checks.filter((c) => !c.passed);
  if (failed.length > 0)
    return unsupported(
      "LTM_CHECK_FAILED",
      `cannot reconstruct LTM: ${failed.map((c) => `${c.name} failed (${c.detail})`).join("; ")}`,
      [],
      calc,
    );

  const value = annual
    ? fy.value
    : fy.value + ytdCurrent.value - ytdPrior.value;
  const start = annual ? fy.period.start! : addDays(ytdPrior.period.end, 1);
  const period: ReportingPeriod = {
    kind: "duration",
    start,
    end: input.ltmEnd,
  };

  const warnings: MetricWarning[] = [];
  if (lengthDays(start, input.ltmEnd) >= WEEKS_53_DAYS)
    warnings.push({
      code: "W_53_WEEKS",
      message: `LTM covers 53 weeks (${start} to ${input.ltmEnd})`,
      severity: "info",
    });
  const fromFiling = [fy, ytdCurrent, ytdPrior].some(
    (f) => f?.source === "filing",
  );
  if (input.freshness === "filing-parsed" && fromFiling)
    warnings.push({
      code: "W_FILING_PARSED",
      message: "companyfacts was behind; values parsed from the filing",
      severity: "info",
    });

  return { kind: "ok", value, period, calc: { ...calc, value }, warnings };
}

// LTM for a metric: the first concept in priority order that has every component.
export function computeLtm(
  input: LtmInput,
  concepts: readonly string[],
): LtmResult {
  if (input.freshness === "filing-missing")
    return unsupported(
      "FILING_MISSING",
      "the latest filing's data is not available yet; LTM is never computed on an older quarter",
    );
  const misses: string[] = [];
  for (const concept of concepts) {
    const r = ltmForConcept(input, concept);
    if (r.kind !== "no-components") return r;
    misses.push(`${concept}: missing ${r.missing.join(", ")}`);
  }
  const needed = input.latestForm.startsWith("10-K")
    ? "the fiscal year"
    : "FY, current YTD and prior-year YTD";
  return unsupported(
    "NO_CONCEPT_WITH_ALL_COMPONENTS",
    `no concept has ${needed} (${misses.join("; ")})`,
  );
}
