# PeerSet — Claude Code session M1b: LTM financials for one company, reconciled

M1a is merged (`main` at `b13d8aa`). The SEC adapter returns typed facts from companyfacts plus the latest filing's XBRL instance, each tagged with source and accession. This session turns those facts into LII's LTM operating metrics, shown on a minimal page where every number opens its full calculation, and prepares the reconciliation Jiho must sign off. That sign-off is the M1 gate (blueprint §22).

Sources of truth: `docs/methodology.md` 0.2.0 (§1–§5 and §14 matter most here), blueprint §5, §6, §11, §13–§16, and `CLAUDE.md`. If anything here conflicts with them, stop and ask Jiho.

## Session setup

1. `git switch main && git pull`, then `git switch -c m1b-ltm-financials`.
2. This file is already at `docs/prompts/M1b.md`; Jiho moved it there. In `docs/prompts/README.md`, mark M1a done and M1b in progress. Commit `docs: add M1b session prompt`.
3. Start in plan mode. Read `CLAUDE.md`, `docs/methodology.md`, and the M1a code in `src/sec/` and `src/domain/`. Name the tools and skills you'll use. Expected:
    - Superpowers `test-driven-development` for all of `src/domain/`
    - `systematic-debugging` for any failure
    - `verification-before-completion` at the end
    - WebFetch for current Next.js 16 docs on route handlers and `unstable_cache`
4. Present the plan, then wait for approval.

## Working mode

Jiho may run this unattended in auto mode.

- Decide routine choices yourself and record them in the report.
- Stop only for `CLAUDE.md` stopping conditions or the "Ask first" list.
- Domain code is test-first, always.

**Ask first:**

- `git push` and opening the PR
- any new dependency (none should be needed)
- any change to `docs/methodology.md` or the blueprint
- any `vercel` command

**Checkpoint rule.** Work in the order below. If context or time runs short after step 5, commit, write the report for steps 1–5, and stop. Steps 6–7 can be their own session.

## Scope — in this order

### 1. Metric types (`src/domain/types.ts`)

Add the blueprint §11 `Metric` tagged union and its supporting types: `MetricWarning`, `WarningCode`, `NmReason`, `LTMCalculation`, `Provenance`.

The union must be impossible to read as a number without first checking `status`. Add a type-level test (for example with `expectTypeOf`) proving it.

### 2. Fact selection (`src/domain/factSelection.ts`)

A pure function implementing methodology §1 rule 1.

- For a concept and an exact period (start and end, or instant), among consolidated facts (`dimensions` empty) from periodic forms, return the fact from the **latest-filed** filing.
- **Tie on filed date:** same accession from both sources. If the values agree, prefer `filing`. If they disagree, return Unsupported with a warning.
- Share-class lookup is a separate function: dimensional facts on `StatementClassOfStockAxis`. It's needed in M2; add the function now with a test against the WSO fixture.

Tests: restatement (a later filing wins), amendment, duplicate across sources, dimensional facts ignored, non-periodic forms ignored.

### 3. LTM engine (`src/domain/ltm.ts`)

Implement methodology §2 exactly.

