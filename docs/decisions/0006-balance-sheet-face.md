# 0006 — Debt and cash from the balance-sheet face

Date: October 26, 2026 · Status: decided in M2a (methodology 0.3.0, approved by Jiho in M2a planning)

## Problem

Methodology 0.2.1 built debt and cash from fixed tag lists. Checked against real filings (SEC data from 2026-10-22), the lists fail for four of six HVAC peers:

| Company            | Balance sheet as tagged                                                                                                                                   | What 0.2.1 would do                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| LII 2026-06-30     | `CommercialPaper` 412.0; `LongTermDebtAndCapitalLeaseObligationsCurrent` 20.1; `LongTermDebtAndCapitalLeaseObligations` 1,149.2 (sum 1,581.3 = total tag) | Correct                                          |
| Carrier 2026-03-31 | `DebtCurrent` 1,736.0 (includes commercial paper 708.0); `LongTermDebtNoncurrent` 10,422.0; total tag 11,427.0 excludes the commercial paper              | Correct after 0.2.0's `DebtCurrent` rule         |
| AAON 2026-06-30    | Revolver tagged `LineOfCredit` 435.0 (`LongTermLineOfCredit` in earlier quarters)                                                                         | Debt Missing: concept not in the list            |
| Graco 2026-09-25   | `ShortTermBankLoansAndNotesPayable` 30.0; `UnsecuredDebtCurrent` 0.7; `LongTermDebtNoncurrent` 103.8                                                      | Understated: 30.0 and 0.7 not in the list        |
| Watsco 2026-06-30  | `LongTermDebtAndCapitalLeaseObligationsCurrent` 119.7; `FinanceLeaseLiabilityNoncurrent` 9.1; no noncurrent debt line                                     | Missing (no noncurrent line), or the 9.1 dropped |
| Trane 2026-06-30   | `DebtCurrent` 693.1; `LongTermDebtNoncurrent` 3,923.7; cash tagged only as `CashCashEquivalentsRestrictedCash…IncludingDisposalGroup…` 1,318.3            | Debt correct; cash via the 0.2.0 fallback        |

## Decision

Every EDGAR filing ships SEC-rendered statements: `FilingSummary.xml` plus one `R#.htm` per statement. PeerSet reads the rendered balance sheet to learn **which** concepts the company presents as face lines and their labels; values still come from the filing's XBRL instance. Face lines are disjoint, so summing the classified ones cannot double count; a tag the classification does not cover is caught by its label instead of silently missed; and "absent from the face" means "not reported". Full rules: methodology §7–§9.

- `src/sec/statements.ts` locates the balance sheet and parses its rows; `src/sec/freshness.ts` fetches both files between the filing index and the instance, and parses the instance with the face concepts added to the whitelist.
- **Request budget 5 → 7**: submissions, companyfacts, index, FilingSummary.xml, the R file, instance, plus one spare.
- **Cache**: both files are fetched with a 30-day revalidate, keyed by URL, which contains the accession; filings never change.
- **Failure**: anything unexpected in either file gives "unavailable" with a reason, never an exception. The domain then uses the 0.2.1 tag rules and warns `W_FACE_UNAVAILABLE`.

## Implementation choices (routine, recorded here)

- **R files are read with a bounded row scanner** (regular expressions over the first `<table class="report">`), not an XML parser: they are generated HTML with unescaped entities. Each row's concept comes from `defref_<prefix>_<LocalName>`; headings (`…Abstract`) are skipped; an `rh` row starts per-member sections (Watsco's share classes) and ends the scan.
- **Several balance-sheet reports** in FilingSummary: the lowest `Position` wins.
- **The same concept on two face rows** counts once.
- **Fixtures**: `scripts/capture-fixture.ts --add-statements` adds only the two new files to the existing LII and WSO fixtures, so their frozen companyfacts and instance (and the M1 golden) are unchanged.
- **Debt-looking / cash-looking labels** are checked only on their side of the balance sheet (liabilities after the `Assets` total row; cash up to it), so asset lines such as "Notes receivable" or "Debt securities" cannot trip the debt rule.

## Found while building the goldens

- **Watsco** tags "Current portion of lease liabilities" (119.7M) as `LongTermDebtAndCapitalLeaseObligationsCurrent`. It has no separate current operating-lease line and its noncurrent leases are 406.5M operating vs 9.1M finance, so the line is mostly operating leases. Jiho's rule (added to 0.3.0 §7 rule 2): a debt-tagged line whose label says only "lease" counts only when it says finance or capital lease; otherwise it is excluded with `W_LEASE_LINE_EXCLUDED`.
- **AAON** presents "New market tax credit obligation" lines (company tags). Their labels are not debt-like, so they are not debt under 0.3.0 (Jiho confirmed); they are listed in the reconciliation.

- **Carrier 2026-03-31** tags its 10,422.0 noncurrent debt under both `LongTermDebtNoncurrent` and `LongTermDebtAndCapitalLeaseObligations` (companyfacts, 10-Q 0001783180-26-000026), so the table above and the methodology §7.F evidence table are both correct.

## Not chosen

- The presentation linkbase (`_pre.xml`): Watsco's filing has none, while every filing has the rendered statements.
- Wider tag lists alone: they cannot tell a subtotal from its parts and still miss unknown tags.
