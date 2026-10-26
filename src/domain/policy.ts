// Every threshold and concept list PeerSet uses, under one methodology version.
// Source: docs/methodology.md. Changing anything here bumps METHODOLOGY_VERSION
// and the version in methodology.md together (CLAUDE.md invariant 7).

export const METHODOLOGY_VERSION = "0.2.1";

// ── §14 policy constants ────────────────────────────────────────────────────

export const NM_MULTIPLE_CAP = 100; // §10: multiples above 100.0x are NM
export const LAG_FLAG_DAYS = 75; // §12: LTM end > 75 days from peer median
export const EPS_CROSSCHECK_TOLERANCE = 0.05; // §5: > 5% gap warns
export const NCI_MATERIALITY = 0.05; // §9: NCI > 5% of market cap warns
export const FISCAL_YEAR_DAYS = { min: 350, max: 378 } as const; // §2
export const YTD_START_TOLERANCE_DAYS = 7; // §2
export const PRIOR_YTD_DURATION_TOLERANCE_DAYS = 7; // §2
export const PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS = 10; // §2
export const DEBT_TOTAL_TAG_TOLERANCE_USD = 100_000; // §7: 0.1M USD, full units
export const STALE_FILER_DAYS = 200; // blueprint §8.6: older → Unsupported
export const PEER_REVENUE_SCREEN = { min: 0.2, max: 5 } as const; // blueprint §10.2
export const PEERS = { default: 8, min: 5, max: 12 } as const; // blueprint §10.2
export const EXCLUDED_SIC_RANGE = { min: 6000, max: 6799 } as const; // blueprint §3
// §5: an EPS ratio r is split-like when max(r, 1/r) is within 2% of 1.5 (3-for-2) or
// of a whole number from 2 to 50 (2-for-1 ... 50-for-1; reverse splits via 1/r).
export const SPLIT_LIKE_RATIO = {
  targets: [1.5, ...Array.from({ length: 49 }, (_, i) => i + 2)],
  tolerance: 0.02,
} as const;

export const PERIODIC_FORMS: ReadonlySet<string> = new Set([
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
]); // §1

// Units accepted for facts (§1.2). Anything else is dropped at the adapter.
export const ACCEPTED_UNITS: ReadonlySet<string> = new Set([
  "USD",
  "USD/shares",
  "shares",
]);

// §1.2: the one concept also accepted in unit "pure" (a ratio, used by §5).
export const PURE_UNIT_CONCEPTS: ReadonlySet<string> = new Set([
  "us-gaap:StockholdersEquityNoteStockSplitConversionRatio1",
]);

export function isAcceptedUnit(concept: string, unit: string): boolean {
  return (
    ACCEPTED_UNITS.has(unit) ||
    (unit === "pure" && PURE_UNIT_CONCEPTS.has(concept))
  );
}

// ── Concept lists ───────────────────────────────────────────────────────────
// Concepts are written "prefix:LocalName" with the standard prefixes us-gaap and dei.
// The parser matches them by namespace, not by the prefix a filing happens to use.

export const CONCEPTS = {
  // §3 priority lists, highest priority first
  revenue: [
    "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
    "us-gaap:Revenues",
    "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
    "us-gaap:SalesRevenueNet",
  ],
  operatingIncome: ["us-gaap:OperatingIncomeLoss"],
  da: [
    "us-gaap:DepreciationDepletionAndAmortization",
    "us-gaap:DepreciationAndAmortization",
    "us-gaap:DepreciationAmortizationAndAccretionNet",
  ],
  // §3: last D&A fallback, both lines for the same periods
  daComponents: [
    "us-gaap:Depreciation",
    "us-gaap:AmortizationOfIntangibleAssets",
  ],
  netIncome: ["us-gaap:NetIncomeLoss"],
  dilutedEps: ["us-gaap:EarningsPerShareDiluted"],

  // §7 debt
  debtCurrentSubtotal: ["us-gaap:DebtCurrent"],
  debtCurrentLines: [
    "us-gaap:ShortTermBorrowings",
    "us-gaap:CommercialPaper",
    "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
    "us-gaap:LongTermDebtCurrent",
  ],
  debtNoncurrent: [
    "us-gaap:LongTermDebtAndCapitalLeaseObligations",
    "us-gaap:LongTermDebtNoncurrent",
  ],
  financeLease: [
    "us-gaap:FinanceLeaseLiabilityCurrent",
    "us-gaap:FinanceLeaseLiabilityNoncurrent",
  ],
  // §7 rule 4: these point at the balance-sheet line that holds the finance lease
  financeLeaseLineReferences: [
    "us-gaap:FinanceLeaseLiabilityCurrentStatementOfFinancialPositionExtensibleList",
    "us-gaap:FinanceLeaseLiabilityNoncurrentStatementOfFinancialPositionExtensibleList",
  ],
  debtTotalCrossCheck: [
    "us-gaap:DebtAndCapitalLeaseObligations",
    "us-gaap:DebtLongtermAndShorttermCombinedAmount",
  ],

  // §8 cash
  cash: ["us-gaap:CashAndCashEquivalentsAtCarryingValue"],
  shortTermInvestments: [
    "us-gaap:ShortTermInvestments",
    "us-gaap:MarketableSecuritiesCurrent",
    "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent",
  ],
  cashRestrictedFallback: [
    "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
  ],

  // §9 "material item not in EV" warning
  notInEv: [
    "us-gaap:PreferredStockValue",
    "us-gaap:MinorityInterest",
    "us-gaap:RedeemableNoncontrollingInterestEquityCarryingAmount",
  ],

  // §6 cover page
  coverPage: [
    "dei:EntityCommonStockSharesOutstanding",
    "dei:DocumentPeriodEndDate",
    "dei:DocumentFiscalYearFocus",
    "dei:DocumentFiscalPeriodFocus",
    "dei:CurrentFiscalYearEndDate",
    "dei:TradingSymbol",
    "dei:SecurityExchangeName",
  ],

  // §5 EPS cross-check and split detection
  epsCrossCheck: ["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding"],
  // Unit "pure", accepted through PURE_UNIT_CONCEPTS.
  stockSplit: ["us-gaap:StockholdersEquityNoteStockSplitConversionRatio1"],
} as const satisfies Record<string, readonly string[]>;

export type ConceptName = (typeof CONCEPTS)[keyof typeof CONCEPTS][number];

// The only concepts the SEC adapter keeps.
export const CONCEPT_WHITELIST: ReadonlySet<string> = new Set(
  Object.values(CONCEPTS).flat(),
);
