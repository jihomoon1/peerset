import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as policy from "@/domain/policy";

// Expected values are copied by hand from docs/methodology.md (0.3.3). If one of these
// fails, either policy.ts drifted from the methodology or the methodology changed
// without a version bump.
describe("policy matches methodology §14 (v0.3.3)", () => {
  it("has the approved methodology version", () => {
    expect(policy.METHODOLOGY_VERSION).toBe("0.3.3");
  });

  it("matches the version written in docs/methodology.md", () => {
    const doc = readFileSync(
      path.join(import.meta.dirname, "../../../docs/methodology.md"),
      "utf8",
    );
    expect(/Methodology version: ([\d.]+)/.exec(doc)?.[1]).toBe(
      policy.METHODOLOGY_VERSION,
    );
  });

  it("has every §14 constant", () => {
    expect(policy.NM_MULTIPLE_CAP).toBe(100); // §10
    expect(policy.LAG_FLAG_DAYS).toBe(75); // §12
    expect(policy.PRICE_STALE_DAYS).toBe(7); // §12
    expect(policy.EPS_CROSSCHECK_TOLERANCE).toBe(0.05); // §5
    expect(policy.NCI_MATERIALITY).toBe(0.05); // §9
    expect(policy.FISCAL_YEAR_DAYS).toEqual({ min: 350, max: 378 }); // §2
    expect(policy.YTD_START_TOLERANCE_DAYS).toBe(7); // §2
    expect(policy.PRIOR_YTD_DURATION_TOLERANCE_DAYS).toBe(7); // §2
    expect(policy.PRIOR_YTD_START_OFFSET_TOLERANCE_DAYS).toBe(10); // §2
    expect(policy.DEBT_TOTAL_TAG_TOLERANCE_USD).toBe(100_000); // §7: 0.1M USD
    expect(policy.STATEMENT_CACHE_SECONDS).toBe(30 * 24 * 3600); // §14: 30 days
    expect(policy.SEC_REQUESTS_PER_COMPANY).toBe(7); // §14
    expect(policy.STALE_FILER_DAYS).toBe(200); // blueprint §8.6
    expect(policy.SCREENING_REVENUE_MAX_AGE_MONTHS).toBe(15); // §13A
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

  describe("§7–§9 face classification (0.3.0)", () => {
    const gaap = (n: string) => `us-gaap:${n}`;

    it("classifies every debt line named in §7 rule 2", () => {
      for (const n of [
        "ShortTermBorrowings",
        "CommercialPaper",
        "ShortTermBankLoansAndNotesPayable",
        "LineOfCredit",
        "LongTermLineOfCredit",
        "DebtCurrent",
        "LongTermDebtCurrent",
        "LongTermDebtNoncurrent",
        "LongTermDebtAndCapitalLeaseObligations",
        "LongTermDebtAndCapitalLeaseObligationsCurrent",
        "SecuredDebt",
        "UnsecuredDebtCurrent",
        "ConvertibleNotesPayable",
        "SeniorNotes",
        "FinanceLeaseLiabilityCurrent",
        "FinanceLeaseLiabilityNoncurrent",
        "BankOverdrafts",
      ])
        expect(policy.FACE.debt.has(gaap(n)), n).toBe(true);
    });

    it("never classifies operating leases as debt", () => {
      for (const c of policy.FACE.operatingLease)
        expect(policy.FACE.debt.has(c), c).toBe(false);
    });

    it("finance-lease concepts are all debt", () => {
      for (const c of policy.FACE.financeLease)
        expect(policy.FACE.debt.has(c), c).toBe(true);
    });

    it("classifies the §8 cash concepts and keeps restricted cash apart", () => {
      for (const n of [
        "CashAndCashEquivalentsAtCarryingValue",
        "Cash",
        "CashEquivalentsAtCarryingValue",
        "ShortTermInvestments",
        "MarketableSecuritiesCurrent",
        "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
      ])
        expect(policy.FACE.cash.has(gaap(n)), n).toBe(true);
      expect([...policy.FACE.cashIncludingRestricted]).toEqual(
        policy.CONCEPTS.cashRestrictedFallback,
      );
      for (const c of policy.FACE.restrictedCash)
        expect(policy.FACE.cash.has(c), c).toBe(false);
    });

    it("classifies §9 preferred stock and NCI", () => {
      expect(policy.FACE.preferred.has(gaap("PreferredStockValue"))).toBe(true);
      expect(policy.FACE.nci.has(gaap("MinorityInterest"))).toBe(true);
      expect(
        policy.FACE.nci.has(
          gaap("RedeemableNoncontrollingInterestEquityCarryingAmount"),
        ),
      ).toBe(true);
    });

    it("§7 rule 3 debt-like labels", () => {
      for (const label of [
        "Long-term debt",
        "Short-term borrowings",
        "Notes payable to banks",
        "Term loan",
        "Revolving credit facility",
        "Line of credit",
        "Commercial paper",
      ])
        expect(policy.DEBT_LIKE_LABEL.test(label), label).toBe(true);
      for (const label of ["Accounts payable", "Operating lease liabilities"])
        expect(policy.DEBT_LIKE_LABEL.test(label), label).toBe(false);
    });

    it("§8 cash-like labels", () => {
      for (const label of [
        "Cash and cash equivalents",
        "Cash",
        "Short-term investments",
        "Short-term cash investments",
        "Marketable securities",
        "Time deposits",
      ])
        expect(policy.CASH_LIKE_LABEL.test(label), label).toBe(true);
      expect(policy.CASH_LIKE_LABEL.test("Accounts receivable")).toBe(false);
    });
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

  it("§1.2: each concept is accepted only in its own unit", () => {
    const ok = policy.isAcceptedUnit;
    expect(ok("us-gaap:Revenues", "USD")).toBe(true);
    expect(ok("us-gaap:Revenues", "shares")).toBe(false);
    expect(ok("us-gaap:EarningsPerShareDiluted", "USD/shares")).toBe(true);
    expect(ok("us-gaap:EarningsPerShareDiluted", "USD")).toBe(false);
    expect(
      ok("us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", "shares"),
    ).toBe(true);
    expect(
      ok("us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding", "USD"),
    ).toBe(false);
    expect(ok("dei:EntityCommonStockSharesOutstanding", "shares")).toBe(true);
    expect(ok("dei:EntityCommonStockSharesOutstanding", "USD")).toBe(false);
    expect(
      ok("us-gaap:StockholdersEquityNoteStockSplitConversionRatio1", "pure"),
    ).toBe(true);
    expect(ok("us-gaap:CommercialPaper", "pure")).toBe(false);
    expect(ok("us-gaap:CommercialPaper", "EUR")).toBe(false);
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
