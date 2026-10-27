# WSO reconciliation — EV inputs, LTM and valuation at June 30, 2026

Watsco, Inc. · CIK 0000105016 · methodology 0.3.1 (balance rows checked under 0.3.0; 0.3.1 changed no value) · golden files `tests/golden/WSO-2026Q2-balance.json`, `tests/golden/WSO-2026Q2.json`, `tests/golden/WSO-2026Q2-valuation.json`

**Document:** **10-Q** for the quarter ended June 30, 2026, filed August 7, 2026, accession 0001193125-26-340204: [document](https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/wso-20260630.htm) · [filing index](https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/0001193125-26-340204-index.htm) · SEC's rendering of the balance sheet: [R4.htm](https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/R4.htm)

Statement: "CONDENSED CONSOLIDATED UNAUDITED BALANCE SHEETS", June 30, 2026 column. The filing shows USD **thousands**; the table below is in USD millions. "PeerSet" is the engine's value from the frozen fixtures (as of 2026-10-26).

## EV inputs at 2026-06-30

| Line (as labeled on the balance sheet)              | Concept                                         | PeerSet | Filing (USD thousands)      | In total? | Rule                                                           | Diff | Status                                                  |
| --------------------------------------------------- | ----------------------------------------------- | ------- | --------------------------- | --------- | -------------------------------------------------------------- | ---- | ------------------------------------------------------- |
| Current portion of lease liabilities                | `LongTermDebtAndCapitalLeaseObligationsCurrent` | 119.7   | 119,723                     | **No**    | §7 rule 2, lease-only label: excluded, `W_LEASE_LINE_EXCLUDED` | —    | Confirmed: verified against rendered filings 2026-10-26 |
| Operating lease liabilities, net of current portion | `OperatingLeaseLiabilityNoncurrent`             | 406.5   | 406,478                     | No        | §7 rule 2: never debt                                          | —    | Confirmed: verified against rendered filings 2026-10-26 |
| Finance lease liabilities, net of current portion   | `FinanceLeaseLiabilityNoncurrent`               | 9.1     | 9,068                       | Debt      | §7 rule 2: finance lease shown as its own line                 | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| **Total debt**                                      |                                                 | 9.1     | 9,068                       |           | §7                                                             | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Cash and cash equivalents                           | `CashAndCashEquivalentsAtCarryingValue`         | 364.2   | 364,189                     | Cash      | §8                                                             | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Short-term cash investments                         | `ShortTermInvestments`                          | 100.0   | 100,000                     | Cash      | §8                                                             | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| **Cash and short-term investments**                 |                                                 | 464.2   | 364,189 + 100,000 = 464,189 |           | §8                                                             | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Preferred stock, $0.50 par value                    | `PreferredStockValue`                           | 0.0     | 0                           | Not in EV | §9                                                             | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |
| Non-controlling interest                            | `MinorityInterest`                              | 478.8   | 478,797                     | Not in EV | §9 (the 5% test is in "Valuation at test price" below)         | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |

## Things to know before checking

- **No borrowings on the face.** Watsco shows no revolver or other debt line at June 30, 2026. Its only debt-tagged line is "Current portion of lease liabilities".
- **Why the 119.7 is left out.** That line is tagged as debt (`LongTermDebtAndCapitalLeaseObligationsCurrent`), but its label says only "lease liabilities". Watsco has no separate current operating-lease line, and its noncurrent leases are 406.5 operating and 9.1 finance, so the current line is mostly operating leases, which are never debt. Methodology 0.3.0 §7 rule 2 (your M2a decision) excludes such a line and shows the warning. The small current finance-lease piece inside it is therefore not in total debt; XBRL does not report it separately.
- **Two share classes.** Watsco has common and Class B stock; see "Valuation at test price" below.

## How to check (about 10 minutes)

1. Open the **10-Q** document above and find "CONDENSED CONSOLIDATED UNAUDITED BALANCE SHEETS" (near the start, under Part I, Item 1). Use the **June 30, 2026** column. Amounts are in thousands.
2. Under "Current liabilities", find "Current portion of lease liabilities" (119,723). Confirm there is no line for borrowings under a revolving credit agreement.
3. Under "Long-term obligations", find "Finance lease liabilities, net of current portion" (9,068) and "Operating lease liabilities, net of current portion" (406,478). Total debt should be the finance lease line only.
4. Under "Current assets", add "Cash and cash equivalents" and "Short-term cash investments".
5. Under equity, check "Preferred stock" (0) and "Non-controlling interest" (478,797).
6. Optional: in the 10-Q's lease note, see how the current lease liability splits between operating and finance leases, to judge how much the exclusion leaves out.
7. If a row matches, change its Status to **Confirmed** and commit (`docs: confirm WSO EV inputs`). If not, leave it and note the difference.

## LTM through June 30, 2026 (added in M2b)

Golden file `tests/golden/WSO-2026Q2.json`. LTM = FY2025 + six months ended June 30, 2026 − six months ended June 30, 2025 (methodology §2). Watsco reports in USD **thousands**, so this table is in thousands. The values were transcribed from the filings' XBRL facts, read straight from the frozen fixture files without the engine; the engine then matched every one to the dollar.

