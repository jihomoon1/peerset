# LII reconciliation — LTM, EV inputs and valuation at June 30, 2026

Lennox International Inc. · CIK 0001069202 · methodology 0.3.5 (LTM rows checked under 0.2.1; 0.3.0 to 0.3.5 changed no LTM value) · golden files `tests/golden/LII-2026Q2.json`, `tests/golden/LII-2026Q2-valuation.json`

LTM = FY2025 + six months ended June 30, 2026 − six months ended June 30, 2025 (methodology §2). All amounts in USD millions except EPS (USD per share). "PeerSet" is the engine's value from the frozen fixtures (as of 2026-10-23). "Filing input or manual calc" is read from the documents below.

**Documents**

- **10-K** for the year ended December 31, 2025, filed February 17, 2026, accession 0001069202-26-000028: [document](https://www.sec.gov/Archives/edgar/data/1069202/000106920226000028/lii-20251231.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/1069202/000106920226000028/0001069202-26-000028-index.htm)
- **10-Q** for the quarter ended June 30, 2026, filed July 29, 2026, accession 0001069202-26-000087: [document](https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/lii-20260630.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/0001069202-26-000087-index.htm)

| Metric                                         | PeerSet  | Filing input or manual calc                    | Source                                                                                                                                                                      | Formula                                | Diff | Status    |
| ---------------------------------------------- | -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---- | --------- |
| Revenue, LTM (USD m)                           | 5,302.2  | 5,195.3 + 2,680.4 − 2,573.5 = 5,302.2          | 10-K, Consolidated Statements of Operations, "Net sales", 2025 column; 10-Q, Consolidated Statements of Operations, "Net sales", six months 2026 and 2025 columns           | §2; §3 (`Revenues`)                    | 0.0  | Confirmed |
| Operating income, LTM (USD m)                  | 1,043.0  | 1,041.5 + 518.5 − 517.0 = 1,043.0              | Same statements, "Operating income"                                                                                                                                         | §2; §3 (`OperatingIncomeLoss`)         | 0.0  | Confirmed |
| D&A, LTM (USD m)                               | 121.9    | 112.5 + 61.8 − 52.4 = 121.9                    | 10-K, Consolidated Statements of Cash Flows, "Depreciation and amortization", 2025 column; 10-Q, Consolidated Statements of Cash Flows, same line, six months 2026 and 2025 | §2; §3 (`DepreciationAndAmortization`) | 0.0  | Confirmed |
| EBITDA (standardized, unadjusted), LTM (USD m) | 1,164.9  | 1,043.0 + 121.9 = 1,164.9                      | The two rows above                                                                                                                                                          | §4: operating income + D&A             | 0.0  | Confirmed |
| EBITDA margin, LTM                             | 22.0%    | 1,164.9 ÷ 5,302.2 = 21.97%                     | The EBITDA and revenue rows                                                                                                                                                 | §3: EBITDA ÷ revenue                   | 0.0  | Confirmed |
| Net income, LTM (USD m)                        | 788.5    | 805.8 + 386.2 − 403.5 = 788.5                  | Consolidated Statements of Operations, "Net income" (10-K 2025 column; 10-Q six months 2026 and 2025)                                                                       | §2; §3 (`NetIncomeLoss`)               | 0.0  | Confirmed |
| Diluted EPS, LTM (USD)                         | 22.51    | 22.79 + 11.06 − 11.34 = 22.51                  | Consolidated Statements of Operations, "Earnings per share Diluted" (10-K 2025 column; 10-Q six months 2026 and 2025)                                                       | §5                                     | 0.00 | Confirmed |
| EPS cross-check (no warning expected)          | 1.0% gap | 788.5 ÷ 35.4 = 22.27 vs 22.51: gap 1.0% (< 5%) | 10-K, Consolidated Statements of Operations, "Weighted Average Number of Shares Outstanding - Diluted", 2025 column                                                         | §5                                     | —    | Confirmed |

Diff is PeerSet minus the manual calculation, at the precision the filing shows (0.1M; EPS 0.01). The golden test asserts the same values to the dollar.

**Confirmed by Jiho Moon:** every row verified against rendered filings 2026-10-26 (10-K statements of operations, p.40, and cash flows; 10-Q six-month statements of operations and cash flows).

## Things to know before checking

- **Restated prior year.** In Q4 2025 LII changed its inventory method from LIFO to FIFO and applied it to all earlier periods (10-K, Note 2, "Summary of Significant Accounting Policies", under "Change in Accounting"). So the six-months-2025 column in the 2026 10-Q is restated: operating income 517.0, not the 509.6 LII first reported in its Q2 2025 10-Q; net income 403.5, not 397.9; diluted EPS 11.34, not 11.18. PeerSet uses the restated values (latest-filed rule, methodology §1). Use the column in the **2026** 10-Q, not the 2025 one.
- **Companyfacts gap.** SEC's companyfacts did not yet contain the Q2 2026 10-Q, so PeerSet read the 2026 values from the filing's own XBRL (warning `W_FILING_PARSED`). The FY2025 values came from companyfacts (10-K facts).
- **D&A** is the cash-flow statement line, so it may include items outside operating expenses (methodology §4).

## How to check (about 15 minutes)

1. Open the **10-K** link above. Find "CONSOLIDATED STATEMENTS OF OPERATIONS" (page 40). In the **2025** column, write down: Net sales, Operating income, Net income, Earnings per share Diluted, and Weighted Average Number of Shares Outstanding - Diluted.
2. In the same 10-K, find "CONSOLIDATED STATEMENTS OF CASH FLOWS". In the **2025** column, write down "Depreciation and amortization" (under "Adjustments to reconcile net income").
3. Open the **10-Q** link. Find "CONSOLIDATED STATEMENTS OF OPERATIONS". Use the two columns under **"For the Six Months Ended June 30,"** (not the three-month columns): 2026 and 2025. Write down the same four lines as step 1.
4. In the 10-Q, find "CONSOLIDATED STATEMENTS OF CASH FLOWS" (six months). Write down "Depreciation and amortization" for 2026 and 2025.
5. For each row, compute 10-K 2025 + 10-Q six months 2026 − 10-Q six months 2025, then EBITDA = operating income + D&A and margin = EBITDA ÷ revenue. Compare with the PeerSet column.
6. If a row matches, change its Status to **Confirmed** and commit with a message such as `docs: confirm LII reconciliation`. If it doesn't, leave it as is and note the difference: per the drift protocol (blueprint §16) it is a new filing, a definition change or a bug, and the golden value is never edited just to make a test pass.

FactSet or any other data service may be used as a second check only, never as the source.

## EV inputs at 2026-06-30

Methodology 0.3.0 §7–§9 · golden file `tests/golden/LII-2026Q2-balance.json`. Source: the **10-Q** for the quarter ended June 30, 2026 (link above), "CONSOLIDATED BALANCE SHEETS", June 30, 2026 column; SEC's rendering: [R2.htm](https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/R2.htm). USD millions. "PeerSet" is the engine's value from the frozen fixtures.

| Line (as labeled on the balance sheet)   | Concept                                         | PeerSet | Filing                           | In total? | Rule                                                                          | Diff | Status                                                  |
| ---------------------------------------- | ----------------------------------------------- | ------- | -------------------------------- | --------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------- |
| Commercial paper                         | `CommercialPaper`                               | 412.0   | 412.0                            | Debt      | §7 rule 2                                                                     | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Current maturities of long-term debt     | `LongTermDebtAndCapitalLeaseObligationsCurrent` | 20.1    | 20.1                             | Debt      | §7 rule 2                                                                     | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Long-term debt                           | `LongTermDebtAndCapitalLeaseObligations`        | 1,149.2 | 1,149.2                          | Debt      | §7 rule 2                                                                     | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Current operating lease liabilities      | `OperatingLeaseLiabilityCurrent`                | 87.2    | 87.2                             | No        | §7 rule 2: never debt                                                         | —    | Confirmed: verified against rendered filings 2026-10-26 |
| Long-term operating lease liabilities    | `OperatingLeaseLiabilityNoncurrent`             | 356.2   | 356.2                            | No        | §7 rule 2: never debt                                                         | —    | Confirmed: verified against rendered filings 2026-10-26 |
| **Total debt**                           |                                                 | 1,581.3 | 412.0 + 20.1 + 1,149.2 = 1,581.3 |           | §7; ties to the `DebtAndCapitalLeaseObligations` tag (1,581.3), so no warning | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Cash and cash equivalents                | `CashAndCashEquivalentsAtCarryingValue`         | 51.5    | 51.5                             | Cash      | §8                                                                            | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Short-term investments                   | `ShortTermInvestments`                          | 0.6     | 0.6                              | Cash      | §8                                                                            | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Restricted cash equivalents (noncurrent) | `RestrictedCashNoncurrent`                      | 18.8    | 18.8                             | No        | §8: restricted cash excluded                                                  | —    | Confirmed: verified against rendered filings 2026-10-26 |
| **Cash and short-term investments**      |                                                 | 52.1    | 51.5 + 0.6 = 52.1                |           | §8                                                                            | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Preferred stock (no shares issued)       | `PreferredStockValue`                           | 0.0     | 0.0                              | Not in EV | §9                                                                            | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Noncontrolling interest                  | —                                               | —       | no line                          | Not in EV | §9: Missing (none presented)                                                  | —    | Confirmed: verified against rendered filings 2026-10-26 |

### How to check the EV inputs (about 10 minutes)

1. Open the **10-Q** link at the top of this file and find "CONSOLIDATED BALANCE SHEETS" (page 1). Use the **June 30, 2026** column, not December 31, 2025.
2. Under "Current Liabilities", write down "Commercial paper" and "Current maturities of long-term debt". Under the noncurrent liabilities, write down "Long-term debt". Add the three: that is total debt.
3. Under "Current Assets", write down "Cash and cash equivalents" and "Short-term investments". Add them: that is cash. "Restricted cash equivalents" (below total current assets) is deliberately left out.
4. Check that the operating lease lines are **not** in total debt, that "Preferred stock" shows no shares issued, and that there is no noncontrolling-interest line.
5. If a row matches, change its Status to **Confirmed** and commit (`docs: confirm LII EV inputs`). If not, leave it and note the difference.

## Valuation at test price

Methodology 0.3.1 §6, §9, §10 · golden file `tests/golden/LII-2026Q2-valuation.json`. **The price is a test input, not market data:** 500.00 USD as of October 23, 2026. Alpha Vantage's actual close that day was 376.01, and it is not used here. Analysis date: October 26, 2026. Amounts in USD, written out in full so each row ties to the dollar. Multiples are shown to 0.01x; the page shows one decimal.

| Row                                   | PeerSet        | Filing input or manual calc                                                 | Source                                                                                     | Status    |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| Shares outstanding (one class, `LII`) | 34,560,675     | 34,560,675 as of July 22, 2026                                              | 10-Q **cover page**, the shares-outstanding line, `dei:EntityCommonStockSharesOutstanding` | Confirmed |
| Market cap                            | 17,280,337,500 | 500.00 × 34,560,675 = 17,280,337,500                                        | Test price × cover shares                                                                  | Confirmed |
| Total debt                            | 1,581,300,000  | from "EV inputs" above                                                      | Confirmed row                                                                              | Confirmed |
| Cash and short-term investments       | 52,100,000     | from "EV inputs" above                                                      | Confirmed row                                                                              | Confirmed |
| **Enterprise value**                  | 18,809,537,500 | 17,280,337,500 + 1,581,300,000 − 52,100,000 = 18,809,537,500                | §9                                                                                         | Confirmed |
| Not in EV                             | no warning     | preferred 0; no noncontrolling interest line                                | §9                                                                                         | Confirmed |
| EV / Revenue (LTM)                    | 3.55x          | 18,809,537,500 ÷ 5,302,200,000 = 3.5475                                     | Revenue row above (Confirmed)                                                              | Confirmed |
| EV / EBITDA (LTM)                     | 16.15x         | 18,809,537,500 ÷ 1,164,900,000 = 16.1469                                    | EBITDA row above (Confirmed)                                                               | Confirmed |
| P / E (LTM diluted)                   | 22.21x         | 500.00 ÷ 22.51 = 22.2124                                                    | Diluted EPS row above (Confirmed); single class, no split since the 10-K                   | Confirmed |
| Dates shown                           |                | price October 23, 2026 · balance sheet June 30, 2026 · shares July 22, 2026 | As-of strip and EV drawer                                                                  | Confirmed |

**How to check (about 5 minutes).** Open the 10-Q link at the top of this file. On the cover page, find the line saying how many shares of common stock were outstanding as of July 22, 2026, and compare it with 34,560,675. Then redo the multiplications and divisions above on a calculator. If a row matches, change its Status to **Confirmed**.

## Golden change log

- **October 26, 2026 — definition change (version only).** `tests/golden/LII-2026Q2.json` `methodologyVersion` moved from 0.2.1 to 0.3.0. Methodology 0.3.0 changes debt and cash (§7–§9) only; no LTM value, period or concept in the golden changed.
- **October 26, 2026 — definition change (version only).** The `methodologyVersion` field in `tests/golden/LII-2026Q2.json` and `LII-2026Q2-balance.json` moved from 0.3.0 to 0.3.1. Methodology 0.3.1 adds only the stale-price warning (§12). No value, period or concept in either golden changed.
- **October 26, 2026 — definition change (version only).** The `methodologyVersion` field in every golden file moved from 0.3.1 to 0.3.2. Methodology 0.3.2 only writes down rules the code already applied (§6, §9, §10); no value changed.
- **October 28, 2026 — definition change (version only).** The `methodologyVersion` field in every golden file moved from 0.3.2 to 0.3.3. Methodology 0.3.3 adds peer screening (§13A) only; no LTM, balance-sheet or valuation value, period or concept in any golden changed.
- **October 29, 2026 — definition change (version only).** The `methodologyVersion` field in every golden file moved from 0.3.3 to 0.3.4. Methodology 0.3.4 only clarifies statistics (§11) and the lag flag (§12) for the comps table; no LTM, balance-sheet or valuation value, period or concept in any golden changed.
- **October 30, 2026 — definition change (version only).** The `methodologyVersion` field in every golden file moved from 0.3.4 to 0.3.5. Methodology 0.3.5 only writes down when the implied price is Unsupported (§13); no LTM, balance-sheet, valuation or implied-valuation value, period or concept in any golden changed.
