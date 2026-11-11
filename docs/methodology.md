# PeerSet methodology

**Methodology version: 0.5.0** · Status: **approved by Jiho Moon, November 10, 2026 (0.3.0 approved in M2a planning; 0.3.1 in M2b planning; 0.3.2 in M2b review; 0.3.3 in M4a; 0.3.4 in M4b planning; 0.3.5 after M4b; 0.4.0 in M6 planning; 0.4.1 in M6; 0.4.2 in M6 review; 0.4.3 in v1.1 planning; 0.5.0 in M7 planning)** · Source: `docs/blueprint.md` §7 (with §8.3 and §10.2 where they set policy), as amended in section 15

This file is the single source of truth for PeerSet's financial definitions. Code in `src/domain/policy.ts` must match it. Any change to a definition or constant bumps the methodology version and is recorded in the commit message.

## 1. Core rules

1. **Fact selection.** For each (concept, period start, period end), use the value from the most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports exactly that period. Only consolidated facts (no dimensions) count, except share classes (section 6). This one rule handles duplicates, restatements, amendments and split-restated comparatives.
2. **Units.** Monetary facts must be in `USD`, EPS and other per-share facts in `USD/shares`, share counts in `shares`, and the split-ratio fact `StockholdersEquityNoteStockSplitConversionRatio1` in `pure`. Anything else is Unsupported.
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

Q4 is never derived. A 53-week year inside the window (an LTM window of 371 days or more) adds the warning "LTM covers 53 weeks". Periods are dates, not calendar labels, so non-December year-ends need no special case. SEC "frames" are never used for calculations.

**Search bounds.** These choose which periods are candidates for each component; they never decide the result on their own. A fiscal-year candidate is a 10-K period of at least 300 days. The fiscal year is the one whose day after its end is nearest the current YTD start, within 45 days; the prior-year YTD is the one starting nearest 365 days before the current YTD, within 45 days. A period outside these bounds is a missing component; one inside them must still pass the checks above. Either way the metric is Unsupported.

## 3. Metric definitions

| Metric           | Formula                | XBRL concepts, in priority order                                                                                                                                                            | Rules                                                                                                                                                                                     |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revenue          | LTM                    | `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` → `RevenueFromContractWithCustomerIncludingAssessedTax` → `SalesRevenueNet`                                              | If two concepts report the same period with different values, use `Revenues` when it is the larger (it is the total element), warn, and show both. To be confirmed against fixtures in M1 |
| Operating income | LTM                    | `OperatingIncomeLoss`                                                                                                                                                                       | No fallback; if absent, EBITDA is Unsupported                                                                                                                                             |
| D&A              | LTM                    | `DepreciationDepletionAndAmortization` → `DepreciationAndAmortization` → `DepreciationAmortizationAndAccretionNet` → `Depreciation` + `AmortizationOfIntangibleAssets` (both, same periods) | Always carries the note `W_DA_FROM_CASH_FLOW`: "D&A is the filing's reported D&A concept, usually from the cash-flow statement; it may include items outside operating expenses"          |
| EBITDA           | Operating income + D&A | Derived                                                                                                                                                                                     | Both inputs share the same periods                                                                                                                                                        |
| EBITDA margin    | EBITDA ÷ revenue       | Derived                                                                                                                                                                                     | Shown even when negative                                                                                                                                                                  |
| Net income       | LTM                    | `NetIncomeLoss`                                                                                                                                                                             | Attributable to the parent. When an LTM component period reports discontinued operations (section 5), the provenance drawer shows their amount; the value is unchanged                    |
| Diluted EPS      | LTM                    | `EarningsPerShareDiluted`; `IncomeLossFromContinuingOperationsPerDilutedShare` when discontinued operations are reported (section 5)                                                        | See section 5                                                                                                                                                                             |

**How a priority list is applied.** For an LTM metric, use the highest-priority concept that has every LTM component (FY, current YTD and prior-year YTD; or FY alone after a 10-K). This is not simply the first concept that exists. If no concept has all components, the metric is Unsupported. Example: Carrier tags FY2025 D&A of 1,274.0M under both `DepreciationDepletionAndAmortization` and `DepreciationAmortizationAndAccretionNet`, but tags its 10-Q year-to-date D&A only under the second, so the second is used.

**Known consequence (no rule change).** Johnson Controls (JCI) has not tagged `OperatingIncomeLoss` since its period ending 2016-06-24, so its EBITDA, EBITDA margin and EV/EBITDA are Unsupported. JCI stays the September year-end fixture.

## 4. EBITDA (standardized, unadjusted)

**EBITDA(LTM) = Operating income(LTM) + D&A(LTM)**

- Labeled "EBITDA (standardized, unadjusted)" everywhere; never "Adjusted EBITDA".
- No add-backs: no restructuring, stock compensation or acquisition costs.
- D&A is the highest-priority §3 concept with every LTM component, wherever the filing tags it. That is usually the cash-flow statement, whose D&A may include items outside operating expenses (e.g. finance-lease right-of-use amortization). A company's own extension concept is never read, even on the cash-flow line. Example: Lucid tags its cash-flow D&A with its own concept, so its D&A is `DepreciationDepletionAndAmortization` from its segment note (LTM 480.8M, 30 thousand below the cash-flow line). Golden fixtures check each company's D&A against the filing text.
- Operating income and D&A are shown separately in the provenance drawer.
- When an LTM component period reports discontinued operations (section 5), D&A carries the caution `W_DA_INCLUDES_DISC_OPS` ("cash-flow D&A may include discontinued operations"). The value is not changed. Like every D&A warning, it carries through to EBITDA, EBITDA margin and EV/EBITDA.

