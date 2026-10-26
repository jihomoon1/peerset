# WSO reconciliation — EV inputs at June 30, 2026

Watsco, Inc. · CIK 0000105016 · methodology 0.3.0 (0.3.1 changed no value here) · golden file `tests/golden/WSO-2026Q2-balance.json`

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
| Non-controlling interest                            | `MinorityInterest`                              | 478.8   | 478,797                     | Not in EV | §9 (the 5%-of-market-cap test needs a price: M2b)              | 0.0  | Confirmed: verified against rendered filings 2026-10-26 |

## Things to know before checking

- **No borrowings on the face.** Watsco shows no revolver or other debt line at June 30, 2026. Its only debt-tagged line is "Current portion of lease liabilities".
- **Why the 119.7 is left out.** That line is tagged as debt (`LongTermDebtAndCapitalLeaseObligationsCurrent`), but its label says only "lease liabilities". Watsco has no separate current operating-lease line, and its noncurrent leases are 406.5 operating and 9.1 finance, so the current line is mostly operating leases, which are never debt. Methodology 0.3.0 §7 rule 2 (your M2a decision) excludes such a line and shows the warning. The small current finance-lease piece inside it is therefore not in total debt; XBRL does not report it separately.
- **Two share classes.** Watsco has common and Class B stock; that matters for market cap in M2b, not here.

## How to check (about 10 minutes)

1. Open the **10-Q** document above and find "CONDENSED CONSOLIDATED UNAUDITED BALANCE SHEETS" (near the start, under Part I, Item 1). Use the **June 30, 2026** column. Amounts are in thousands.
2. Under "Current liabilities", find "Current portion of lease liabilities" (119,723). Confirm there is no line for borrowings under a revolving credit agreement.
3. Under "Long-term obligations", find "Finance lease liabilities, net of current portion" (9,068) and "Operating lease liabilities, net of current portion" (406,478). Total debt should be the finance lease line only.
4. Under "Current assets", add "Cash and cash equivalents" and "Short-term cash investments".
5. Under equity, check "Preferred stock" (0) and "Non-controlling interest" (478,797).
6. Optional: in the 10-Q's lease note, see how the current lease liability splits between operating and finance leases, to judge how much the exclusion leaves out.
7. If a row matches, change its Status to **Confirmed** and commit (`docs: confirm WSO EV inputs`). If not, leave it and note the difference.

## Golden change log

- **October 26, 2026 — definition change (version only).** The `methodologyVersion` field in `tests/golden/WSO-2026Q2-balance.json` moved from 0.3.0 to 0.3.1. Methodology 0.3.1 adds only the stale-price warning (§12). No value or concept in the golden changed.