**Inputs:** facts, the LTM end (the latest periodic filing's report date), and the latest periodic form.

**Calculation:**

- **After a 10-K:** LTM is that fiscal year.
- **After a 10-Q:** find FY, current YTD and prior-year YTD, apply every check in §2, and return an `LTMCalculation` with each check's pass/fail and detail.
- **Concept choice (0.2.0 §3):** use the highest-priority concept that has every LTM component. Never mix concepts across components.

**Unsupported when:**

- any check fails, with a reason naming the failed check;
- any component is missing;
- the adapter's freshness status is `filing-missing`. Never compute LTM on an older quarter.

**Warnings:**

- `W_53_WEEKS` when a component spans 364+ days and the window covers a 53-week year.
- `W_FILING_PARSED` carried through from the adapter.

**Tests (all synthetic, dated facts):**

- December year-end, after a 10-K and after each of Q1, Q2, Q3
- September year-end (JCI-like)
- March year-end (Modine-like)
- 52/53-week year ending the last Friday of December (Graco-like), including a 53-week year
- each failing check
- concept switching (Carrier-like D&A: priority 1 has only FY, priority 3 has all components → use priority 3)

### 4. Metrics (`src/domain/metrics/`)

One file each, implementing methodology §3–§5:

- `revenue.ts`, including the two-concepts-disagree rule (use `Revenues` when larger, warn, show both)
- `operatingIncome.ts` (no fallback)
- `da.ts` (always `W_DA_FROM_CASH_FLOW`)
- `ebitda.ts`
- `ebitdaMargin.ts` (shown even when negative)
- `netIncome.ts`
- `eps.ts`:
    - LTM diluted EPS = FY + YTD − prior YTD
    - cross-check against LTM net income ÷ FY `WeightedAverageNumberOfDilutedSharesOutstanding`; warn `W_EPS_CROSSCHECK` above 5%
    - split detection per §5 sets a `splitSinceLastAnnual` flag for M2's P/E

Each returns a `Metric` whose provenance lists the exact facts used: concept, period, value, accession, source.

Also add `src/domain/fundamentals.ts`, which composes everything into one `CompanyFundamentals` object: identity, LTM end, metrics, LTM details, warnings, freshness and methodology version. It must be plain JSON-serializable.

### 5. LII golden test and reconciliation

1. **Expected values from the filings themselves.** Read the rendered statements in LII's FY2025 10-K (accession `0001069202-26-000028`, filed 2026-02-17) and its Q2 2026 10-Q (`0001069202-26-000087`). From those, write `tests/golden/LII-2026Q2.json` with:
    - every component (FY, current YTD, prior YTD) for revenue, operating income, D&A, net income and diluted EPS;
    - the resulting LTM values.

    For each value, cite the statement and line in a `source` field. Golden values come from the documents, not from the engine. The fixtures don't include the 10-K instance, so FY values reach the engine through companyfacts. Confirm against the 10-K document.
2. **The golden test.** It runs the full pipeline offline: fixture-mocked SEC client → `getCompanyFacts` → `fundamentals`, with `asOf` = 2026-10-23. It asserts every value to the dollar (EPS to the cent) and asserts freshness `filing-parsed`.
3. **Reconciliation doc.** Write `docs/reconciliation/LII.md` in the blueprint §16 format: Metric · PeerSet · filing inputs and manual calculation · source (document, statement, line, with links to the filing documents on sec.gov) · formula · diff · Status.
    - Set every Status to **Awaiting Jiho**.
    - Add a short "How to check" section for Jiho: which document, which statement, which column for each input.
4. **Do not mark anything Confirmed.** Only Jiho does that.

### 6. API route and caching

Add `src/app/api/fundamentals/route.ts`.

- `GET ?ticker=` → validate the ticker, look it up (M1a `tickers.ts`; a runtime fetch of the ticker list cached 24h), then fetch and compute fundamentals.
- Node runtime, region `iad1`, `maxDuration` 60.
- **Caching per blueprint §14 and decision 0001**, Cache Components off:
    - submissions: 6h;
    - fundamentals: 24h, keyed by CIK + latest accession + methodology version.

    Check the cached entry is under 2 MB and report its size.
- **Errors:** map to the blueprint §15 codes with user-safe messages and HTTP statuses. Never leak stack traces or the User-Agent.
- **Tests:** the route handler with a fixture-mocked client — success, unknown ticker, unsupported issuer, `SEC_RATE_LIMITED`.

### 7. Minimal analysis page

Add `src/app/c/[ticker]/page.tsx` plus the components it needs in `src/ui/`. This is not the full M4 workbench.

- **Identity line:** name, ticker, CIK, SIC, fiscal year-end, exchange.
- **"Financials" strip:** LTM through date, latest filing form, filed date, accession linked to sec.gov, and a "parsed from filing" note when relevant.
- **Operating block:** a real `<table>` of the seven metrics, in USD millions to one decimal (EPS in dollars to two decimals). Statuses display per blueprint §6: "—" for Missing, "Unsupported" with its reason.
- **Provenance drawer:** every value is a button that opens it. It is an accessible dialog with focus trap and Esc to close, and shows:
    - the formula;
    - the LTM bridge table (FY + YTD − prior YTD = LTM);
    - each input's concept, period, value, source and accession, with a link;
    - status and warnings.
- **Disclaimer line from blueprint §1:** "Automated first-pass comps from SEC filings. Unadjusted. Not a substitute for analyst review."
- **Error states** for unknown ticker, unsupported issuer and rate limit.
- **Styling:** Tailwind, per blueprint §6's visual system — dense, one accent color, tabular numerals, no gradients.
- **Run locally:** `npm run dev`, open `/c/LII`, and include a screenshot or the rendered HTML text of the operating block and one open drawer in the report. Also try `/c/GGG` and `/c/WSO` live and report what renders.

### 8. Methodology reviewer subagent

Create `.claude/agents/methodology-reviewer.md`. It is read-only: tools Read, Grep, Glob only. Its job is to compare `src/domain/` against `docs/methodology.md` and the golden files, and report mismatches.

Run it on this branch before finishing. Address or explain every finding in the report.

## Notes carried from the M1a review

- **Later parser improvement (not this session):** the parser drops duplicate facts whose values differ. XBRL treats duplicates as consistent when they agree after rounding to the less precise `decimals`. Neither fixture triggers this today; if a live company shows `W_DUPLICATE_FACT_CONFLICT`, record it in Notes for M2.
- **If a 10-K is missing from companyfacts:** when the FY component is missing *and* the latest 10-K's accession isn't in companyfacts, the adapter may fetch that 10-K's instance with its spare request. Implement only if a live ticker you try needs it; otherwise note it.
- **LII Q3 timing:** LII reports Q3 on 2026-10-28. Keep the Q2 golden as is; a Q3 fixture comes later as a separate step.

## Out of scope

Shares, debt, cash, EV, prices, multiples (M2); peers, the comps table, Excel (M4–M5); Playwright and deployment (M3).

## Acceptance gate — M1 (blueprint §22), plus checkpoints

- [ ] LII Q2 golden test passes offline, including the filing-parse path
- [ ] Unit tests cover selection, every LTM check, and the December, September, March and 52/53-week calendars, plus concept switching
- [ ] `docs/reconciliation/LII.md` complete, with every row "Awaiting Jiho" and a how-to section
- [ ] The drawer shows formula, inputs, concept, period, accession and link for every metric
- [ ] The methodology-reviewer subagent's findings are addressed
- [ ] `/c/LII` renders locally with live data; GGG and WSO outcomes reported
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` pass
- [ ] No User-Agent or email in the repo outside placeholders
- [ ] **Jiho's item, not yours:** every LII reconciliation row Confirmed

## Finishing

1. Run the full check and quote the result.
2. Ask before pushing. Then push and open the PR "M1b: LTM financials for LII, reconciled".
3. Check `gh pr checks`.
4. Run the code-review plugin and handle its findings.
5. Do not merge.

## Final report

Use the same 13 parts as M0. Part 6 must include LII's LTM table — engine value next to the filing-derived value for each metric — and the cached entry size. Part 11 must tell Jiho exactly how to do the reconciliation.

Stop at the gate.