## 5. Diluted EPS and P/E

- LTM diluted EPS = FY + current YTD − prior-year YTD, from reported EPS facts. Quarters are never summed.
- **Discontinued operations.** A component period (FY, current YTD or prior-year YTD) reports discontinued operations when, for exactly that period and selected by rule 1, any of `IncomeLossFromDiscontinuedOperationsNetOfTax`, `IncomeLossFromDiscontinuedOperationsNetOfTaxAttributableToReportingEntity`, `IncomeLossFromDiscontinuedOperationsNetOfTaxPerDilutedShare` or `DiscontinuedOperationIncomeLossFromDiscontinuedOperationNetOfTaxPerDilutedShare` is reported with a value other than 0. The component periods are those of the `EarningsPerShareDiluted` LTM; when that concept has no full LTM, those of the continuing-operations EPS LTM.
- **Conflicting facts.** If facts filed the same day disagree on a discontinued-operations concept for a component period, whether discontinued operations are reported can't be decided: LTM diluted EPS and P/E are Unsupported ("facts filed the same day disagree…"), the cross-check is not run, and D&A carries `W_DA_INCLUDES_DISC_OPS`.
- **Continuing-operations EPS.** When any LTM component period reports discontinued operations, LTM diluted EPS uses `IncomeLossFromContinuingOperationsPerDilutedShare` instead, with the same FY + current YTD − prior-year YTD bridge. It carries the information note `W_EPS_CONTINUING_OPS`, which names the discontinued-operations amount of each component period: the first nonzero of, in order, `IncomeLossFromDiscontinuedOperationsNetOfTaxAttributableToReportingEntity` (the parent's share, which `NetIncomeLoss` includes), `IncomeLossFromDiscontinuedOperationsNetOfTax`, then the two per-share concepts. Example: JCI's FY2025 note names 1,570 (the parent's share), not 1,789. If any component is missing, LTM diluted EPS and P/E are Unsupported ("continuing-operations EPS not reported"). Without discontinued operations, nothing changes.
- The cross-check then uses LTM income from continuing operations attributable to the parent (`IncomeLossFromContinuingOperations`, same bridge) ÷ fiscal-year weighted-average diluted shares. If that concept lacks a component, the cross-check is not run, and the drawer says so.
- Split detection always compares `EarningsPerShareDiluted`, never continuing-operations EPS, because a discontinued-operations reclassification restates continuing-operations EPS without any split.
- Cross-check against LTM net income ÷ fiscal-year weighted-average diluted shares. The gap is |LTM EPS − implied EPS| ÷ |LTM EPS|; above 5% it adds a warning, not a suppression. The check is not run when LTM EPS is 0 or diluted shares are 0 or less.
- A stock split since the last 10-K makes P/E Unsupported ("split since last 10-K"). Detection: a split-ratio fact (`StockholdersEquityNoteStockSplitConversionRatio1`, value other than 1) for a period ending after the last fiscal year end, or the 10-Q's restated prior-YTD EPS differing from the originally filed value by a split-like ratio. The restatement test is skipped when a split-ratio fact dated on or before the last fiscal year end matches the ratio (max(r, 1/r) within 2% of the fact's max(value, 1/value)): that split is already reflected in the 10-K. Example: Lucid's 1-for-10 reverse split of August 29, 2025 restates its first-filed six-month 2025 EPS of (0.52) to (5.18), but the FY2025 10-K is already post-split, so it is not a split since the last 10-K.
- **Split-like ratio.** With r = originally filed prior-YTD EPS ÷ restated prior-YTD EPS, the ratio is split-like when max(r, 1/r) is within 2% of 1.5 (3-for-2) or of a whole number from 2 to 50 (2-for-1 through 50-for-1; reverse splits show as 1/r).
- P/E = price ÷ LTM diluted EPS, single-class companies only. Multi-class P/E is Unsupported.

## 6. Shares and market capitalization

- Source: `dei:EntityCommonStockSharesOutstanding` from the latest 10-K/10-Q cover page, parsed from the filing so class detail survives (companyfacts drops it).
- The cover date is recorded; it is usually weeks after the balance-sheet date.
- Several classes are summed only when every class has its own listed ticker and price. An unlisted class is Unsupported.
- Shares are basic, not diluted by the treasury stock method (a disclosed limitation).
- **Class → ticker** (`docs/decisions/0007-share-class-mapping.md`). Cover facts come from the latest periodic filing only. A class's ticker is the cover `dei:TradingSymbol` for the same class member, matched to SEC's listings for the CIK after normalizing (uppercase; strip `.`, `-`, `/` and spaces). SEC's spelling is stored (`WSO-B`, not the cover's `WSOB`).
- **Market cap is Unsupported** when a class has no cover symbol (unlisted), when one consolidated count comes with several listed symbols ("share counts by class are needed"), when cover counts have different dates, sit on another axis or conflict. No cover count at all → Missing.
- A cover symbol SEC doesn't list for the CIK is kept as the ticker, with the caution `W_TICKER_NOT_IN_SEC_LIST`. A cover date after the balance-sheet date adds the information note `W_SHARES_AFTER_BALANCE_SHEET`.
- When class prices carry different dates, the earliest one is shown as the price date.
- P/E uses the single class's own price, never market cap.

**Market cap = Σ over classes of (price of class × shares of class)**

## 7. Debt

