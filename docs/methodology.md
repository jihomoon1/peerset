# PeerSet methodology

**Methodology version: 0.2.0** · Status: **draft, awaiting Jiho's approval** · Source: `docs/blueprint.md` §7 (with §8.3 and §10.2 where they set policy), as amended in section 15

This file is the single source of truth for PeerSet's financial definitions. Code in `src/domain/policy.ts` must match it. Any change to a definition or constant bumps the methodology version and is recorded in the commit message.

## 1. Core rules

1. **Fact selection.** For each (concept, period start, period end), use the value from the most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports exactly that period. Only consolidated facts (no dimensions) count, except share classes (section 6). This one rule handles duplicates, restatements, amendments and split-restated comparatives.
2. **Units.** Monetary facts must be in `USD`, EPS in `USD/shares`, share counts in `shares`. Anything else is Unsupported.
3. **Precision.** Full units internally (dollars, shares). Rounding happens only in display formatting and Excel number formats. SEC's `decimals` attribute is kept in provenance. No decimal library.
4. **Missing is never zero.** A missing input makes every dependent value Missing or Unsupported.
5. **One policy file.** Thresholds and concept priority lists live in `policy.ts` and in this document, under the methodology version above.
6. **Never estimate.** When a rule cannot be satisfied, the metric is Unsupported with a reason.

Every value carries one status: **Reported**, **Derived**, **NM**, **Missing** (shown as "—") or **Unsupported**.

## 2. LTM construction

LTM ends at the period end of the latest 10-K or 10-Q.

- After a 10-K: LTM = that fiscal year.
- After a 10-Q: **LTM = FY(prior) + YTD(current) − YTD(prior year)**

The 10-Q formula is used only if every check passes; otherwise the metric is Unsupported ("cannot reconstruct LTM"):

- Fiscal-year duration is 350–378 days (covers 52/53-week years).
- Current YTD starts the day after the fiscal year ends (±7 days).
- Prior-year YTD lasts within 7 days of the current YTD's length, and starts about one year earlier (±10 days).
- All three components use the same concept; revenue tags are never mixed across components.
- Prior-year YTD is taken as restated in the latest filing (follows from rule 1).

Q4 is never derived. A 53-week year inside the window adds the warning "LTM covers 53 weeks". Periods are dates, not calendar labels, so non-December year-ends need no special case. SEC "frames" are never used for calculations.

## 3. Metric definitions

| Metric           | Formula                | XBRL concepts, in priority order                                                                                                                                                            | Rules                                                                                                                                                                                     |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revenue          | LTM                    | `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` → `RevenueFromContractWithCustomerIncludingAssessedTax` → `SalesRevenueNet`                                              | If two concepts report the same period with different values, use `Revenues` when it is the larger (it is the total element), warn, and show both. To be confirmed against fixtures in M1 |
| Operating income | LTM                    | `OperatingIncomeLoss`                                                                                                                                                                       | No fallback; if absent, EBITDA is Unsupported                                                                                                                                             |
| D&A              | LTM                    | `DepreciationDepletionAndAmortization` → `DepreciationAndAmortization` → `DepreciationAmortizationAndAccretionNet` → `Depreciation` + `AmortizationOfIntangibleAssets` (both, same periods) | Always warns "from cash-flow statement"                                                                                                                                                   |
| EBITDA           | Operating income + D&A | Derived                                                                                                                                                                                     | Both inputs share the same periods                                                                                                                                                        |
| EBITDA margin    | EBITDA ÷ revenue       | Derived                                                                                                                                                                                     | Shown even when negative                                                                                                                                                                  |
| Net income       | LTM                    | `NetIncomeLoss`                                                                                                                                                                             | Attributable to the parent                                                                                                                                                                |
| Diluted EPS      | LTM                    | `EarningsPerShareDiluted`                                                                                                                                                                   | See section 5                                                                                                                                                                             |

**How a priority list is applied.** For an LTM metric, use the highest-priority concept that has every LTM component (FY, current YTD and prior-year YTD; or FY alone after a 10-K). This is not simply the first concept that exists. If no concept has all components, the metric is Unsupported. Example: Carrier tags FY2025 D&A of 1,274.0M under both `DepreciationDepletionAndAmortization` and `DepreciationAmortizationAndAccretionNet`, but tags its 10-Q year-to-date D&A only under the second, so the second is used.

**Known consequence (no rule change).** Johnson Controls (JCI) has not tagged `OperatingIncomeLoss` since its period ending 2016-06-24, so its EBITDA, EBITDA margin and EV/EBITDA are Unsupported. JCI stays the September year-end fixture.

