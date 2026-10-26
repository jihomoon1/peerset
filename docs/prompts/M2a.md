# PeerSet — Claude Code session M2a: debt and cash from the balance-sheet face

M1 is complete: PR #3 merged, LII's LTM reconciliation confirmed. M2 is split in two:

- **M2a (this session):** debt and cash. Methodology 0.3.0, a balance-sheet face reader, goldens for six companies.
- **M2b (next session):** shares by class, quotes, the EV bridge, and the valuation UI.

Sources of truth: `docs/methodology.md` (0.2.1 now; this session moves it to 0.3.0), blueprint §7.7–7.9, §8, §15–16, and `CLAUDE.md`. If anything conflicts, stop and ask Jiho.

## Why the debt method changes

Planning checked 0.2.1's tag-list rules against real filings (data from 2026-10-22). They fail for four of six HVAC peers:

| Company | Balance sheet as tagged | What 0.2.1 would do |
| --- | --- | --- |
| LII 2026-06-30 | `CommercialPaper` 412.0; `LongTermDebtAndCapitalLeaseObligationsCurrent` 20.1; `LongTermDebtAndCapitalLeaseObligations` 1,149.2 (sum 1,581.3 = total tag) | Correct |
| Carrier 2026-03-31 | `DebtCurrent` 1,736.0 (includes commercial paper 708.0); `LongTermDebtNoncurrent` 10,422.0; total tag 11,427.0 excludes the commercial paper | Correct after 0.2.0's `DebtCurrent` rule |
| AAON 2026-06-30 | Revolver tagged `LineOfCredit` 435.0 (`LongTermLineOfCredit` in earlier quarters) | Debt Missing: concept not in the list |
| Graco 2026-09-25 | `ShortTermBankLoansAndNotesPayable` 30.0; `UnsecuredDebtCurrent` 0.7; `LongTermDebtNoncurrent` 103.8 | Understated: 30.0 and 0.7 not in the list |
| Watsco 2026-06-30 | `LongTermDebtAndCapitalLeaseObligationsCurrent` 119.7; `FinanceLeaseLiabilityNoncurrent` 9.1; no noncurrent debt line | Missing (no noncurrent line), or the 9.1 dropped |
| Trane 2026-06-30 | `DebtCurrent` 693.1; `LongTermDebtNoncurrent` 3,923.7; cash tagged only as `CashCashEquivalentsRestrictedCash…IncludingDisposalGroup…` 1,318.3 | Debt correct; cash via the 0.2.0 fallback |

Every EDGAR filing ships SEC-rendered statements (`FilingSummary.xml` plus `R#.htm`). Both appear in the LII and WSO filing indexes. WSO has no separate `_pre.xml`. The rendered balance sheet shows exactly which line items the company presents. **Building debt and cash from those face lines** removes the guessing:

- no double counting, because face lines are disjoint;
- no unknown-tag misses, as long as the classification covers the tag;
- the "line not presented" question goes away: absent from the face means not reported.

## Methodology 0.3.0 (proposed in planning; include it in your plan)

Jiho's approval of your plan is her approval of 0.3.0. Write it into `docs/methodology.md` §7–§9 and the §15 change log, and into `policy.ts`, before implementing.

1. **Face lines.**
    - Find the balance sheet in the latest periodic filing's `FilingSummary.xml`: the report in menu category "Statements" whose short name matches balance sheet / financial position / financial condition, not "Parenthetical".
    - Read that `R#.htm`. For each row, get its concept (`defref_<prefix>_<Local>`) and label.
    - Values come from the filing's XBRL instance (consolidated facts at the balance-sheet date, full precision). The R file is used only to know **which** concepts are face lines, and their labels.
2. **Total debt** = the sum of face lines whose concept is in the debt classification (current and noncurrent):
    - short-term borrowings, commercial paper, bank loans and notes payable, lines of credit (current and long-term), current and noncurrent long-term debt (including "…AndCapitalLeaseObligations" lines), secured, unsecured, convertible and senior notes;
    - finance lease liabilities when shown as their own face lines;
    - bank overdrafts.
    - Operating lease liabilities are never debt.
3. **A face line that looks like debt but isn't classified** makes total debt **Unsupported**, naming the line: "unrecognized debt line: '<label>' (<concept>)". A line looks like debt if its label matches debt / borrowing / notes payable / loan / credit facility / line of credit / commercial paper / revolving. Never guess.
4. **No debt lines on the face** → total debt is **Reported 0**, with info note `W_NO_DEBT_LINES` ("no debt lines on the balance sheet"). This is the one case where 0 is a reported fact, not a missing value.
5. **A face line with no consolidated fact at the date** (the face shows "—") contributes nothing, noted in provenance.
6. **Cross-check.** When a total-debt tag (`DebtAndCapitalLeaseObligations`, `DebtLongtermAndShorttermCombinedAmount`) exists and differs from the face sum by more than 0.1M, keep the face sum and warn `W_DEBT_TOTAL_TAG_DIFFERS`.
7. **Cash** = face lines classified as:
    - cash and cash equivalents (`CashAndCashEquivalentsAtCarryingValue`, `Cash`, `CashEquivalentsAtCarryingValue`);
    - short-term investments or marketable securities (`ShortTermInvestments`, `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent`, time deposits).

    A face line using a restricted-cash-inclusive concept counts, with "may include restricted cash". Separately presented restricted cash is excluded.
8. **EV-adjustment warnings** (§9) read the face too: preferred stock, noncontrolling interest (equity or temporary equity).
9. **Fallback when the rendered balance sheet can't be found or parsed:** use the 0.2.1 tag rules and warn `W_FACE_UNAVAILABLE`. Never silently.

