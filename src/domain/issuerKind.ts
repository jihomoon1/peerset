// Issuer kind (methodology §13B, 0.5.0). SIC 6000–6799 mixes banks, lenders and crypto
// businesses (SoFi, Coinbase and MARA are all SIC 6199), so inside that range the kind
// comes from the latest filing's own us-gaap facts at the balance-sheet date: bank
// deposits make a bank, crypto fair value a digital-asset company, and anything else
// stays Unsupported. Pure: the facts and the date are inputs.

import { selectFact } from "./factSelection";
import { CONCEPTS, EXCLUDED_SIC_RANGE } from "./policy";
import type {
  IssuerKind,
  ReportedFinancialFact,
  UnsupportedReason,
} from "./types";

export function inFinancialSicRange(sic: string): boolean {
  const n = Number(sic);
  return n >= EXCLUDED_SIC_RANGE.min && n <= EXCLUDED_SIC_RANGE.max;
}

// The first of the concepts with a consolidated fact above 0 at the date, if any.
function positiveAt(
  facts: readonly ReportedFinancialFact[],
  concepts: readonly string[],
  date: string,
): ReportedFinancialFact | undefined {
  for (const concept of concepts) {
    const sel = selectFact(facts, concept, { end: date });
    if (sel.kind === "found" && sel.fact.value > 0) return sel.fact;
  }
  return undefined;
}

export type IssuerKindResult =
  | { kind: IssuerKind; evidence?: ReportedFinancialFact }
  | { kind: null; reason: UnsupportedReason };

export function classifyIssuer(input: {
  sic: string;
  facts: readonly ReportedFinancialFact[];
  balanceSheetDate: string;
}): IssuerKindResult {
  if (!inFinancialSicRange(input.sic)) return { kind: "operating" };
  // A deposit-taking company that also holds crypto is a bank.
  const deposits = positiveAt(
    input.facts,
    CONCEPTS.bankDeposits,
    input.balanceSheetDate,
  );
  if (deposits) return { kind: "bank", evidence: deposits };
  const crypto = positiveAt(
    input.facts,
    CONCEPTS.cryptoFairValue,
    input.balanceSheetDate,
  );
  if (crypto) return { kind: "digitalAsset", evidence: crypto };
  return {
    kind: null,
    reason: {
      code: "FINANCIAL_SIC",
      message: `Financial company (SIC ${input.sic}) without bank deposits or digital assets: PeerSet covers banks and digital-asset companies only`,
    },
  };
}

// What the peer index stores per company (§13E): its kind from companyfacts at the
// latest periodic report date, and for banks the total assets at that date. Outside
// SIC 6000–6799 every company is operating and nothing is read.
export interface ScreeningProfile {
  kind: IssuerKind | null; // null: financial SIC without a bank or digital-asset kind
  totalAssets: { value: number; accession: string } | null; // banks only
}

export function screeningProfile(input: {
  sic: string;
  facts: readonly ReportedFinancialFact[];
  reportDate: string | undefined; // the latest 10-K or 10-Q's period end
}): ScreeningProfile {
  if (!inFinancialSicRange(input.sic))
    return { kind: "operating", totalAssets: null };
  if (!input.reportDate) return { kind: null, totalAssets: null };
  const result = classifyIssuer({
    sic: input.sic,
    facts: input.facts,
    balanceSheetDate: input.reportDate,
  });
  if (result.kind !== "bank") return { kind: result.kind, totalAssets: null };
  const assets = positiveAt(
    input.facts,
    CONCEPTS.totalAssets,
    input.reportDate,
  );
  return {
    kind: "bank",
    totalAssets: assets
      ? { value: assets.value, accession: assets.filing.accession }
      : null,
  };
}
