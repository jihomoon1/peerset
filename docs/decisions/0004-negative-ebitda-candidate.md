# 0004 — Negative-EBITDA candidate: Lucid Group (LCID)

Date: October 23, 2026 · Status: **accepted** (November 1, 2026): fixture `tests/fixtures/sec/LCID/2026Q2` captured in M6; goldens `tests/golden/LCID-2026Q2*.json`; reconciliation `docs/reconciliation/LCID.md`

## Candidate

**Lucid Group, Inc.**: ticker LCID (Nasdaq), CIK 0001811210, SIC 3711 "Motor Vehicles & Passenger Car Bodies", Delaware, fiscal year ends December 31, files 10-K/10-Q in USD. It meets the v1 support matrix: listed, non-financial SIC, USD, single listed class, latest periodic filing 80 days old (within 200).

## How it was found

SEC's XBRL frames (`OperatingIncomeLoss/USD/CY2025` and `RevenueFromContractWithCustomerExcludingAssessedTax/USD/CY2025`) were used **only to search**: 355 NYSE/Nasdaq companies had CY2025 operating income below zero with revenue of at least 200M USD. Lucid was chosen as a recognizable operating business, rather than a biotech or a bitcoin treasury company, so the NM path is easy to explain. All numbers below come from the filings, not frames.

## Filings used

| Role                      | Form | Accession            | Filed      | Period end |
| ------------------------- | ---- | -------------------- | ---------- | ---------- |
| Latest periodic (LTM end) | 10-Q | 0001628280-26-052606 | 2026-08-04 | 2026-06-30 |
| Prior fiscal year         | 10-K | 0001628280-26-011053 | 2026-02-24 | 2025-12-31 |

companyfacts already contained the latest 10-Q on 2026-10-23, and each value below was also read directly from the filings' XBRL instances (`lcid-20260630_htm.xml`, `lcid-20251231_htm.xml`); both sources agree.

## LTM calculation (methodology §2, to 2026-06-30)

| Line item (us-gaap concept)                                     | FY 2025-01-01..2025-12-31 (10-K) | + YTD 2026-01-01..2026-06-30 (10-Q) | − YTD 2025-01-01..2025-06-30 (10-Q) | = LTM                  |
| --------------------------------------------------------------- | -------------------------------- | ----------------------------------- | ----------------------------------- | ---------------------- |
| Operating income (`OperatingIncomeLoss`)                        | (3,501,753,000.00)               | (2,071,653,000.00)                  | (1,494,980,000.00)                  | **(4,078,426,000.00)** |
| D&A (`DepreciationDepletionAndAmortization`)                    | 451,200,000.00                   | 238,600,000.00                      | 209,000,000.00                      | **480,800,000.00**     |
| Revenue (`RevenueFromContractWithCustomerExcludingAssessedTax`) | 1,353,790,000.00                 | 687,812,000.00                      | 494,480,000.00                      | **1,547,122,000.00**   |

Math, in USD:

- Operating income: −3,501,753,000 + (−2,071,653,000) − (−1,494,980,000) = **−4,078,426,000**
- D&A: 451,200,000 + 238,600,000 − 209,000,000 = **480,800,000**
- Revenue: 1,353,790,000 + 687,812,000 − 494,480,000 = **1,547,122,000**
- **EBITDA = −4,078,426,000 + 480,800,000 = −3,597,626,000** (below zero ✔)
- EBITDA margin = −3,597,626,000 ÷ 1,547,122,000 = −2.3254 → **(232.5%)**

Period checks: fiscal year is 365 days (within 350–378); current YTD starts 2026-01-01, the day after FY end; the prior-year YTD is the same 181-day length and starts exactly one year earlier.

Expected PeerSet behavior: EV/EBITDA is **NM** ("EBITDA ≤ 0"), and the negative margin is still shown.

## Notes for M6

- Values are as filed; reconfirm against the latest filing when the fixture is captured (Lucid's Q3 2026 10-Q is likely due in early November 2026).
- The prior-YTD D&A in the 10-Q instance is written as `209000000.0` (decimal form). The M1 parser must accept decimal-formatted numbers.
- D&A carries `decimals="-5"` (rounded to 0.1M); operating income `decimals="-3"`.

## Outcome (M6, November 1, 2026)

- The captured 10-Q (0001628280-26-052606) gives exactly the LTM values above. No Q3 2026 10-Q existed yet.
- EV/EBITDA is NM ("EBITDA ≤ 0") at the test price 20.00 (EV 10,481,518,520 > 0); P/E is NM ("EPS ≤ 0").
- Two findings: Lucid's 2025 reverse split predates the FY2025 10-K but tripped the restatement split test, fixed by methodology 0.4.1; and its $2.9 billion temporary-equity preferred is Unsupported under §9, so EV has no "not in EV" warning (a known limitation).
