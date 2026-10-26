// Builders for synthetic, dated facts so domain tests read like the filings they mimic.

import type {
  FilingReference,
  PeriodicForm,
  ReportedFinancialFact,
  ReportedTextFact,
} from "@/domain/types";

export function filing(
  accession: string,
  form: PeriodicForm,
  filedDate: string,
  reportDate: string,
): FilingReference {
  return {
    accession,
    form,
    filedDate,
    reportDate,
    indexUrl: `https://www.sec.gov/Archives/edgar/data/1/${accession.replaceAll("-", "")}/${accession}-index.htm`,
  };
}

interface FactSpec {
  concept: string;
  value: number;
  start?: string; // omit for an instant
  end: string;
  filing: FilingReference;
  source?: ReportedFinancialFact["source"];
  unit?: ReportedFinancialFact["unit"];
  dimensions?: Record<string, string>;
}

export function fact(spec: FactSpec): ReportedFinancialFact {
  return {
    concept: spec.concept,
    value: spec.value,
    unit: spec.unit ?? "USD",
    period: spec.start
      ? { kind: "duration", start: spec.start, end: spec.end }
      : { kind: "instant", end: spec.end },
    dimensions: spec.dimensions ?? {},
    filing: spec.filing,
    source: spec.source ?? "companyfacts",
  };
}

interface TextFactSpec {
  concept: string;
  value: string;
  start: string;
  end: string;
  filing: FilingReference;
  dimensions?: Record<string, string>;
}

export function textFact(spec: TextFactSpec): ReportedTextFact {
  return {
    concept: spec.concept,
    value: spec.value,
    period: { kind: "duration", start: spec.start, end: spec.end },
    dimensions: spec.dimensions ?? {},
    filing: spec.filing,
    source: "filing",
  };
}