Debt and cash are built from the lines the company presents on its balance sheet ("face lines"). All values are instants at the balance-sheet date.

1. **Face lines.** In the latest periodic filing's `FilingSummary.xml`, the balance sheet is the report in menu category "Statements" whose short name matches "balance sheet", "financial position" or "financial condition" and does not contain "Parenthetical" (if several match, the lowest position). Its rendered `R#.htm` gives each row's concept (`defref_<prefix>_<LocalName>`) and label. Values come from the filing's XBRL instance: the consolidated fact (no dimensions) for that concept at the balance-sheet date, at full precision. The rendered page decides only **which** concepts are face lines, and their labels. Reading stops at the first per-member section of the rendered table (a heading such as "Class B Common Stock [Member]"), because those rows are dimensional, not consolidated. The total-assets row (`Assets`) splits the assets side from the liabilities side; if it is missing, every line is checked as both. The same concept on two face rows counts once.
2. **Total debt** = the sum of face lines whose concept is in the debt classification:
   - short-term borrowings, commercial paper, bank loans and notes payable, lines of credit (current and long-term), current and noncurrent long-term debt (including "…AndCapitalLeaseObligations" lines), secured, unsecured, convertible and senior notes;
   - finance lease liabilities when shown as their own face lines;
   - bank overdrafts.

   The concept list is in `policy.ts`. Operating lease liabilities are never debt, and operating-lease concepts never trigger rule 3. Inclusive totals (`LongTermDebt`, `DebtAndCapitalLeaseObligations`, `DebtLongtermAndShorttermCombinedAmount`, `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities`) count only when they are the single debt line on the face; next to other debt lines they make total debt Unsupported ("debt subtotal on the balance sheet").

   **Lease-only labels.** A face line tagged with a debt concept other than a finance-lease concept, whose label mentions "lease" but none of debt, borrowing, note, loan or credit, is counted only if the label says "finance" or "capital" lease. Otherwise (a generic or operating lease label) it is excluded with the caution warning `W_LEASE_LINE_EXCLUDED` naming the line, because it may contain operating leases. Example: Watsco's 10-Q for 2026-06-30 tags "Current portion of lease liabilities" (119.7M) as `LongTermDebtAndCapitalLeaseObligationsCurrent`, but it has no separate current operating-lease line and its noncurrent leases are 406.5M operating and 9.1M finance, so the line is mostly operating leases.

3. **Unrecognized debt line.** A face line on the liabilities side (after the total-assets row) whose label matches debt, borrowing, notes payable, loan, credit facility, line of credit, commercial paper or revolving, but whose concept is not in the debt classification, makes total debt **Unsupported**: "unrecognized debt line: '<label>' (<concept>)". Never guess. A classified debt line labeled as a total ("Total …") also makes total debt Unsupported ("debt subtotal on the balance sheet"), because face lines must be disjoint.
4. **No debt lines.** If no face line is classified as debt and none looks like debt, total debt is **Reported 0** with the note `W_NO_DEBT_LINES` ("no debt lines on the balance sheet"). Likewise, if the face has debt lines but none shows an amount (each is "—", or the only one is an excluded lease line), total debt is **Reported 0** with the note `W_DEBT_LINES_NO_AMOUNT` ("the balance sheet's debt lines show no amount"). These are the only cases where 0 is a reported fact, not a missing value.
5. **Blank face line.** A face line with no consolidated fact at the date (the face shows "—" or nothing) contributes nothing, noted in provenance. A face line that shows a value but has no matching consolidated fact makes the total Unsupported.
6. **Cross-check.** When `DebtAndCapitalLeaseObligations` or `DebtLongtermAndShorttermCombinedAmount` is reported at the date and differs from the face sum by more than 0.1M USD, keep the face sum, warn `W_DEBT_TOTAL_TAG_DIFFERS`, and show both.
7. **Fallback.** If the rendered balance sheet cannot be found or parsed, debt and cash use the tag rules of methodology 0.2.1 (§7.F and §8.F below) and carry the warning `W_FACE_UNAVAILABLE` ("balance-sheet face unavailable; tag rules used"). Never silently. In the fallback, total debt is Missing when the current or the noncurrent component has no tag.

Why (SEC data, checked 2026-10-22): the 0.2.1 tag lists fail for four of six HVAC peers. AAON tags its revolver `LineOfCredit` (not in the list: debt Missing); Graco's `ShortTermBankLoansAndNotesPayable` 30.0 and `UnsecuredDebtCurrent` 0.7 were not in the list (debt understated); Watsco has no noncurrent debt line and a `FinanceLeaseLiabilityNoncurrent` 9.1 line; Trane tags cash only under the disposal-group-inclusive concept. Face lines are disjoint (no double counting), every presented line is seen, and "absent from the face" means "not reported". See `docs/decisions/0006-balance-sheet-face.md`.

### 7.F Fallback: tag rules (methodology 0.2.1)

Used only when the balance-sheet face is unavailable (§7 rule 7). Total tags are a cross-check only. All lines are instants at the balance-sheet date.

1. **Current debt.**
   - If `DebtCurrent` is reported, current debt = `DebtCurrent`. It is an inclusive subtotal, so never add `ShortTermBorrowings`, `CommercialPaper` or current long-term debt to it.
   - Otherwise, current debt = `ShortTermBorrowings` + `CommercialPaper` + (`LongTermDebtAndCapitalLeaseObligationsCurrent`, else `LongTermDebtCurrent`), counting each line that is reported.
