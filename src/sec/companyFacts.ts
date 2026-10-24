// Trims SEC companyfacts (LII: 4.3 MB) down to the whitelisted, periodic, accepted-unit
// facts PeerSet uses, in the shared ReportedFinancialFact shape (blueprint §8.5).
// No selection happens here: every surviving fact is returned, duplicates included.

import {
  ACCEPTED_UNITS,
  CONCEPT_WHITELIST,
  PERIODIC_FORMS,
} from "@/domain/policy";
import { addDays } from "@/domain/dates";
import type {
  FilingReference,
  PeriodicForm,
  ReportedFinancialFact,
} from "@/domain/types";
import {
  CompanyFactsSchema,
  ConceptFactsSchema,
  parseOrThrow,
} from "./schemas";
import { filingIndexPageUrl, padCik } from "./urls";

// Periods ending more than this many days before the newest us-gaap period end are
// dropped. LTM reaches back at most about one year, so two years leaves a full spare
// year while keeping LII's output near 100 KB (docs/decisions/0005).
export const FACT_HISTORY_DAYS = 730;

export interface TrimmedCompanyFacts {
  facts: ReportedFinancialFact[];
  periodicAccessions: Set<string>;
  newestPeriodicAccession: string | null; // by filed date
}

export interface TrimOptions {
  // accession → report date, from submissions. companyfacts has no report date, so
  // without it the latest period end among the filing's us-gaap facts is used.
  reportDates?: Map<string, string>;
}

type Unit = ReportedFinancialFact["unit"];

export function trimCompanyFacts(
  raw: unknown,
  options: TrimOptions = {},
): TrimmedCompanyFacts {
  const cf = parseOrThrow(CompanyFactsSchema, raw, "companyfacts");
  const cik = padCik(cf.cik);

  type Row = Omit<ReportedFinancialFact, "filing"> & {
    accn: string;
    form: PeriodicForm;
    filed: string;
  };
  const rows: Row[] = [];

  for (const [taxonomy, concepts] of Object.entries(cf.facts)) {
    for (const [localName, conceptRaw] of Object.entries(concepts)) {
      const concept = `${taxonomy}:${localName}`;
      if (!CONCEPT_WHITELIST.has(concept)) continue;
      const { units } = parseOrThrow(
        ConceptFactsSchema,
        conceptRaw,
        `companyfacts: facts.${taxonomy}.${localName}`,
      );
      for (const [unit, facts] of Object.entries(units)) {
        if (!ACCEPTED_UNITS.has(unit)) continue;
        for (const f of facts) {
          if (!PERIODIC_FORMS.has(f.form)) continue;
          rows.push({
            concept,
            value: f.val,
            unit: unit as Unit,
            period: f.start
              ? { kind: "duration", start: f.start, end: f.end }
              : { kind: "instant", end: f.end },
            dimensions: {},
            source: "companyfacts",
            accn: f.accn,
            form: f.form as PeriodicForm,
            filed: f.filed,
          });
        }
      }
    }
  }

  // Fallback report date: the latest period end among the filing's us-gaap facts
  // (dei cover facts can be dated after the balance sheet, so they are left out).
  const latestEnd = new Map<string, string>();
  for (const r of rows) {
    if (!r.concept.startsWith("us-gaap:")) continue;
    const seen = latestEnd.get(r.accn);
    if (!seen || r.period.end > seen) latestEnd.set(r.accn, r.period.end);
  }

  // Accessions are counted before the history window, for the freshness check.
  const periodicAccessions = new Set(rows.map((r) => r.accn));
  let newestEnd = "";
  for (const end of latestEnd.values()) if (end > newestEnd) newestEnd = end;
  const cutoff = newestEnd ? addDays(newestEnd, -FACT_HISTORY_DAYS) : "";

  const refs = new Map<string, FilingReference>();
  const filingFor = (r: Row): FilingReference => {
    let ref = refs.get(r.accn);
    if (!ref) {
      ref = {
        accession: r.accn,
        form: r.form,
        filedDate: r.filed,
        reportDate:
          options.reportDates?.get(r.accn) ??
          latestEnd.get(r.accn) ??
          r.period.end,
        indexUrl: filingIndexPageUrl(cik, r.accn),
      };
      refs.set(r.accn, ref);
    }
    return ref;
  };

  const facts = rows
    .filter((r) => r.period.end >= cutoff)
    .map(({ accn, form, filed, ...fact }) => ({
      ...fact,
      filing: filingFor({ accn, form, filed, ...fact }),
    }));

  // Newest by filed date, over every periodic filing (not just those in the window).
  let newest: { accession: string; filedDate: string } | null = null;
  for (const r of rows) {
    const ref = { accession: r.accn, filedDate: r.filed };
    if (
      !newest ||
      ref.filedDate > newest.filedDate ||
      (ref.filedDate === newest.filedDate && ref.accession > newest.accession)
    )
      newest = ref;
  }

  return {
    facts,
    periodicAccessions,
    newestPeriodicAccession: newest?.accession ?? null,
  };
}
