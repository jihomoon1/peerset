# Comps-golden inputs reconciliation (M5 note 2)

Golden file `tests/golden/comps-LII-2026Q2.json` · test `tests/golden/comps.test.ts` · methodology 0.4.1

Until M6, the comps golden took CARR's, AAON's and TT's LTM revenue, EBITDA and EPS, and JCI's debt, cash and shares, from the engine without citing a filing. This file cites each one against the rendered statements (the SEC "R" pages, saved under `tests/fixtures/sec/<ticker>/2026Q2/evidence/<accession>/`). Every value below matched the engine's input exactly; no golden value changed. LII's, WSO's and JCI's LTM rows are reconciled in their own files.

LTM = FY2025 (10-K) + six months ended June 30, 2026 − six months ended June 30, 2025 (both from the 10-Q). EBITDA = operating income + D&A (cash-flow statement).

## CARR — Carrier Global (USD millions)

10-K [0001783180-26-000008](https://www.sec.gov/Archives/edgar/data/1783180/000178318026000008/R3.htm) (R3 statement of operations, R9 cash flows) · 10-Q [0001783180-26-000032](https://www.sec.gov/Archives/edgar/data/1783180/000178318026000032/R2.htm) (R2, R7)

| Input                                      | FY2025 | 6M 2026 | 6M 2025 | LTM    | Line                                        | Status        |
| ------------------------------------------ | ------ | ------- | ------- | ------ | ------------------------------------------- | ------------- |
| Revenue                                    | 21,747 | 11,692  | 11,331  | 22,108 | "Total Net sales"                           | Awaiting Jiho |
| Operating income                           | 2,172  | 1,083   | 1,532   | 1,723  | "Operating profit"                          | Awaiting Jiho |
| D&A                                        | 1,274  | 629     | 620     | 1,283  | Cash flows, "Depreciation and amortization" | Awaiting Jiho |
| EBITDA                                     |        |         |         | 3,006  | 1,723 + 1,283                               | Awaiting Jiho |
| Diluted EPS, continuing operations (0.4.0) | 1.69   | 0.88    | 1.17    | 1.40   | "Continuing operations, Diluted"            | Awaiting Jiho |

Discontinued operations, net of tax: FY2025 29; 6M 2026 0; 6M 2025 (17), so 0.4.0 applies. CARR tags no `IncomeLossFromContinuingOperations`, so its EPS cross-check is not run.

## AAON (USD thousands)

10-K [0000824142-26-000005](https://www.sec.gov/Archives/edgar/data/824142/000082414226000005/R4.htm) (R4 income, R6 cash flows) · 10-Q [0000824142-26-000055](https://www.sec.gov/Archives/edgar/data/824142/000082414226000055/R3.htm) (R3, R5)

| Input            | FY2025    | 6M 2026   | 6M 2025 | LTM       | Line                                        | Status        |
| ---------------- | --------- | --------- | ------- | --------- | ------------------------------------------- | ------------- |
| Revenue          | 1,442,076 | 1,123,912 | 633,621 | 1,932,367 | "Net sales"                                 | Awaiting Jiho |
| Operating income | 146,248   | 125,943   | 58,693  | 213,498   | "Income from operations"                    | Awaiting Jiho |
| D&A              | 79,191    | 44,716    | 38,879  | 85,028    | Cash flows, "Depreciation and amortization" | Awaiting Jiho |
| EBITDA           |           |           |         | 298,526   | 213,498 + 85,028                            | Awaiting Jiho |
| Diluted EPS      | 1.29      | 1.15      | 0.54    | 1.90      | "Earnings per share: Diluted"               | Awaiting Jiho |

No discontinued operations: total EPS, unchanged by 0.4.0.

## TT — Trane Technologies (USD millions)

10-K [0001628280-26-005731](https://www.sec.gov/Archives/edgar/data/1466258/000162828026005731/R3.htm) (R3 earnings, R9 cash flows) · 10-Q [0001628280-26-051117](https://www.sec.gov/Archives/edgar/data/1466258/000162828026051117/R2.htm) (R2, R7)

| Input                                      | FY2025   | 6M 2026  | 6M 2025  | LTM      | Line                                        | Status        |
| ------------------------------------------ | -------- | -------- | -------- | -------- | ------------------------------------------- | ------------- |
| Revenue                                    | 21,321.9 | 11,322.9 | 10,434.9 | 22,209.9 | "Net revenues"                              | Awaiting Jiho |
| Operating income                           | 3,967.4  | 2,000.4  | 1,983.1  | 3,984.7  | "Operating income"                          | Awaiting Jiho |
| D&A                                        | 376.3    | 211.1    | 197.2    | 390.2    | Cash flows, "Depreciation and amortization" | Awaiting Jiho |
| EBITDA                                     |          |          |          | 4,374.9  | 3,984.7 + 390.2                             | Awaiting Jiho |
| Diluted EPS, continuing operations (0.4.0) | 13.14    | 6.86     | 6.58     | 13.42    | "Diluted: Continuing operations"            | Awaiting Jiho |

Discontinued operations attributable to Trane: FY2025 (37.0); 6M 2026 (19.6); 6M 2025 (6.0). Cross-check: continuing operations attributable 2,955.6 + 1,529.7 − 1,485.7 = 2,999.6 ÷ FY diluted shares 224.9 = 13.34 vs 13.42, a 0.6% gap (no warning).

## JCI — balance-sheet inputs at 2026-06-30 (USD millions)

10-Q [0000833444-26-000087](https://www.sec.gov/Archives/edgar/data/833444/000083344426000087/R4.htm), Consolidated Statements of Financial Position (R4), column June 30, 2026.

| Input             | PeerSet     | Filing                                                                                           | Rule          | Status        |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------ | ------------- | ------------- |
| Total debt        | 9,475       | "Short-term debt" 865 + "Current portion of long-term debt" 311 + "Long-term debt" 8,299 = 9,475 | §7 face lines | Awaiting Jiho |
| Cash              | 641         | "Cash and cash equivalents" 641 (no short-term investments line)                                 | §8            | Awaiting Jiho |
| Cover-page shares | 605,741,470 | 10-Q cover page, `dei:EntityCommonStockSharesOutstanding`                                        | §6            | Awaiting Jiho |

Noncontrolling interests 33 (0.2% of market cap at the test price 80, under the 5% threshold, so no "not in EV" warning). Preferred shares 0.

## How to check (about 20 minutes)

Open each link, find the named line and column, and compare with the table. For the 10-Qs use the **six months ended** columns, not the three-month ones. If a row matches, change its Status to **Confirmed**.
