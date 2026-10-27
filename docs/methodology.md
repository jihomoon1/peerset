# PeerSet methodology

**Methodology version: 0.3.2** · Status: **approved by Jiho Moon, October 26, 2026 (0.3.0 approved in M2a planning; 0.3.1 in M2b planning; 0.3.2 in M2b review)** · Source: `docs/blueprint.md` §7 (with §8.3 and §10.2 where they set policy), as amended in section 15

This file is the single source of truth for PeerSet's financial definitions. Code in `src/domain/policy.ts` must match it. Any change to a definition or constant bumps the methodology version and is recorded in the commit message.

## 1. Core rules

1. **Fact selection.** For each (concept, period start, period end), use the value from the most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports exactly that period. Only consolidated facts (no dimensions) count, except share classes (section 6). This one rule handles duplicates, restatements, amendments and split-restated comparatives.
2. **Units.** Monetary facts must be in `USD`, EPS in `USD/shares`, share counts in `shares`, and the split-ratio fact `StockholdersEquityNoteStockSplitConversionRatio1` in `pure`. Anything else is Unsupported.
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
- A stock split since the last 10-K makes P/E Unsupported ("split since last 10-K"). Detection: a split-ratio fact (`StockholdersEquityNoteStockSplitConversionRatio1`, value other than 1) for a period ending after the last fiscal year end, or the 10-Q's restated prior-YTD EPS differing from the originally filed value by a split-like ratio.
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

Preferred stock, noncontrolling interests and equity-method investments are left out. Warning "material item not in EV" when `PreferredStockValue` > 0, or noncontrolling interest (`MinorityInterest`, `RedeemableNoncontrollingInterestEquityCarryingAmount`) exceeds 5% of market cap. Preferred stock and noncontrolling interest (in equity or temporary equity) are read from the balance-sheet face (§7 rule 1) the same way; if the face is unavailable, the tags above are used. No such line → Missing. A face line whose label looks like preferred stock or noncontrolling interest (not a "Total …" row) but whose concept is not classified makes that item Unsupported. Temporary-equity preferred stock is not classified yet, so it is Unsupported until a real filing is checked. Balance-sheet items are as of the LTM end date, prices as of the price date, shares as of the cover date; all three are shown. The "material item not in EV" warning is attached only when EV is computed.

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
- Per metric: mean, median, high, low, n valid, n excluded. NM, "—" and Unsupported never enter a statistic.
- Median of an even count = average of the middle two. Percentiles use linear interpolation, inclusive, the same as Excel's `PERCENTILE.INC`.

## 12. Dates and comparability

- The as-of strip shows the price date and source, the LTM end and filing date, the share cover date, and when data was pulled.
- A company is flagged as lagging when its LTM end is more than 75 days from the peer-set median LTM end.
- USD only, so currencies are never mixed.
- Prices are end-of-day closes and are never called real-time.
- A price dated more than 7 calendar days before the analysis date carries the caution `W_PRICE_STALE` ("price is <n> days old"). It is a warning only: the price is still used.

## 13. Implied valuation (stretch)

Target LTM metric × peer 25th percentile, median and 75th percentile multiple gives implied EV. Subtract debt and add cash for implied equity value, then divide by shares for an implied price. Shown only when every target input is valid.

## 14. Policy constants (v0.3.2)

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
| Debt build vs. total-tag cross-check tolerance      | 0.1M USD                                   | 7                  |
| Rendered statements cached per accession            | 30 days                                    | 7                  |
| SEC requests per company (budget)                   | 7                                          | 7                  |
| Stale-filer cutoff (latest periodic filing age)     | > 200 days → Unsupported                   | §8.6 of blueprint  |
| Peer revenue screen                                 | 0.2x–5x target screening revenue           | §10.2 of blueprint |
| Peers selected                                      | 8 by default; user may keep 5–12; max 12   | §10.2 of blueprint |
| Excluded SIC range                                  | 6000–6799                                  | §3 of blueprint    |
| Split-like EPS ratio                                | within 2% of 1.5 or a whole number 2–50    | 5                  |
| Accepted periodic forms                             | 10-K, 10-K/A, 10-Q, 10-Q/A                 | 1                  |

Thresholds marked in blueprint §23 decision 3 (100x, 75 days, 5% EPS, 5% NCI) are approved as v1 starting values.

## 15. Change log

| Version | Date             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | October 23, 2026 | Blueprint §7 restated                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.2.0   | October 23, 2026 | Debt built from balance-sheet lines, total tags as cross-check (`W_DEBT_TOTAL_TAG_DIFFERS`); disposal-group cash fallback; priority list means highest-priority concept with every LTM component; JCI consequence noted. Supersedes blueprint §7.7's "prefer inclusive totals"                                                                                                                                                          |
| 0.2.1   | October 26, 2026 | Split-like EPS ratio defined (§5, §14): within 2% of 1.5 or a whole number 2–50; the split-ratio fact is accepted in unit `pure` (§1.2). Approved by Jiho in M1b                                                                                                                                                                                                                                                                        |
| 0.3.0   | October 26, 2026 | Debt, cash, preferred and NCI built from balance-sheet face lines (FilingSummary + rendered R file; values from the XBRL instance); unrecognized debt or cash line → Unsupported; lease-only debt-tagged lines excluded unless labeled finance or capital lease (`W_LEASE_LINE_EXCLUDED`); no debt lines → Reported 0 (`W_NO_DEBT_LINES`); 0.2.1 tag rules kept as fallback with `W_FACE_UNAVAILABLE`. Approved by Jiho in M2a planning |
| 0.3.1   | October 26, 2026 | `W_PRICE_STALE` (caution) when the price date is more than 7 calendar days before the analysis date (§12, §14). A warning only; no value changes. Approved by Jiho in M2b planning                                                                                                                                                                                                                                                      |
| 0.3.2   | October 26, 2026 | Writes down rules M2b already applies (no value changes): share-class to ticker mapping, `W_TICKER_NOT_IN_SEC_LIST`, `W_SHARES_AFTER_BALANCE_SHEET`, the cases where market cap is Unsupported, earliest class price date shown, P/E never priced off market cap (§6); not-in-EV warning only when EV is computed (§9); NM check order and "EV ≤ 0" as NM (§10). Added by Claude at Jiho's request in M2b review                        |