## 4. EBITDA (standardized, unadjusted)

**EBITDA(LTM) = Operating income(LTM) + D&A(LTM)**

- Labeled "EBITDA (standardized, unadjusted)" everywhere; never "Adjusted EBITDA".
- No add-backs: no restructuring, stock compensation or acquisition costs.
- D&A comes from the cash-flow statement and may include items outside operating expenses (e.g. finance-lease right-of-use amortization). Golden fixtures check each company's D&A against the filing text.
- Operating income and D&A are shown separately in the provenance drawer.

## 5. Diluted EPS and P/E

- LTM diluted EPS = FY + current YTD − prior-year YTD, from reported EPS facts. Quarters are never summed.
- Cross-check against LTM net income ÷ fiscal-year weighted-average diluted shares. A gap above 5% adds a warning, not a suppression.
- A stock split since the last 10-K makes P/E Unsupported ("split since last 10-K"). Detection: split-ratio facts, or the 10-Q's restated prior-YTD EPS differing from the originally filed value by a split-like ratio.
- P/E = price ÷ LTM diluted EPS, single-class companies only. Multi-class P/E is Unsupported.

## 6. Shares and market capitalization

- Source: `dei:EntityCommonStockSharesOutstanding` from the latest 10-K/10-Q cover page, parsed from the filing so class detail survives (companyfacts drops it).
- The cover date is recorded; it is usually weeks after the balance-sheet date.
- Several classes are summed only when every class has its own listed ticker and price. An unlisted class is Unsupported.
- Shares are basic, not diluted by the treasury stock method (a disclosed limitation).

**Market cap = Σ over classes of (price of class × shares of class)**

## 7. Debt

Total debt is **built from balance-sheet lines**. Total tags are a cross-check only. All lines are instants at the balance-sheet date.

1. **Current debt.**
   - If `DebtCurrent` is reported, current debt = `DebtCurrent`. It is an inclusive subtotal, so never add `ShortTermBorrowings`, `CommercialPaper` or current long-term debt to it.
   - Otherwise, current debt = `ShortTermBorrowings` + `CommercialPaper` + (`LongTermDebtAndCapitalLeaseObligationsCurrent`, else `LongTermDebtCurrent`), counting each line that is reported.
2. **Noncurrent debt** = `LongTermDebtAndCapitalLeaseObligations`, else `LongTermDebtNoncurrent`. Never use both. Never use `LongTermDebt` (it includes the current portion).
3. **Total debt** = current debt + noncurrent debt.
4. **Finance leases** (`FinanceLeaseLiabilityCurrent`, `FinanceLeaseLiabilityNoncurrent`) are added only when the debt tags used are not "…AndCapitalLeaseObligations" tags, and the filing's `FinanceLeaseLiability…StatementOfFinancialPositionExtensibleList` facts do not point into a debt line.
5. **Cross-check.** If `DebtAndCapitalLeaseObligations` or `DebtLongtermAndShorttermCombinedAmount` differs from the build by more than 0.1M USD, keep the build, warn `W_DEBT_TOTAL_TAG_DIFFERS`, and show both.
6. **Exclude** operating lease liabilities.

Open for M2 (not decided): how to handle a current-debt line that is not reported on the balance sheet.

Evidence (SEC data, checked 2026-10-23):

| Company, date       | Lines                                                                                                                                                  | Build (USD m) | Total tag (USD m)                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------ |
| LII, 2026-06-30     | no `DebtCurrent`; `CommercialPaper` 412.0 + `LongTermDebtAndCapitalLeaseObligationsCurrent` 20.1 + `LongTermDebtAndCapitalLeaseObligations` 1,149.2    | 1,581.3       | `DebtAndCapitalLeaseObligations` 1,581.3: ties                                                         |
| Carrier, 2026-03-31 | `DebtCurrent` 1,736.0 (already includes `CommercialPaper` 708.0 and `LongTermDebtCurrent` 1,005.0) + `LongTermDebtAndCapitalLeaseObligations` 10,422.0 | 12,158.0      | `DebtAndCapitalLeaseObligations` 11,427.0 = 1,005.0 + 10,422.0, which omits the commercial paper: warn |

## 8. Cash

- Cash = `CashAndCashEquivalentsAtCarryingValue` plus short-term investments (`ShortTermInvestments`, `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent`) when present and not already included.
- Restricted cash is excluded. Fallbacks, in order, when no unrestricted cash tag exists: `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`, then `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations`. Either one carries the warning `W_RESTRICTED_CASH_INCLUDED` ("may include restricted cash"). Example: Trane's 10-Q for 2026-06-30 tags cash only under the second fallback (1,318.3M).

