# LII reconciliation — LTM through June 30, 2026

Lennox International Inc. · CIK 0001069202 · methodology 0.2.1 · golden file `tests/golden/LII-2026Q2.json`

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
