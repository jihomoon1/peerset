# Lucid Group (LCID) reconciliation

Lucid Group, Inc. · CIK 0001811210 · Nasdaq · SIC 3711 · methodology 0.4.2 · golden files `tests/golden/LCID-2026Q2.json`, `LCID-2026Q2-balance.json`, `LCID-2026Q2-valuation.json` · tests `tests/golden/peers-ltm.test.ts`, `balance.test.ts`, `valuation.test.ts`, `e2e/negative-ebitda.spec.ts`

PeerSet's negative-EBITDA fixture (ADR 0004). Every value below is read from the rendered filings saved under `tests/fixtures/sec/LCID/2026Q2/evidence/`, not from the engine. USD thousands unless noted.

## Filings

- **10-K** for the year ended December 31, 2025, filed February 24, 2026, accession 0001628280-26-011053: [statement of operations (R5)](https://www.sec.gov/Archives/edgar/data/1811210/000162828026011053/R5.htm) · [segment narrative (R120)](https://www.sec.gov/Archives/edgar/data/1811210/000162828026011053/R120.htm)
- **10-Q** for the quarter ended June 30, 2026, filed August 4, 2026, accession 0001628280-26-052606: [statement of operations (R4)](https://www.sec.gov/Archives/edgar/data/1811210/000162828026052606/R4.htm) · [balance sheet (R2)](https://www.sec.gov/Archives/edgar/data/1811210/000162828026052606/R2.htm) · [segment narrative (R103)](https://www.sec.gov/Archives/edgar/data/1811210/000162828026052606/R103.htm)

No Q3 2026 10-Q had been filed when the fixture was captured (November 1, 2026).

## LTM through 2026-06-30

LTM = FY2025 + six months ended June 30, 2026 − six months ended June 30, 2025.

| Input              | FY2025      | 6M 2026     | 6M 2025     | LTM         | Line                                                                                                 | Status        |
| ------------------ | ----------- | ----------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| Revenue            | 1,353,790   | 687,812     | 494,480     | 1,547,122   | "Revenue (including … from a related party …)"                                                       | Awaiting Jiho |
| Operating income   | (3,501,753) | (2,071,653) | (1,494,980) | (4,078,426) | "Loss from operations"                                                                               | Awaiting Jiho |
| D&A (USD millions) | 451.2       | 238.6       | 209.0       | 480.8       | Segment narrative, "Depreciation and amortization expenses"                                          | Awaiting Jiho |
| EBITDA             |             |             |             | (3,597,626) | (4,078,426) + 480,800                                                                                | Awaiting Jiho |
| EBITDA margin      |             |             |             | (232.54)%   | (3,597,626) ÷ 1,547,122                                                                              | Awaiting Jiho |
| Net income         | (2,698,051) | (2,063,195) | (905,603)   | (3,855,643) | "Net loss"                                                                                           | Awaiting Jiho |
| Diluted EPS (USD)  | (12.09)     | (6.74)      | (5.18)      | (13.65)     | "Net loss per share attributable to common stockholders, Diluted"                                    | Awaiting Jiho |
| EPS cross-check    |             |             |             | 9.9% gap    | (3,855,643,000) ÷ 313,400,136 FY diluted shares = (12.30) vs (13.65): over 5%, so `W_EPS_CROSSCHECK` | Awaiting Jiho |

## EV inputs at 2026-06-30 (balance sheet R2)

| Input        | Value                        | Filing                                                                                                                                                                                          | Status        |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Total debt   | 3,361,428                    | "Finance lease liabilities, current portion" 5,045 + "Current portion of debt" 707,142 + "Finance lease liabilities, net of current portion" 102,685 + "Debt, net of current portion" 2,546,556 | Awaiting Jiho |
| Cash         | 761,313                      | "Cash and cash equivalents" 732,601 + "Short-term investments" 28,712                                                                                                                           | Awaiting Jiho |
| Cover shares | 394,070,176 as of 2026-07-29 | 10-Q cover page                                                                                                                                                                                 | Awaiting Jiho |
| Preferred    | Unsupported                  | "Redeemable convertible preferred stock, (related party)" 2,906,257 in temporary equity                                                                                                         | Awaiting Jiho |
| NCI          | Missing                      | no noncontrolling-interest line                                                                                                                                                                 | Awaiting Jiho |

## Valuation at the test price 20.00 (a test input, not market data)

- Market cap: 20.00 × 394,070,176 = 7,881,403,520
- EV: 7,881,403,520 + 3,361,428,000 − 761,313,000 = 10,481,518,520 (> 0)
- EV/Revenue: 10,481,518,520 ÷ 1,547,122,000 = 6.77x
- EV/EBITDA: **NM** ("EBITDA ≤ 0"); the (232.54)% margin is still shown
- P/E: **NM** ("EPS ≤ 0")

## Things to know before checking

- **D&A is not the cash-flow line.** Lucid's cash-flow "Depreciation and amortization" (451,243 / 238,634 / 209,047) is tagged with its own concept `lcid:DepreciationAndAmortizationExcludingDebtDiscountsAndInsurancePremiums`, which methodology §3 does not read. PeerSet uses `us-gaap:DepreciationDepletionAndAmortization`, shown in the segment narrative rounded to $0.1M. From the cash-flow line, LTM D&A would be 480,830, which is 30 more. EBITDA is negative either way.
- **Reverse split, not since the 10-K.** Lucid did a 1-for-10 reverse split on August 29, 2025. The six-month 2025 EPS was first filed as (0.52) and restated to (5.18). The FY2025 10-K is already post-split, so every EPS component is on the same basis. Methodology 0.4.1 skips the restatement test when a split dated on or before the fiscal year end explains it; before 0.4.1, P/E was wrongly Unsupported ("split since last 10-K").
- **EPS cross-check gap is real.** EPS uses net loss attributable to common stockholders, which adds preferred-stock effects (FY2025 diluted (3,789,155) vs net loss (2,698,051)). The warning is expected.
- **Preferred stock in temporary equity.** $2.9 billion of redeemable convertible preferred is held by a related party. Methodology §9 doesn't classify temporary-equity preferred yet, so preferred is Unsupported and EV leaves it out **without** the "material item not in EV" warning. That's a known limitation; Lucid is the first real filing to show it. The engine names the first unclassified line it meets, "Derivative liabilities associated with redeemable convertible preferred stock" (`DerivativeLiabilitiesNoncurrent`), which is not debt.
- **Total-debt tag.** `DebtLongtermAndShorttermCombinedAmount` is 3,253,700; the face sum is 3,361,428. The 107,728 gap is the finance leases (5,045 + 102,685 = 107,730, rounding), so `W_DEBT_TOTAL_TAG_DIFFERS` is expected.

## How to check (about 15 minutes)

Open each link and find the named line. For the 10-Q, use the **6 Months Ended** columns. If a row matches, change its Status to **Confirmed**.

## Golden change log

- **November 1, 2026 — new golden (M6).** First version, methodology 0.4.1.
- **November 2, 2026 — definition change (wording only), methodology 0.4.2.** The `methodologyVersion` field in every golden file moved from 0.4.1 to 0.4.2. 0.4.2 writes down rules the code already applied (LTM search bounds, D&A source wording, discontinued-operations details, the cross-check gap formula), so for LCID no value changed.
