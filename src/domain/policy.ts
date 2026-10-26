// Every threshold and concept list PeerSet uses, under one methodology version.
// Source: docs/methodology.md. Changing anything here bumps METHODOLOGY_VERSION
// and the version in methodology.md together (CLAUDE.md invariant 7).

export const METHODOLOGY_VERSION = "0.3.0";

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
export const STATEMENT_CACHE_SECONDS = 30 * 24 * 3600; // §14: per accession, filings never change
export const SEC_REQUESTS_PER_COMPANY = 7; // §14
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

// §1.2: monetary facts in USD, EPS in USD/shares, share counts in shares, the split
// ratio in pure. Each concept is accepted only in its own unit.
const SHARE_COUNT_CONCEPTS: ReadonlySet<string> = new Set([
  "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
  "dei:EntityCommonStockSharesOutstanding",
]);

export function requiredUnit(concept: string): string {
  if (concept === "us-gaap:EarningsPerShareDiluted") return "USD/shares";
  if (SHARE_COUNT_CONCEPTS.has(concept)) return "shares";
  if (PURE_UNIT_CONCEPTS.has(concept)) return "pure";
  return "USD";
}

export function isAcceptedUnit(concept: string, unit: string): boolean {
  return unit === requiredUnit(concept);
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

  // §7.F / §8.F fallback tag rules (methodology 0.2.1), used only when the
  // balance-sheet face is unavailable. The face classification is FACE below.
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

// ── §7–§9 balance-sheet face classification (methodology 0.3.0) ─────────────
// Which face-line concepts count as debt, cash, preferred stock or noncontrolling
// interest. A face line is a row of the rendered balance sheet (R#.htm); its value
// comes from the filing's XBRL instance. Face lines are disjoint, so summing the
// classified lines never double counts.

const usGaap = (...names: string[]): ReadonlySet<string> =>
  new Set(names.map((n) => `us-gaap:${n}`));

export const FACE = {
  // §7 rule 2
  debt: usGaap(
    "ShortTermBorrowings",
    "OtherShortTermBorrowings",
    "CommercialPaper",
    "ShortTermBankLoansAndNotesPayable",
    "ShortTermNonBankLoansAndNotesPayable",
    "BankOverdrafts",
    "NotesPayable",
    "NotesPayableCurrent",
    "LongTermNotesPayable",
    "LongTermNotesPayableCurrent",
    "OtherNotesPayable",
    "OtherNotesPayableCurrent",
    "LoansPayable",
    "LoansPayableCurrent",
    "LongTermLoansPayable",
    "LineOfCredit",
    "LongTermLineOfCredit",
    "LinesOfCreditCurrent",
    "DebtCurrent",
    "LongTermDebt",
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "DebtAndCapitalLeaseObligations",
    "DebtLongtermAndShorttermCombinedAmount",
    "OtherLongTermDebt",
    "OtherLongTermDebtCurrent",
    "OtherLongTermDebtNoncurrent",
    "SecuredDebt",
    "SecuredDebtCurrent",
    "SecuredLongTermDebt",
    "UnsecuredDebt",
    "UnsecuredDebtCurrent",
    "UnsecuredLongTermDebt",
    "ConvertibleDebt",
    "ConvertibleDebtCurrent",
    "ConvertibleDebtNoncurrent",
    "ConvertibleNotesPayable",
    "ConvertibleNotesPayableCurrent",
    "ConvertibleLongTermNotesPayable",
    "SeniorNotes",
    "SeniorNotesCurrent",
    "SeniorLongTermNotes",
    "FinanceLeaseLiability",
    "FinanceLeaseLiabilityCurrent",
    "FinanceLeaseLiabilityNoncurrent",
    "CapitalLeaseObligations",
    "CapitalLeaseObligationsCurrent",
    "CapitalLeaseObligationsNoncurrent",
  ),
  // §7 rule 2, lease-only labels: these concepts are leases by definition, so the
  // label rule does not apply to them.
  financeLease: usGaap(
    "FinanceLeaseLiability",
    "FinanceLeaseLiabilityCurrent",
    "FinanceLeaseLiabilityNoncurrent",
    "CapitalLeaseObligations",
    "CapitalLeaseObligationsCurrent",
    "CapitalLeaseObligationsNoncurrent",
  ),
  // §7 rule 2: never debt, whatever the label says.
  operatingLease: usGaap(
    "OperatingLeaseLiability",
    "OperatingLeaseLiabilityCurrent",
    "OperatingLeaseLiabilityNoncurrent",
    "OperatingLeaseLiabilityNoncurrentAndCurrent",
  ),
  // §8 cash and cash equivalents, short-term investments ("time deposits" =
  // CertificatesOfDepositAtCarryingValue).
  cash: usGaap(
    "CashAndCashEquivalentsAtCarryingValue",
    "Cash",
    "CashEquivalentsAtCarryingValue",
    "ShortTermInvestments",
    "OtherShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "CertificatesOfDepositAtCarryingValue",
  ),
  // §8: count, with W_RESTRICTED_CASH_INCLUDED.
  cashIncludingRestricted: usGaap(
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
  ),
  // §8: restricted cash presented on its own line is excluded.
  restrictedCash: usGaap(
    "RestrictedCash",
    "RestrictedCashCurrent",
    "RestrictedCashNoncurrent",
    "RestrictedCashAndCashEquivalentsAtCarryingValue",
    "RestrictedCashAndCashEquivalentsNoncurrent",
    "RestrictedCashEquivalentsCurrent",
    "RestrictedCashEquivalentsNoncurrent",
  ),
  // §8: long-term investments are not cash, even with a "marketable securities" label.
  notCash: usGaap(
    "MarketableSecuritiesNoncurrent",
    "LongTermInvestments",
    "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent",
  ),
  // §9
  preferred: usGaap("PreferredStockValue", "PreferredStockValueOutstanding"),
  nci: usGaap(
    "MinorityInterest",
    "RedeemableNoncontrollingInterestEquityCarryingAmount",
  ),
} as const;

// §7 rule 3: a liabilities-side face line "looks like debt" when its label matches.
export const DEBT_LIKE_LABEL =
  /debt|borrowing|notes payable|loan|credit facility|line of credit|commercial paper|revolving/i;
// §7 rule 2, lease-only labels.
export const LEASE_LABEL = /lease/i;
export const LEASE_DEBT_WORDS = /debt|borrowing|note|loan|credit/i;
export const FINANCE_LEASE_LABEL = /finance|capital/i;
// §8: an assets-side face line "looks like cash" when its label matches.
export const CASH_LIKE_LABEL =
  /^cash\b|cash equivalents|short-term (cash )?investments|marketable securities|time deposits/i;
export const RESTRICTED_LABEL = /restricted/i;
// §9: unclassified lines that look like preferred stock or NCI.
export const PREFERRED_LIKE_LABEL = /preferred/i;
export const NCI_LIKE_LABEL = /non-?controlling|minority interest/i;
// §7 rule 3: a debt line labeled as a total breaks the "face lines are disjoint" rule.
export const TOTAL_LABEL = /^total\b/i;

// §7 rule 1: the balance sheet in FilingSummary.xml.
export const BALANCE_SHEET_SHORT_NAME =
  /balance sheet|financial position|financial condition/i;
export const PARENTHETICAL = /parenthetical/i;

export type ConceptName = (typeof CONCEPTS)[keyof typeof CONCEPTS][number];

// The only concepts the SEC adapter keeps.
export const CONCEPT_WHITELIST: ReadonlySet<string> = new Set(
  Object.values(CONCEPTS).flat(),
);
