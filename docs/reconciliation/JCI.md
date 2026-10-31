# JCI reconciliation — LTM at June 30, 2026 (fiscal Q3 2026)

Johnson Controls International plc · CIK 0000833444 · methodology 0.3.5 · golden file `tests/golden/JCI-2026Q2.json` · test `tests/golden/peers-ltm.test.ts`

JCI's fiscal year ends September 30, so the 10-Q for June 30, 2026 is **fiscal Q3 2026**. The fixture and golden are named `2026Q2` after the calendar quarter of the period end, like every other fixture. LTM = FY2025 (October 1, 2024 – September 30, 2025) + nine months ended June 30, 2026 − nine months ended June 30, 2025 (methodology §2). Amounts in USD millions except EPS (USD per share). "PeerSet" is the engine's value from the frozen fixtures (as of 2026-10-26).

**Documents**

- **10-K** for the fiscal year ended September 30, 2025, filed November 14, 2025, accession 0000833444-25-000097: [document](https://www.sec.gov/Archives/edgar/data/833444/000083344425000097/jci-20250930.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/833444/000083344425000097/0000833444-25-000097-index.htm)
- **10-Q** for the quarter ended June 30, 2026, filed July 29, 2026, accession 0000833444-26-000087: [document](https://www.sec.gov/Archives/edgar/data/833444/000083344426000087/jci-20260630.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/833444/000083344426000087/0000833444-26-000087-index.htm)

| Metric                                      | PeerSet     | Filing input or manual calc                                                                    | Source                                                                                                                                                             | Formula                                                        | Diff | Status      |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---- | ----------- |
| Revenue, LTM (USD m)                        | 24,995      | 23,596 + 18,553 − 17,154 = 24,995                                                              | 10-K, Consolidated Statements of Income, "Net sales" (total), 2025 column; 10-Q, Consolidated Statements of Income, "Net sales" (total), nine months 2026 and 2025 | §2; §3 (`RevenueFromContractWithCustomerExcludingAssessedTax`) | 0    | Confirmed   |
| Operating income, LTM                       | Unsupported | The income statement has no operating-income line, and no `OperatingIncomeLoss` fact is tagged | Both filings                                                                                                                                                       | §3: no fallback; "Known consequence (no rule change)"          | —    | Claude only |
| D&A, LTM (USD m)                            | 775         | 865 + 495 − 585 = 775                                                                          | Consolidated Statements of Cash Flows, "Depreciation and amortization" (10-K 2025 column; 10-Q nine months 2026 and 2025)                                          | §2; §3 (`DepreciationDepletionAndAmortization`)                | 0    | Claude only |
| EBITDA and EBITDA margin, LTM               | Unsupported | Needs operating income                                                                         | —                                                                                                                                                                  | §4                                                             | —    | Claude only |
| Net income attributable to JCI, LTM (USD m) | 3,579       | 3,291 + 1,886 − 1,598 = 3,579                                                                  | Consolidated Statements of Income, "Net income attributable to Johnson Controls" (10-K 2025 column; 10-Q nine months 2026 and 2025)                                | §2; §3 (`NetIncomeLoss`)                                       | 0    | Claude only |
| Diluted EPS, LTM (USD)                      | 5.69        | 5.03 + 3.08 − 2.42 = 5.69                                                                      | Consolidated Statements of Income, diluted earnings per share attributable to Johnson Controls, total (10-K 2025 column; 10-Q nine months 2026 and 2025)           | §5                                                             | 0.00 | Confirmed   |
| EPS cross-check (no warning expected)       | 3.8% gap    | 3,579 ÷ 654.1 = 5.47 vs 5.69: gap 3.8% (< 5%)                                                  | 10-K, Earnings Per Share note (Details), diluted weighted average shares, 654.1 million, 2025 column                                                               | §5                                                             | —    | Claude only |

Diff is PeerSet minus the manual calculation, at the precision the filing shows (USD millions; EPS 0.01). The golden test asserts the same values to the dollar (the XBRL facts carry decimals = −6).

## Review record

**October 31, 2026, spot-check by Jiho.** Jiho read the six inputs to revenue and diluted EPS in the filings. All six matched: 10-K FY2025 total net sales 23,596 and total diluted EPS 5.03; 10-Q nine months 2026 and 2025 total net sales 18,553 and 17,154, total diluted EPS 3.08 and 2.42. The other rows were prepared by Claude from the rendered statements and the XBRL facts, and Jiho did not check them ("Claude only").

## Things to know before checking

- **No operating income.** JCI's income statement goes from gross profit through SG&A, restructuring, net financing charges and equity income straight to "Income from continuing operations before income taxes"; it has not tagged `OperatingIncomeLoss` since 2016. Methodology §3 has no fallback, so operating income, EBITDA, EBITDA margin and EV/EBITDA are Unsupported. In the comps table JCI is left out of the EV/EBITDA statistics with that reason. This is intended (methodology §3, "Known consequence").
- **Freshness.** Companyfacts did not yet have this 10-Q when the fixture was captured, so the 2026 values were read from the filing's own XBRL (warning `W_FILING_PARSED`).
- **Net income** is the line attributable to Johnson Controls, not the total including noncontrolling interests. It includes discontinued operations: in FY2025, 1,570 of the 3,291 came from discontinued operations, and diluted EPS of 5.03 includes 2.40 from them. The methodology uses `NetIncomeLoss` and total diluted EPS as reported, so JCI's P/E is on that basis. This is worth knowing when reading its P/E next to peers.
- **D&A** is the cash-flow statement line (methodology §4).

## How to check (about 15 minutes)

1. Open the **10-K** link. Find "CONSOLIDATED STATEMENTS OF INCOME". In the **2025** column write down the total "Net sales", "Net income attributable to Johnson Controls" and diluted earnings per share. Confirm there is no "Operating income" line.
2. In the 10-K's "CONSOLIDATED STATEMENTS OF CASH FLOWS", **2025** column: "Depreciation and amortization". In the earnings-per-share note, write down the diluted weighted average shares for 2025.
3. Open the **10-Q**. In "CONSOLIDATED STATEMENTS OF INCOME", use the two **Nine Months Ended June 30** columns (2026 and 2025), not the three-month ones. Write down the same lines.
4. In the 10-Q's "CONSOLIDATED STATEMENTS OF CASH FLOWS" (nine months), write down "Depreciation and amortization" for both years.
5. For each row compute 10-K 2025 + 10-Q nine months 2026 − 10-Q nine months 2025 and compare with the PeerSet column.
6. If a row matches, change its Status to **Confirmed** and commit (`docs: confirm JCI reconciliation`). If it doesn't, leave it and note the difference (blueprint §16 drift protocol).