2. **Noncurrent debt** = `LongTermDebtAndCapitalLeaseObligations`, else `LongTermDebtNoncurrent`. Never use both. Never use `LongTermDebt` (it includes the current portion).
3. **Total debt** = current debt + noncurrent debt.
4. **Finance leases** (`FinanceLeaseLiabilityCurrent`, `FinanceLeaseLiabilityNoncurrent`) are added only when the debt tags used are not "…AndCapitalLeaseObligations" tags, and the filing's `FinanceLeaseLiability…StatementOfFinancialPositionExtensibleList` facts do not point into a debt line.
5. **Cross-check.** If `DebtAndCapitalLeaseObligations` or `DebtLongtermAndShorttermCombinedAmount` differs from the build by more than 0.1M USD, keep the build, warn `W_DEBT_TOTAL_TAG_DIFFERS`, and show both.
6. **Exclude** operating lease liabilities.

Evidence (SEC data, checked 2026-10-23):

| Company, date       | Lines                                                                                                                                                  | Build (USD m) | Total tag (USD m)                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------ |
| LII, 2026-06-30     | no `DebtCurrent`; `CommercialPaper` 412.0 + `LongTermDebtAndCapitalLeaseObligationsCurrent` 20.1 + `LongTermDebtAndCapitalLeaseObligations` 1,149.2    | 1,581.3       | `DebtAndCapitalLeaseObligations` 1,581.3: ties                                                         |
| Carrier, 2026-03-31 | `DebtCurrent` 1,736.0 (already includes `CommercialPaper` 708.0 and `LongTermDebtCurrent` 1,005.0) + `LongTermDebtAndCapitalLeaseObligations` 10,422.0 | 12,158.0      | `DebtAndCapitalLeaseObligations` 11,427.0 = 1,005.0 + 10,422.0, which omits the commercial paper: warn |

## 8. Cash

- Cash = the sum of face lines (§7 rule 1) classified as:
  - cash and cash equivalents (`CashAndCashEquivalentsAtCarryingValue`, `Cash`, `CashEquivalentsAtCarryingValue`);
  - short-term investments or marketable securities (`ShortTermInvestments`, `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent`, `OtherShortTermInvestments`, and time deposits as `CertificatesOfDepositAtCarryingValue`). The full list is in `policy.ts`. Long-term investments (`MarketableSecuritiesNoncurrent`, `LongTermInvestments`, `AvailableForSaleSecuritiesDebtSecuritiesNoncurrent`) are never cash.
- A face line whose concept includes restricted cash (`CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`, `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations`) counts, with the warning `W_RESTRICTED_CASH_INCLUDED` ("may include restricted cash"). Example: Trane's 10-Q for 2026-06-30 presents cash only under the disposal-group-inclusive concept (1,318.3M).
- Restricted cash presented on its own line is excluded.
- **Unrecognized cash line.** A face line on the assets side (up to the total-assets row) whose label starts with "cash" or matches cash equivalents, short-term investments, marketable securities or time deposits, but whose concept is not classified (and is not separately presented restricted cash), makes cash **Unsupported**: "unrecognized cash line: '<label>' (<concept>)".
- No cash line on the face, or cash lines that all show no amount → cash is Missing. Cash is never a default 0.
- Blank face lines and the fallback follow §7 rules 5 and 7.

### 8.F Fallback: tag rules (methodology 0.2.1)

- Cash = `CashAndCashEquivalentsAtCarryingValue` plus short-term investments (`ShortTermInvestments`, `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent`) when present and not already included.
- Restricted cash is excluded. Fallbacks, in order, when no unrestricted cash tag exists: `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents`, then `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations`. Either one carries the warning `W_RESTRICTED_CASH_INCLUDED` ("may include restricted cash"). Example: Trane's 10-Q for 2026-06-30 tags cash only under the second fallback (1,318.3M).

## 9. Enterprise value

**EV = Market cap + Total debt − Cash and short-term investments**

