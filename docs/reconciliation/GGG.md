# GGG reconciliation — LTM at September 25, 2026

Graco Inc. · CIK 0000042888 · methodology 0.4.3 (rows checked under 0.3.5; 0.4.0 changes no GGG value: no discontinued operations) · golden file `tests/golden/GGG-2026Q3.json` · test `tests/golden/peers-ltm.test.ts`

LTM = FY2025 + nine months ended September 25, 2026 − nine months ended September 26, 2025 (methodology §2). Graco reports in **USD thousands**, so every amount below is in USD thousands except EPS (USD per share). "PeerSet" is the engine's value from the frozen fixtures (as of 2026-10-26). "Filing input or manual calc" is read from the documents below.

**Documents**

- **10-K** for the fiscal year ended December 26, 2025, filed February 17, 2026, accession 0000042888-26-000081: [document](https://www.sec.gov/Archives/edgar/data/42888/000004288826000081/ggg-20251226.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/42888/000004288826000081/0000042888-26-000081-index.htm)
- **10-Q** for the quarter ended September 25, 2026, filed October 21, 2026, accession 0000042888-26-000145: [document](https://www.sec.gov/Archives/edgar/data/42888/000004288826000145/ggg-20260925.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/42888/000004288826000145/0000042888-26-000145-index.htm)

| Metric                                         | PeerSet   | Filing input or manual calc                       | Source                                                                                                                                                 | Formula                                         | Diff | Status                                                                                       |
| ---------------------------------------------- | --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| Revenue, LTM (USD k)                           | 2,310,237 | 2,236,604 + 1,717,081 − 1,643,448 = 2,310,237     | 10-K, Consolidated Statements of Earnings, "Net Sales", 2025 column; 10-Q, Consolidated Statements of Earnings, "Net Sales", nine months 2026 and 2025 | §2; §3 (`Revenues`)                             | 0    | Confirmed                                                                                    |
| Operating earnings, LTM (USD k)                | 619,565   | 624,797 + 460,986 − 466,218 = 619,565             | Same statements, "Operating Earnings"                                                                                                                  | §2; §3 (`OperatingIncomeLoss`)                  | 0    | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |
| D&A, LTM (USD k)                               | 109,318   | 107,433 + 77,629 − 75,744 = 109,318               | Consolidated Statements of Cash Flows, "Depreciation and amortization" (10-K 2025 column; 10-Q nine months 2026 and 2025)                              | §2; §3 (`DepreciationDepletionAndAmortization`) | 0    | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |
| EBITDA (standardized, unadjusted), LTM (USD k) | 728,883   | 619,565 + 109,318 = 728,883                       | The two rows above                                                                                                                                     | §4: operating income + D&A                      | 0    | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |
| EBITDA margin, LTM                             | 31.6%     | 728,883 ÷ 2,310,237 = 31.55%                      | The EBITDA and revenue rows                                                                                                                            | §3: EBITDA ÷ revenue                            | 0.0  | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |
| Net earnings, LTM (USD k)                      | 517,481   | 521,839 + 384,994 − 389,352 = 517,481             | Consolidated Statements of Earnings, "Net Earnings" (10-K 2025 column; 10-Q nine months 2026 and 2025)                                                 | §2; §3 (`NetIncomeLoss`)                        | 0    | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |
| Diluted EPS, LTM (USD)                         | 3.10      | 3.08 + 2.32 − 2.30 = 3.10                         | Consolidated Statements of Earnings, diluted net earnings per common share (10-K 2025 column; 10-Q nine months 2026 and 2025)                          | §5                                              | 0.00 | Confirmed                                                                                    |
| EPS cross-check (no warning expected)          | 1.4% gap  | 517,481 ÷ 169,219 = 3.06 vs 3.10: gap 1.4% (< 5%) | 10-K, Earnings per Share note (Details), diluted weighted average shares, 169,219 thousand, 2025 column                                                | §5                                              | —    | Confirmed: verified against rendered filings on 2026-11-01 (planning chat); approved by Jiho |

Diff is PeerSet minus the manual calculation, at the precision the filing shows (USD thousands; EPS 0.01). The golden test asserts the same values to the dollar (thousands × 1,000; the XBRL facts carry decimals = −3).

## Review record

**October 31, 2026, spot-check by Jiho.** Jiho read the six inputs to revenue and diluted EPS in the filings. All six matched: 10-K 2025 Net Sales 2,236,604 and diluted EPS 3.08; 10-Q nine months 2026 and 2025 Net Sales 1,717,081 and 1,643,448, diluted EPS 2.32 and 2.30. The other rows were prepared by Claude from the rendered statements and the XBRL facts, and Jiho did not check them ("Claude only").

**November 1, 2026, remaining rows confirmed.** The planning chat verified every "Claude only" row against the rendered filings (the statement tables in the 10-K and 10-Q documents): operating earnings, D&A, EBITDA, EBITDA margin, net earnings and the EPS cross-check (diluted weighted average shares 169,219 thousand in the EPS note; gap 1.4%). Every value matched, and Jiho approved marking them Confirmed in the M6 prompt.

## Things to know before checking

- **52/53-week year.** Graco's fiscal year ends on the last Friday of December. FY2025 is the 52 weeks from December 28, 2024 to December 26, 2025 (364 days, inside the 350–378-day window, methodology §2). The nine-month columns end on Friday, September 25, 2026 and Friday, September 26, 2025.
- **Lags the December/June peers.** Graco's LTM ends 2026-09-25, a quarter later than the other HVAC fixtures (June 30, 2026). In the LII comps table it carries the lag flag `W_PERIOD_LAG` (87 days from the peer median). That's expected, not an error.
- **Freshness.** Companyfacts already had this 10-Q when the fixture was captured, so no `W_FILING_PARSED` warning.
- **D&A** is the cash-flow statement line (methodology §4).

## How to check (about 15 minutes)

1. Open the **10-K** link. Find "CONSOLIDATED STATEMENTS OF EARNINGS". In the **2025** column, write down: Net Sales, Operating Earnings, Net Earnings and diluted net earnings per common share.
2. In the 10-K, find "CONSOLIDATED STATEMENTS OF CASH FLOWS", **2025** column: "Depreciation and amortization". In the earnings-per-share note, write down the diluted weighted average shares for 2025.
3. Open the **10-Q**. In "CONSOLIDATED STATEMENTS OF EARNINGS", use the two **Nine Months Ended** columns (not the thirteen-week/three-month ones): September 25, 2026 and September 26, 2025. Write down the same four lines.
4. In the 10-Q's "CONSOLIDATED STATEMENTS OF CASH FLOWS" (nine months), write down "Depreciation and amortization" for both years.
5. For each row compute 10-K 2025 + 10-Q nine months 2026 − 10-Q nine months 2025; then EBITDA = operating earnings + D&A and margin = EBITDA ÷ revenue. Compare with the PeerSet column.
6. If a row matches, change its Status to **Confirmed** and commit with a message such as `docs: confirm GGG reconciliation`. If it doesn't, leave it and note the difference (blueprint §16 drift protocol: new filing, definition change or bug; never edit the golden just to pass a test).

## Golden change log

- **November 1, 2026 — definition change, methodology 0.4.1.** The `methodologyVersion` field in every golden file moved from 0.4.0 to 0.4.1 (§5 split detection: a restatement explained by a split on or before the last fiscal year end is not a split since the 10-K). GGG has no split, so no value changed.
- **November 2, 2026 — definition change (wording only), methodology 0.4.2.** The `methodologyVersion` field in every golden file moved from 0.4.1 to 0.4.2. 0.4.2 writes down rules the code already applied (LTM search bounds, D&A source wording, discontinued-operations details, the cross-check gap formula), so for GGG no value changed.
- **November 2, 2026 — definition change (warnings and wording only), methodology 0.4.3.** The `methodologyVersion` field in every golden file moved from 0.4.2 to 0.4.3. 0.4.3 classifies temporary-equity preferred and NCI by label, adds the caution `W_NOT_IN_EV_UNCLASSIFIED` and rewords the D&A note. GGG has no temporary-equity line, so no value or warning changed.