- **10-K** for the year ended December 31, 2025, filed February 27, 2026, accession 0001193125-26-082486: [document](https://www.sec.gov/Archives/edgar/data/105016/000119312526082486/wso-20251231.htm)
- **10-Q** for the quarter ended June 30, 2026 (document link above): "Condensed Consolidated Unaudited Statements of Income" ([R2.htm](https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/R2.htm)) and "… Statements of Cash Flows" ([R8.htm](https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/R8.htm)), six-month columns

| Metric                            | Concept                                | FY2025 (10-K)                | 6M 2026   | 6M 2025   | LTM                                                                                | Status    |
| --------------------------------- | -------------------------------------- | ---------------------------- | --------- | --------- | ---------------------------------------------------------------------------------- | --------- |
| Revenue                           | `Revenues`                             | 7,239,290                    | 3,637,869 | 3,593,528 | 7,283,631                                                                          | Confirmed |
| Operating income                  | `OperatingIncomeLoss`                  | 720,347                      | 348,556   | 384,057   | 684,846                                                                            | Confirmed |
| D&A (cash-flow statement)         | `DepreciationDepletionAndAmortization` | 43,752                       | 21,943    | 21,687    | 44,008                                                                             | Confirmed |
| EBITDA (standardized, unadjusted) | operating income + D&A                 |                              |           |           | 684,846 + 44,008 = 728,854                                                         | Confirmed |
| EBITDA margin                     |                                        |                              |           |           | 728,854 ÷ 7,283,631 = 10.01%                                                       | Confirmed |
| Net income attributable to Watsco | `NetIncomeLoss`                        | 496,994                      | 242,410   | 263,674   | 475,730                                                                            | Confirmed |
| Diluted EPS (USD)                 | `EarningsPerShareDiluted`              | 12.25                        | 5.92      | 6.50      | 11.67                                                                              | Confirmed |
| EPS cross-check                   |                                        | FY diluted shares 37,899,859 |           |           | 475,730,000 ÷ 37,899,859 = 12.55 vs 11.67: a 7.6% gap, so `W_EPS_CROSSCHECK` warns | Confirmed |

Things to know:

- **D&A concept.** The 10-K tags D&A under `DepreciationDepletionAndAmortization` (43,752) and also under `DepreciationAndAmortization` (38,407) plus `AmortizationOfIntangibleAssets` (5,345), which sum to the same 43,752. The first concept is highest in the priority list and has all three components, so it is used (methodology §3).
- **EPS gap.** The 7.6% gap is a warning, not a suppression (§5). Watsco reports one diluted EPS for "Common and Class B common stock", and its net income is after the noncontrolling interest. Check whether its diluted share count (and the two-class method) explains the gap. In any case, WSO's P/E is Unsupported because it has two classes.
- **Captions.** The golden file names each line by its XBRL concept, not its printed caption. Please confirm the captions while you check.

## Valuation at test price

Methodology 0.3.1 §6, §9, §10 · golden file `tests/golden/WSO-2026Q2-valuation.json`. **The prices are test inputs, not market data:** 450.00 USD for both classes as of October 23, 2026. Alpha Vantage's actual close for WSO that day was 322.98, and it is not used here. Amounts are in USD, in full.

| Row                                   | PeerSet        | Filing input or manual calc                                                                | Source                                                                                                                                                    | Status    |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Common stock shares (`WSO`)           | 35,588,756     | 35,588,756 as of August 4, 2026                                                            | 10-Q **cover page**, common stock (`dei:EntityCommonStockSharesOutstanding`, `CommonStockMember`); trading symbol `WSO`, NYSE                             | Confirmed |
| Class B common stock shares (`WSO-B`) | 5,663,438      | 5,663,438 as of August 4, 2026                                                             | 10-Q cover page, Class B (`CommonClassBMember`); the cover's symbol is `WSOB`, which SEC lists as `WSO-B`                                                 | Confirmed |
| Market cap                            | 18,563,487,300 | 450.00 × 35,588,756 + 450.00 × 5,663,438 = 16,014,940,200 + 2,548,547,100 = 18,563,487,300 | §6: both classes listed and priced                                                                                                                        | Confirmed |
| Total debt                            | 9,068,000      | from "EV inputs" above                                                                     | Confirmed row                                                                                                                                             | Confirmed |
| Cash and short-term investments       | 464,189,000    | from "EV inputs" above                                                                     | Confirmed row                                                                                                                                             | Confirmed |
| **Enterprise value**                  | 18,108,366,300 | 18,563,487,300 + 9,068,000 − 464,189,000 = 18,108,366,300                                  | §9                                                                                                                                                        | Confirmed |
| Noncontrolling interest test          | no warning     | 478,797,000 ÷ 18,563,487,300 = 2.58%, not above 5%                                         | §9. The warning would start below a price of 232.13 for both classes (478,797,000 ÷ 0.05 ÷ 41,252,194 shares); the unit test checks 200.00 (5.80%, warns) | Confirmed |
| EV / Revenue (LTM)                    | 2.49x          | 18,108,366,300 ÷ 7,283,631,000 = 2.4862                                                    | LTM table above                                                                                                                                           | Confirmed |
| EV / EBITDA (LTM)                     | 24.84x         | 18,108,366,300 ÷ 728,854,000 = 24.844984                                                   | LTM table above                                                                                                                                           | Confirmed |
| P / E                                 | Unsupported    | "P/E is computed for single-class companies only"                                          | §5                                                                                                                                                        | Confirmed |
| Dates shown                           |                | price October 23, 2026 · balance sheet June 30, 2026 · shares August 4, 2026               | As-of strip and EV drawer                                                                                                                                 | Confirmed |

**How to check (about 15 minutes).**

1. On the 10-Q cover page, find the two share counts as of August 4, 2026 (common stock and Class B common stock) and the trading symbols table (WSO and WSOB, both NYSE).
2. In the 10-K and 10-Q statements of income and cash flows, find the LTM table's numbers.
3. Redo the arithmetic, and change each matching row's Status to **Confirmed**.

## Golden change log

- **October 26, 2026 — definition change (version only).** The `methodologyVersion` field in `tests/golden/WSO-2026Q2-balance.json` moved from 0.3.0 to 0.3.1. Methodology 0.3.1 adds only the stale-price warning (§12). No value or concept in the golden changed.