Preferred stock, noncontrolling interests and equity-method investments are left out. Warning "material item not in EV" when `PreferredStockValue` > 0, or noncontrolling interest (`MinorityInterest`, `RedeemableNoncontrollingInterestEquityCarryingAmount`) exceeds 5% of market cap. Preferred stock and noncontrolling interest (in equity or temporary equity) are read from the balance-sheet face (§7 rule 1) the same way; if the face is unavailable, the tags above are used. Preferred stock face lines are `PreferredStockValue`, `PreferredStockValueOutstanding`, `PreferredStockIncludingAdditionalPaidInCapital` and `PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount` (0.5.0: banks such as JPMorgan present preferred stock with its paid-in capital). No such line → Missing. A face line whose label looks like preferred stock or noncontrolling interest (not a "Total …" row) but whose concept is not classified makes that item Unsupported, except (0.5.0): a share-count or per-share line (its concept names shares, such as `PreferredStockSharesAuthorized`), a dividend line ("Preferred dividends payable", a liability) and a look-alike line with no amount (blank or 0, such as Riot's unissued Series A convertible preferred) are listed but never block the item, because none of them holds preferred stock left out of EV. See **Temporary equity** below. Balance-sheet items are as of the LTM end date, prices as of the price date, shares as of the cover date; all three are shown. The "material item not in EV" warning is attached only when EV is computed.

**Temporary equity.**

- **Classification.** A face line tagged `TemporaryEquityCarryingAmountAttributableToParent` or `TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests` counts as follows:
  - as preferred stock when its label looks like preferred stock;
  - as noncontrolling interest when its label looks like noncontrolling interest;
  - otherwise (for example redeemable common stock) as neither.

  `RedeemableNoncontrollingInterestEquityCarryingAmount` stays noncontrolling interest. A temporary-equity line that is noncontrolling interest by its concept or its label counts as noncontrolling interest only, even when its label also mentions preferred stock, so one line gives at most one warning. A classified line enters the "material item not in EV" test like any other.

- **Possible item not in EV.** A temporary-equity face line can look like preferred stock or noncontrolling interest while the item it would belong to is Unsupported, so "material item not in EV" can't be decided. A temporary-equity face line is one whose concept is any monetary `TemporaryEquity…` concept (share counts and per-share amounts excluded) or `RedeemableNoncontrollingInterestEquityCarryingAmount`. When such a line has a nonzero consolidated value at the date, EV carries the caution `W_NOT_IN_EV_UNCLASSIFIED`: "possible preferred stock not in EV: <label> <value>" (or "possible noncontrolling interest not in EV: …").
  - This applies whether or not the line's own concept is classified.
  - The item stays Unsupported, and EV is unchanged.
  - Like the other warning, it is attached only when EV is computed.

Example: Lucid's 10-Q for 2026-06-30 presents "Redeemable convertible preferred stock, (related party)" of 2,906.3M in temporary equity. Preferred stays Unsupported because an earlier derivative-liability line mentions preferred stock, so EV carries this caution.

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

Missing and Unsupported inputs are settled first. Then the NM checks run in this order, and the first that applies gives the reason: EV ≤ 0 (EV multiples only), then a denominator ≤ 0, then above 100.0x. "EV ≤ 0" is shown with status NM and that reason.

## 11. Summary statistics

- Computed over peers only; the target is excluded by default.
- Per metric: mean, median, high, low, 25th and 75th percentile, n valid, n excluded. NM, "—" and Unsupported never enter a statistic.
- A peer whose fundamentals failed to load counts in n excluded ("failed to load"). A peer still loading is not counted yet.
- With no valid value, every statistic is empty ("—"), never 0.
- Median of an even count = average of the middle two. Percentiles use linear interpolation, inclusive, the same as Excel's `PERCENTILE.INC`.

## 12. Dates and comparability

- The as-of strip shows the price date and source, the LTM end and filing date, the share cover date, and when data was pulled.
- A company is flagged as lagging (`W_PERIOD_LAG`, a caution) when its LTM end is more than 75 days from the peer-set median LTM end. The median is taken over the loaded peers' LTM ends only, as day numbers (an even count averages the middle two, so it can fall between days). Every row, the target included, is checked against it. Without a loaded peer there is no median and no flag.
- USD only, so currencies are never mixed.
- Prices are end-of-day closes and are never called real-time.
- A price dated more than 7 calendar days before the analysis date carries the caution `W_PRICE_STALE` ("price is <n> days old"). It is a warning only: the price is still used.

## 13. Implied valuation (stretch)

Target LTM metric × peer 25th percentile, median and 75th percentile multiple gives implied EV. Subtract debt and add cash for implied equity value, then divide by shares for an implied price. Shown only when every target input is valid.

The implied price is Unsupported, with the reason, in these cases:

- **Target metric not positive.** The target's LTM EBITDA (for EV/EBITDA) or LTM revenue (for EV/Revenue) is ≤ 0: "LTM EBITDA is not positive". A peer multiple applied to a negative or zero metric gives a meaningless value.
- **Several share classes.** The target has more than one share class: "several share classes: one implied price can't be split across classes". Implied equity can't be divided between classes without a rule for their relative value.
- **Shares unusable.** Market cap's share-class rules (§6) block the cover share count, or there is no cover share count.
- **Implied equity not positive.** At any percentile, implied equity value ≤ 0 makes that percentile's implied price Unsupported: "implied equity value is not positive". Implied EV and implied equity are still shown.
- **Other inputs.** Total debt, cash or the target metric is Missing, NM or Unsupported, or no peer has a valid multiple.

## 13A. Peer screening (blueprint §10)

Peers are screened from a monthly index built from SEC bulk data (`data/peer-index.json`, `docs/decisions/0008-peer-index-format.md`). Screening never calls SEC or a price provider.

- **Universe.** Companies with a ticker that SEC lists on NYSE, Nasdaq or Cboe. SEC labels NYSE American listings "NYSE". OTC, TXSE (Texas Stock Exchange) and blank exchanges are excluded. One row per company; its primary ticker is the first major-exchange ticker in SEC's ticker list.
- **Screening revenue (latest FY).** Revenue for the latest period of at least 300 days that a 10-K or 10-K/A reports under any revenue concept in §3, selected with the §1 latest-filed rule, the §2 350–378-day check and the §3 priority list and Revenues rule. If that year fails a check, the company has no screening revenue: there is no fallback to an earlier year. The fiscal year must end within 15 calendar months before the latest periodic report's period end; otherwise there is no screening revenue. Used only to size peers, labeled "screening revenue (latest FY)", never shown as LTM.
- **Eligibility.** Latest report (by period end, then filing date) is a 10-K, 10-K/A, 10-Q or 10-Q/A, not a 20-F, 40-F or transition form ("files 20-F" means the latest report is a 20-F or 40-F); SIC not in 6000–6799; latest periodic filed at most 200 days before the analysis date; has screening revenue.
- **The target** must pass the same eligibility rules and have positive screening revenue; otherwise peer screening is Unsupported with the reason.
- **Size band.** 0.2x ≤ peer ÷ target ≤ 5x, inclusive. A peer with screening revenue ≤ 0 is outside the band.
- **Tiers.** Same 4-digit SIC. If fewer than 5 companies pass both eligibility and the size band, widen to the 3-digit group, then the 2-digit major group. At the 2-digit group, all qualifying companies are returned even if fewer than 5.
- **Rank and select.** By |ln(peer ÷ target)|, ties by ticker in plain character order; keep 8 by default, 5–12 on request. Every peer gets a reason ("SIC 3585 exact · revenue 0.6x · Dec FYE · 10-Q filed 2026-07-29") and every exclusion a code.

## 13B. Issuer kinds (0.5.0)

SEC files most financial and crypto companies under SIC 6000–6799, but the code does not separate a lender from a bitcoin miner: SoFi, Coinbase, Strategy, MARA and Circle are all SIC 6199. So within that range PeerSet decides the kind from the latest periodic filing's own facts at the balance-sheet date (§7 rule 1), selected by rule 1:

| Kind                      | Rule                                                                                                                                    | Valued on                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Operating company**     | SIC outside 6000–6799 (unchanged)                                                                                                       | EV/Revenue, EV/EBITDA, P/E (§3–§10)                                                                                           |
| **Bank**                  | SIC 6000–6799 and a `Deposits`, `InterestBearingDepositLiabilities` or `NoninterestBearingDepositLiabilities` fact above 0              | P/E, P/BV, P/TBV, ROTCE (§13D)                                                                                                |
| **Digital-asset company** | SIC 6000–6799, not a bank, and a `CryptoAssetFairValue`, `CryptoAssetFairValueCurrent` or `CryptoAssetFairValueNoncurrent` fact above 0 | EV/Revenue, EV/EBITDA, P/E, plus digital assets and market cap ÷ digital assets (§13C)                                        |
| Unsupported               | SIC 6000–6799 and neither                                                                                                               | "Financial company (SIC 6199) without bank deposits or digital assets: PeerSet covers banks and digital-asset companies only" |

- Bank comes first: a deposit-taking company that also holds crypto is a bank.
- Only us-gaap concepts decide the kind (company extension concepts are never read, §4). Circle's "Deposits from stablecoin holders" is `DepositLiabilityCurrent`, not a bank deposit concept, so Circle is a digital-asset company.
- The kind is known only once the filing's facts are read, so the home search shows a financial-range company as "checked when loaded"; the company page and `/api/fundamentals` then report Unsupported if it is neither kind.
- Insurers, asset managers, brokers without deposits, REITs and funds stay Unsupported.
- The comps table and the workbook use the target's kind for their columns. A peer of another kind (added by hand) is Unsupported in columns its kind has no value for, with the reason "not applicable: only computed for <kinds>".

## 13C. Digital-asset companies (0.5.0)

Everything in §3–§12 applies unchanged. Three additions:

1. **Digital assets** = the sum of balance-sheet face lines (§7 rule 1) tagged `CryptoAssetFairValue`, `CryptoAssetFairValueCurrent` or `CryptoAssetFairValueNoncurrent`: fair value at the balance-sheet date (ASU 2023-08). Assets-side lines with a company concept whose label mentions crypto, digital assets, bitcoin or ether (for example MARA's "Digital assets - receivable, net", Coinbase's "Crypto assets held as collateral") are listed in the drawer but not counted, with the caution `W_DIGITAL_ASSET_LINE_NOT_COUNTED` naming each line and its amount: some are owned coins lent out, others are customer collateral matched by a liability, and the filing's tags don't say which. If no face line uses one of the three concepts, digital assets is Missing. If the rendered balance sheet can't be read, digital assets is Missing with the caution `W_FACE_UNAVAILABLE`: there is no tag fallback, because the tags alone can't tell owned coins from customer collateral. Digital assets are never cash and never enter EV.
2. **Market cap ÷ digital assets** (often called mNAV) = market cap (§6) ÷ digital assets. It always carries the caution `W_DIGITAL_ASSETS_AT_BALANCE_SHEET_DATE`: "digital assets at fair value on <date>; coin prices have moved since". NM when digital assets ≤ 0, above 100.0x, as §10. A company with no digital-asset line shows "—".
3. **Warnings.**
   - EV carries the caution `W_DIGITAL_ASSETS_NOT_IN_EV` ("digital assets of <amount> (<n>% of market cap) are not subtracted in EV") when digital assets exceed 5% of market cap, like the NCI test in §9.
   - EBITDA, EBITDA margin and EV/EBITDA of a digital-asset company carry the caution `W_EBITDA_INCLUDES_CRYPTO_REMEASUREMENT`: operating income includes digital-asset fair-value gains and losses. When the filing tags `CryptoAssetRealizedAndUnrealizedGainLossOperating` (else `CryptoAssetUnrealizedGainLossOperating`) for every LTM component (§2), the caution names the LTM amount; otherwise it says the amount isn't tagged. The value is not adjusted (§4: never "Adjusted EBITDA").

## 13D. Banks (0.5.0)

A bank's deposits and borrowings are its raw material, so EV, EV/Revenue, EV/EBITDA and EBITDA are Unsupported for a bank ("banks are valued on equity: EV doesn't apply"). Banks are compared on:

1. **Common equity** = the face line `StockholdersEquity` (equity attributable to the parent) − preferred stock lines inside equity (the §9 preferred concepts; temporary-equity preferred is outside `StockholdersEquity` and is not subtracted). No `StockholdersEquity` line → Unsupported. Preferred stock Unsupported → common equity Unsupported. No preferred stock line on the face → nothing is subtracted, with the note `W_NO_PREFERRED_LINE`.
2. **Tangible common equity (TCE)** = common equity − assets-side face lines tagged `Goodwill`, `IntangibleAssetsNetExcludingGoodwill`, `IntangibleAssetsNetIncludingGoodwill`, `OtherIntangibleAssetsNet`, `FiniteLivedIntangibleAssetsNet` or `IndefiniteLivedIntangibleAssetsExcludingGoodwill`. Servicing assets (`ServicingAsset…`, mortgage servicing rights) stay in TCE. A deducted line whose label also mentions servicing (Huntington's "Servicing rights and other intangible assets") is deducted whole, with the caution `W_INTANGIBLES_INCLUDE_SERVICING` (TCE may be understated). An assets-side line whose label mentions goodwill or intangible but whose concept is not one of these makes TCE Unsupported: "unrecognized intangible line: '<label>' (<concept>)" (JPMorgan's "Goodwill, MSRs and other intangible assets" is a company concept). No deferred-tax netting.
3. **P/BV** = market cap ÷ common equity · **P/TBV** = market cap ÷ TCE. NM when the denominator ≤ 0 or above 100.0x (§10). Market cap uses cover-page shares, usually dated after the balance sheet (§6).
4. **ROTCE (LTM)** = LTM net income available to common stockholders (`NetIncomeLossAvailableToCommonStockholdersBasic`, the §2 bridge) ÷ TCE at the balance-sheet date. Ending TCE, not an average of two dates (a disclosed simplification). NM when TCE ≤ 0. A percentage, so never capped.
5. **P/E** is §5 unchanged.

## 13E. Peer screening by kind (0.5.0)

The peer index stores each company's kind (§13B, from SEC's bulk companyfacts at its latest periodic report date) and, for banks, total assets (`Assets`) at that date. §13A applies with these changes:

