import { describe, expect, it } from "vitest";
import * as policy from "@/domain/policy";

// Expected values are copied by hand from docs/methodology.md (0.2.1). If one of these
// fails, either policy.ts drifted from the methodology or the methodology changed
// without a version bump.
describe("policy matches methodology §14 (v0.2.1)", () => {
  it("has the approved methodology version", () => {
    expect(policy.METHODOLOGY_VERSION).toBe("0.2.1");
  });

  it("has every §14 constant", () => {
    expect(policy.NM_MULTIPLE_CAP).toBe(100); // §10
    expect(policy.LAG_FLAG_DAYS).toBe(75); // §12
    expect(policy.EPS_CROSSCHECK_TOLERANCE).toBe(0.05); // §5
    expect(policy.NCI_MATERIALITY).toBe(0.05); // §9
    expect(policy.FISCAL_YEAR_DAYS).toEqual({ min: 350, max: 378 }); // §2
    expect(policy.YTD_START_TOLERANCE_DAYS).toBe(7); // §2
    expect(policy.PRIOR_YTD_DURATION_TOLERANCE_DAYS).toBe(7); // §2
    expect(policy.PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS).toBe(10); // §2
    expect(policy.DEBT_TOTAL_TAG_TOLERANCE_USD).toBe(100_000); // §7: 0.1M USD
    expect(policy.STALE_FILER_DAYS).toBe(200); // blueprint §8.6
    expect(policy.PEER_REVENUE_SCREEN).toEqual({ min: 0.2, max: 5 }); // blueprint §10.2
    expect(policy.PEERS).toEqual({ default: 8, min: 5, max: 12 }); // blueprint §10.2
    expect(policy.EXCLUDED_SIC_RANGE).toEqual({ min: 6000, max: 6799 }); // blueprint §3
    expect(policy.SPLIT_LIKE_RATIO).toEqual({
      targets: [1.5, ...Array.from({ length: 49 }, (_, i) => i + 2)],
      tolerance: 0.02,
    }); // §5: 3-for-2, or 2-for-1 through 50-for-1
    expect([...policy.PERIODIC_FORMS]).toEqual([
      "10-K",
      "10-K/A",
      "10-Q",
      "10-Q/A",
    ]); // §1
  });

  it("has the §3 priority lists in order", () => {
    expect(policy.CONCEPTS.revenue).toEqual([
      "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
      "us-gaap:Revenues",
      "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
      "us-gaap:SalesRevenueNet",
    ]);
    expect(policy.CONCEPTS.operatingIncome).toEqual([
      "us-gaap:OperatingIncomeLoss",
    ]);
    expect(policy.CONCEPTS.da).toEqual([
      "us-gaap:DepreciationDepletionAndAmortization",
      "us-gaap:DepreciationAndAmortization",
      "us-gaap:DepreciationAmortizationAndAccretionNet",
    ]);
    expect(policy.CONCEPTS.daComponents).toEqual([
      "us-gaap:Depreciation",
      "us-gaap:AmortizationOfIntangibleAssets",
    ]);
    expect(policy.CONCEPTS.netIncome).toEqual(["us-gaap:NetIncomeLoss"]);
    expect(policy.CONCEPTS.dilutedEps).toEqual([
      "us-gaap:EarningsPerShareDiluted",
    ]);
  });

  it("has the §7 debt and §8 cash concepts", () => {
    expect(policy.CONCEPTS.debtCurrentSubtotal).toEqual([
      "us-gaap:DebtCurrent",
    ]);
    expect(policy.CONCEPTS.debtCurrentLines).toEqual([
      "us-gaap:ShortTermBorrowings",
      "us-gaap:CommercialPaper",
      "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
      "us-gaap:LongTermDebtCurrent",
    ]);
    expect(policy.CONCEPTS.debtNoncurrent).toEqual([
      "us-gaap:LongTermDebtAndCapitalLeaseObligations",
      "us-gaap:LongTermDebtNoncurrent",
    ]);
    expect(policy.CONCEPTS.financeLease).toEqual([
      "us-gaap:FinanceLeaseLiabilityCurrent",
      "us-gaap:FinanceLeaseLiabilityNoncurrent",
    ]);
    expect(policy.CONCEPTS.debtTotalCrossCheck).toEqual([
      "us-gaap:DebtAndCapitalLeaseObligations",
      "us-gaap:DebtLongtermAndShorttermCombinedAmount",
    ]);
    expect(policy.CONCEPTS.cash).toEqual([
      "us-gaap:CashAndCashEquivalentsAtCarryingValue",
    ]);
    expect(policy.CONCEPTS.shortTermInvestments).toEqual([
      "us-gaap:ShortTermInvestments",
      "us-gaap:MarketableSecuritiesCurrent",
      "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    ]);
    expect(policy.CONCEPTS.cashRestrictedFallback).toEqual([
      "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
    ]);
  });

  it("has the §9 not-in-EV warning concepts", () => {
    expect(policy.CONCEPTS.notInEv).toEqual([
      "us-gaap:PreferredStockValue",
      "us-gaap:MinorityInterest",
      "us-gaap:RedeemableNoncontrollingInterestEquityCarryingAmount",
    ]);
  });

  it("has the cover-page concepts", () => {
    expect(policy.CONCEPTS.coverPage).toEqual([
      "dei:EntityCommonStockSharesOutstanding",
      "dei:DocumentPeriodEndDate",
      "dei:DocumentFiscalYearFocus",
      "dei:DocumentFiscalPeriodFocus",
      "dei:CurrentFiscalYearEndDate",
      "dei:TradingSymbol",
      "dei:SecurityExchangeName",
    ]);
  });

  it("accepts unit pure only for the §5 split-ratio fact", () => {
    expect(policy.PURE_UNIT_CONCEPTS).toEqual(
      new Set(["us-gaap:StockholdersEquityNoteStockSplitConversionRatio1"]),
    );
    expect(policy.ACCEPTED_UNITS.has("pure")).toBe(false);
  });

  it("whitelist is exactly the union of every concept list", () => {
    const union = new Set(Object.values(policy.CONCEPTS).flat());
    expect(new Set(policy.CONCEPT_WHITELIST)).toEqual(union);
    expect(policy.CONCEPT_WHITELIST.has("us-gaap:LongTermDebt")).toBe(false); // §7: never used
    expect(
      policy.CONCEPT_WHITELIST.has(
        "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
      ),
    ).toBe(true);
    expect(
      policy.CONCEPT_WHITELIST.has(
        "us-gaap:StockholdersEquityNoteStockSplitConversionRatio1",
      ),
    ).toBe(true);
  });
});