## 9. Enterprise value

**EV = Market cap + Total debt − Cash and short-term investments**

Preferred stock, noncontrolling interests and equity-method investments are left out. Warning "material item not in EV" when `PreferredStockValue` > 0, or noncontrolling interest (`MinorityInterest`, `RedeemableNoncontrollingInterestEquityCarryingAmount`) exceeds 5% of market cap. Balance-sheet items are as of the LTM end date, prices as of the price date, shares as of the cover date; all three are shown.

## 10. Multiples and the NM policy

EV/Revenue = EV ÷ Revenue(LTM) · EV/EBITDA = EV ÷ EBITDA(LTM) · P/E = Price ÷ EPS(LTM)

| Condition                 | Result                                                      |
| ------------------------- | ----------------------------------------------------------- |
| Revenue ≤ 0               | EV/Revenue is NM                                            |
| EBITDA ≤ 0                | EV/EBITDA is NM; the negative margin is still shown         |
| EPS ≤ 0                   | P/E is NM                                                   |
| EV ≤ 0                    | EV multiples withheld: "EV ≤ 0"                             |
| Any multiple above 100.0x | NM: "above 100x policy" (multiples only, never percentages) |
| An input is missing       | "—" (unavailable), never NM                                 |
| The method cannot apply   | "Unsupported", with the reason                              |

## 11. Summary statistics

- Computed over peers only; the target is excluded by default.
- Per metric: mean, median, high, low, n valid, n excluded. NM, "—" and Unsupported never enter a statistic.
- Median of an even count = average of the middle two. Percentiles use linear interpolation, inclusive, the same as Excel's `PERCENTILE.INC`.

## 12. Dates and comparability

- The as-of strip shows the price date and source, the LTM end and filing date, the share cover date, and when data was pulled.
- A company is flagged as lagging when its LTM end is more than 75 days from the peer-set median LTM end.
- USD only, so currencies are never mixed.
- Prices are end-of-day closes and are never called real-time.

## 13. Implied valuation (stretch)

Target LTM metric × peer 25th percentile, median and 75th percentile multiple gives implied EV. Subtract debt and add cash for implied equity value, then divide by shares for an implied price. Shown only when every target input is valid.

## 14. Policy constants (v0.2.0)

| Constant                                            | Value                                    | Section            |
| --------------------------------------------------- | ---------------------------------------- | ------------------ |
| NM cap on multiples                                 | 100.0x                                   | 10                 |
| Lag flag vs. peer median LTM end                    | > 75 days                                | 12                 |
| EPS cross-check warning                             | > 5% gap                                 | 5                  |
| NCI materiality for "not in EV" warning             | > 5% of market cap                       | 9                  |
| Fiscal-year duration window                         | 350–378 days                             | 2                  |
| Current YTD start tolerance after FY end            | ±7 days                                  | 2                  |
| Prior-YTD duration tolerance                        | ±7 days                                  | 2                  |
| Prior-YTD start offset tolerance (≈ 1 year earlier) | ±10 days                                 | 2                  |
| Debt build vs. total-tag cross-check tolerance      | 0.1M USD                                 | 7                  |
| Stale-filer cutoff (latest periodic filing age)     | > 200 days → Unsupported                 | §8.6 of blueprint  |
| Peer revenue screen                                 | 0.2x–5x target screening revenue         | §10.2 of blueprint |
| Peers selected                                      | 8 by default; user may keep 5–12; max 12 | §10.2 of blueprint |
| Excluded SIC range                                  | 6000–6799                                | §3 of blueprint    |
| Accepted periodic forms                             | 10-K, 10-K/A, 10-Q, 10-Q/A               | 1                  |

Thresholds marked in blueprint §23 decision 3 (100x, 75 days, 5% EPS, 5% NCI) are v1 starting values pending approval.

## 15. Change log

| Version | Date             | Change                                                                                                                                                                                                                                                                         |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0   | October 23, 2026 | Blueprint §7 restated                                                                                                                                                                                                                                                          |
| 0.2.0   | October 23, 2026 | Debt built from balance-sheet lines, total tags as cross-check (`W_DEBT_TOTAL_TAG_DIFFERS`); disposal-group cash fallback; priority list means highest-priority concept with every LTM component; JCI consequence noted. Supersedes blueprint §7.7's "prefer inclusive totals" |