- **Operating target:** unchanged; every SIC 6000–6799 company stays excluded.
- **Bank target:** the universe is banks only. Size band and ranking use total assets instead of screening revenue (0.2x–5x, |ln(peer ÷ target)|), because bank revenue is not tagged consistently. A bank without total assets at its latest report date is excluded ("no total assets").
- **Digital-asset target:** the universe is digital-asset companies only; screening revenue as §13A.
- The SIC tiers (4 → 3 → 2 digits) work the same within each universe.
- Exclusion codes: a company of another kind is `OTHER_KIND`; a financial-SIC company with neither kind is `FINANCIAL_SIC`; a bank without total assets is `NO_TOTAL_ASSETS`.
- The index file is format `peerset-peer-index/2` (decision 0013). A format-1 index, built before 0.5.0, records no kinds: an operating target screens as before, and a bank or digital-asset target gets "the peer index predates bank and digital-asset screening and must be rebuilt" (peers can still be added by hand).

## 14. Policy constants (v0.5.0)

| Constant                                            | Value                                      | Section            |
| --------------------------------------------------- | ------------------------------------------ | ------------------ |
| NM cap on multiples                                 | 100.0x                                     | 10                 |
| Lag flag vs. peer median LTM end                    | > 75 days                                  | 12                 |
| Price staleness warning (`W_PRICE_STALE`)           | > 7 calendar days before the analysis date | 12                 |
| EPS cross-check warning                             | > 5% gap                                   | 5                  |
| NCI materiality for "not in EV" warning             | > 5% of market cap                         | 9                  |
| Fiscal-year duration window                         | 350–378 days                               | 2                  |
| Current YTD start tolerance after FY end            | ±7 days                                    | 2                  |
| Prior-YTD duration tolerance                        | ±7 days                                    | 2                  |
| Prior-YTD start offset tolerance (≈ 1 year earlier) | ±10 days                                   | 2                  |
| LTM search: fiscal-year candidate minimum           | 300 days                                   | 2                  |
| LTM search window (FY end, prior-YTD start)         | ±45 days                                   | 2                  |
| "LTM covers 53 weeks" warning                       | LTM window ≥ 371 days                      | 2                  |
| Debt build vs. total-tag cross-check tolerance      | 0.1M USD                                   | 7                  |
| Rendered statements cached per accession            | 30 days                                    | 7                  |
| SEC requests per company (budget)                   | 7                                          | 7                  |
| Stale-filer cutoff (latest periodic filing age)     | > 200 days → Unsupported                   | §8.6 of blueprint  |
| Screening revenue: FY end vs. latest report         | ≤ 15 calendar months                       | 13A                |
| Peer revenue screen                                 | 0.2x–5x target screening revenue           | §10.2 of blueprint |
| Peers selected                                      | 8 by default; user may keep 5–12; max 12   | §10.2 of blueprint |
| Excluded SIC range                                  | 6000–6799                                  | §3 of blueprint    |
| Split-like EPS ratio                                | within 2% of 1.5 or a whole number 2–50    | 5                  |
| Accepted periodic forms                             | 10-K, 10-K/A, 10-Q, 10-Q/A                 | 1                  |
| Digital assets "not in EV" warning                  | > 5% of market cap                         | 13C                |
| Bank peer size band (total assets)                  | 0.2x–5x target total assets                | 13E                |