If any of the six goldens below contradicts these rules, stop and report before changing them.

## Session setup

1. `git switch main && git pull`, then `git switch -c m2a-debt-cash-face`.
2. Jiho will have put this file at `docs/prompts/M2a.md`. In `docs/prompts/README.md`, mark M1b done; M2 is now M2a plus M2b. Commit.
3. Plan mode:
    - Read `CLAUDE.md`, the methodology, and the M1 code (`src/sec/`, `src/domain/`).
    - Check one real `FilingSummary.xml` and balance-sheet `R#.htm` (LII, live, dev only) so the plan is concrete.
    - Name the tools and skills you'll use: TDD for domain and parser, systematic-debugging, verification-before-completion, and the methodology-reviewer agent at the end.
4. Present the plan, including the exact 0.3.0 text, and wait for approval.

## Working mode

May run unattended in auto mode after approval. Decide routine choices and record them. Stop only for `CLAUDE.md` stopping conditions, or a golden that contradicts 0.3.0.

Ask first: `git push` and the PR, new dependencies (none expected), any `vercel` command.

## Scope — in this order

1. **Methodology 0.3.0.** Write the docs and policy changes above. Bump `METHODOLOGY_VERSION`.
2. **Adapter: rendered statements (`src/sec/statements.ts`).**
    - Fetch `FilingSummary.xml`, locate the balance sheet, fetch its `R#.htm`, and parse the rows: concept QName, label, order, and abstract/total flags if visible.
    - Zod or explicit validation; failure → `W_FACE_UNAVAILABLE` path.
    - Raise `REQUEST_BUDGET` from 5 to 7 (+FilingSummary, +R file), recorded in `docs/decisions/0006-balance-sheet-face.md` together with the "why" table above.
    - Results are cacheable for 30 days per accession (filings never change).
    - Extend `scripts/capture-fixture.ts` to also capture `FilingSummary.xml` and the balance-sheet R file, and re-capture LII and WSO.
3. **New fixtures** (same script, live, paced):
    - GGG 10-Q `0000042888-26-000145` (asof `2026Q3`)
    - AAON 10-Q `0000824142-26-000055` (`2026Q2`)
    - CARR 10-Q `0001783180-26-000032` (`2026Q2`)
    - TT 10-Q `0001628280-26-051117` (`2026Q2`)

    Confirm each accession is the latest periodic filing as of capture. If a newer 10-Q exists, still capture the listed one and note it.
4. **Domain (`src/domain/debt.ts`, `cash.ts`, `evAdjustments.ts`).** Pure functions over (face lines, facts, balance-sheet date) → `Metric`s with line-level provenance: label, concept, value, included or excluded and why. Unit tests:
    - every rule above;
    - double-count impossibility;
    - unrecognized-line Unsupported;
    - `W_NO_DEBT_LINES`;
    - the fallback path.
5. **Goldens: six companies.** For LII, WSO, GGG, AAON, CARR and TT, write `tests/golden/<T>-<asof>-balance.json` with:
    - each debt and cash face line;
    - totals;
    - NCI and preferred.

    Values come from the **rendered balance sheet in the filing document** (cite statement and line), not the engine. The tests run offline through the full adapter → domain path.

    Report a table: company · total debt · cash · warnings · engine vs filing.

    Expected direction from planning:
    - LII debt 1,581.3, cash 51.5 + 0.6
    - AAON includes its 435.0 line of credit
    - GGG includes 30.0 bank notes
    - WSO includes noncurrent finance leases 9.1 if presented on the face
    - TT cash with the restricted-cash note
    - WSO noncontrolling interest 478.8 (below the 5% NCI threshold once priced; that test belongs to M2b)

    If the filing documents show otherwise, the documents win. Report it.
6. **Reconciliation.**
    - Add an "EV inputs at 2026-06-30" section to `docs/reconciliation/LII.md`: debt lines, cash lines, preferred and NCI, each Awaiting Jiho.
    - Create `docs/reconciliation/WSO.md` with the same structure.
7. **`fundamentals.ts` and the API** gain `debt`, `cash` and `evAdjustments` (no prices yet). The cache key includes methodology 0.3.0. Check that the cached entry is still under 2 MB.
8. **Page.** Add a small "Balance sheet (for EV)" block under the operating block: total debt and cash, each opening the drawer with the face-line table. No price, market cap or EV yet (M2b).
9. **Methodology-reviewer agent** over the branch. Address its findings.

## Out of scope

Shares and classes, quotes, market cap, EV, multiples (M2b), peers (M4), Excel (M5), deployment (M3).

## Gate — M2a

- [ ] Methodology 0.3.0 in docs and `policy.ts`, versions match
- [ ] Face reader parses LII, WSO, GGG, AAON, CARR and TT balance sheets from fixtures; fallback path tested
- [ ] Six balance-sheet goldens pass offline; engine equals filing for every debt and cash line
- [ ] Unrecognized-debt-line → Unsupported; no-debt-lines → Reported 0 with note; both tested
- [ ] LII and WSO reconciliation sections written, Awaiting Jiho
- [ ] Drawer shows face lines with labels, concepts, values and inclusion reasons
- [ ] typecheck, lint, test and build pass; no User-Agent or email leaks
- [ ] Jiho's item: LII and WSO EV-input rows Confirmed

## Finishing

1. Run the full check.
2. Ask before pushing, then push and open the PR "M2a: debt and cash from the balance-sheet face".
3. Check `gh pr checks`.
4. Run the code-review plugin.
5. Don't merge.

Final report: the same 13 parts. Part 6 is the six-company table. Part 11 tells Jiho exactly what to check.