Thresholds marked in blueprint §23 decision 3 (100x, 75 days, 5% EPS, 5% NCI) are approved as v1 starting values.

## 15. Change log

| Version | Date              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | October 23, 2026  | Blueprint §7 restated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0.2.0   | October 23, 2026  | Debt built from balance-sheet lines, total tags as cross-check (`W_DEBT_TOTAL_TAG_DIFFERS`); disposal-group cash fallback; priority list means highest-priority concept with every LTM component; JCI consequence noted. Supersedes blueprint §7.7's "prefer inclusive totals"                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.2.1   | October 26, 2026  | Split-like EPS ratio defined (§5, §14): within 2% of 1.5 or a whole number 2–50; the split-ratio fact is accepted in unit `pure` (§1.2). Approved by Jiho in M1b                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 0.3.0   | October 26, 2026  | Debt, cash, preferred and NCI built from balance-sheet face lines (FilingSummary + rendered R file; values from the XBRL instance); unrecognized debt or cash line → Unsupported; lease-only debt-tagged lines excluded unless labeled finance or capital lease (`W_LEASE_LINE_EXCLUDED`); no debt lines → Reported 0 (`W_NO_DEBT_LINES`); 0.2.1 tag rules kept as fallback with `W_FACE_UNAVAILABLE`. Approved by Jiho in M2a planning                                                                                                                                                                                                                                          |
| 0.3.1   | October 26, 2026  | `W_PRICE_STALE` (caution) when the price date is more than 7 calendar days before the analysis date (§12, §14). A warning only; no value changes. Approved by Jiho in M2b planning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.3.2   | October 26, 2026  | Writes down rules M2b already applies (no value changes): share-class to ticker mapping, `W_TICKER_NOT_IN_SEC_LIST`, `W_SHARES_AFTER_BALANCE_SHEET`, the cases where market cap is Unsupported, earliest class price date shown, P/E never priced off market cap (§6); not-in-EV warning only when EV is computed (§9); NM check order and "EV ≤ 0" as NM (§10). Added by Claude at Jiho's request in M2b review                                                                                                                                                                                                                                                                 |
| 0.3.3   | October 28, 2026  | Peer screening written down (§13A): universe, screening revenue (latest 10-K fiscal year, no fallback, FY end within 15 months of the latest report: new), eligibility for peers and target, inclusive size band, tier widening counts companies passing eligibility and size, ties in plain character order. No LTM, balance-sheet or valuation value changes. Approved by Jiho in M4a                                                                                                                                                                                                                                                                                          |
| 0.3.4   | October 29, 2026  | Wording only, no value changes: statistics list the 25th and 75th percentiles, count failed peers as excluded and are empty (never 0) with no valid value (§11); the lag flag's median is over loaded peers' LTM ends in day numbers, the target is checked against it, code `W_PERIOD_LAG` (§12). Approved by Jiho in M4b planning                                                                                                                                                                                                                                                                                                                                              |
| 0.3.5   | October 30, 2026  | Writes down rules M4b's implied valuation already applies (no value changes): the implied price is Unsupported when the target's metric is ≤ 0, when the target has several share classes, or when its share count is blocked or absent (§13). Approved by Jiho after M4b                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.4.0   | November 1, 2026  | P/E uses continuing-operations diluted EPS when an LTM component period reports discontinued operations (`W_EPS_CONTINUING_OPS`); P/E Unsupported if a component is missing; the cross-check uses continuing-operations income; split detection stays on total EPS; D&A caution `W_DA_INCLUDES_DISC_OPS`; per-share facts in `USD/shares`. The implied price is Unsupported when implied equity value ≤ 0. Approved by Jiho in M6 planning                                                                                                                                                                                                                                       |
| 0.4.1   | November 1, 2026  | Split detection (§5): the restatement test is skipped when a split-ratio fact dated on or before the last fiscal year end matches the ratio, because the 10-K already reflects that split. Found with the Lucid fixture, whose 2025 reverse split predates its FY2025 10-K. No current golden value changes. Approved by Jiho in M6                                                                                                                                                                                                                                                                                                                                              |
| 0.4.2   | November 2, 2026  | Wording only, no value changes: writes down rules the code already applies. LTM search bounds and the 53-week threshold (§2, §14); D&A is the §3 concept wherever tagged, extension concepts never read (§4, Lucid); whose component periods discontinued operations are checked in, the conflicting-facts case, the order of amounts the `W_EPS_CONTINUING_OPS` note names, and the cross-check gap formula (§5). Found by the M6 methodology review. Approved by Jiho in M6 review                                                                                                                                                                                             |
| 0.4.3   | November 2, 2026  | Temporary-equity preferred stock and noncontrolling interest are classified by concept and label; a temporary-equity line that looks like either while that item is Unsupported adds the caution `W_NOT_IN_EV_UNCLASSIFIED` naming the line and its value (§9). A line that is NCI by concept or label counts as NCI only (tie-break). `W_DA_FROM_CASH_FLOW` text says "usually from the cash-flow statement", since Lucid's D&A comes from a note (§3). No EV, metric or multiple value changes; a preferred or NCI item can move from Unsupported to reported. Approved by Jiho in v1.1 planning and review                                                                    |
| 0.5.0   | November 10, 2026 | Banks and digital-asset companies (§13B–§13E). Within SIC 6000–6799 the kind comes from the filing: bank deposits → bank (P/E, P/BV, P/TBV, ROTCE; EV Unsupported), us-gaap crypto fair value → digital-asset company (operating multiples plus digital assets and market cap ÷ digital assets, with cautions for crypto remeasurement in EBITDA and digital assets left out of EV); anything else stays Unsupported. Peers screened within the same kind; banks sized by total assets. §9: four preferred stock concepts; share-count, dividend and empty look-alike lines no longer block preferred stock. Operating-company values unchanged. Approved by Jiho in M7 planning |
