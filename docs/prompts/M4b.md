# PeerSet — Claude Code session M4b: the comps workbench

M4a is complete:

- `main` at `dca8cc5` (plus the README PR #13); methodology 0.3.3.
- Peer index: 6,055 listed companies, 3,423 with screening revenue, 1.2 MB; generated 2026-10-29.
- Live `/api/peers` works. LII widens to SIC group 358 → MIDD, ALH, AAON, CARR, TNC, JCI, HAYW. GGG stays exact at 3561 → IEX, ITT, FLS, GRC, XYL.
- Cache fix verified live: `/c/LII` takes 3.3 s on the first load and 0.6 s on the second.
- LII's Q3 10-Q (`0001069202-26-000096`) is already live: LTM through 2026-09-30, companyfacts `current`.

This session turns `/c/[ticker]` into the **comps workbench** from blueprint §6: peer panel, comps table, per-peer prices, NM display, statistics, lag flags, failure isolation, and the GGG and JCI goldens. Implied valuation and the LII Q3 reconciliation are stretch goals.

Sources of truth:

- blueprint §6 (layout, comps table, UX states), §7.10–§7.13, §10.2–§10.3, §13, §16
- `docs/methodology.md` (0.3.3) §10–§13
- `CLAUDE.md`
- the M4a final report, part 13 ("Notes for M4b"): address each note, and list how in the plan

If anything conflicts, stop and ask Jiho.

## Session setup

1. `git switch main && git pull`, then `git switch -c m4b-comps-workbench`.
2. This file is at `docs/prompts/M4b.md`. Commit it. `docs/prompts/README.md` is already updated by PR #13. If #13 isn't merged yet, mark M4a done here.
3. Plan mode:
    - Read `CLAUDE.md`, the methodology, blueprint §6 and the current `/c/[ticker]` code.
    - Name your tools and skills: TDD for every domain function, `systematic-debugging`, `verification-before-completion`, the methodology-reviewer agent at the end, and Playwright CLI/skills to look at the page.
    - Include a short ASCII sketch of the desktop layout in the plan.
4. Present the plan, then wait.

## Working mode

May run unattended in auto mode after approval. Decide routine choices yourself and record them in the report. Stop only for `CLAUDE.md` stopping conditions.

**Ask first:** `git push`; any new dependency (none expected); any methodology change; `vercel` and `gh` settings commands.

**Checkpoint rule:** work in the order below. If context runs short after step 6, commit, report steps 1–6, and stop. Steps 7–9 can be their own session.

## Scope — in this order

### 1. SEC load budget for peer loading (decide first)

A cold LII comps view loads up to 12 uncached peers at about 8 SEC requests each. SEC's limit is 10 requests per second in total, from all machines.

- The browser loads peers through `/api/fundamentals`, so each concurrent peer load may run on its own Vercel instance with its own 4-per-second pacer.
- **Required:** the worst-case aggregate stays at or below 8 requests per second. For example, browser concurrency 2 × 4 per second per instance, or concurrency 3 with per-instance pacing lowered to 2.5 per second. Pick one.
- Record the reasoning in `docs/decisions/0008-peer-load-budget.md`, with the cold-load time it implies for 8 peers.
- Cached peers cost about 2 requests each (the submissions check). Note whether that check can be skipped when the submissions cache is fresh.

### 2. Domain: comps and statistics (`src/domain/comps.ts`, `stats.ts`), test-first

**`buildComps(target, peers[], quotes, analysisDate)`** returns a `CompsTable`:

- **Rows:** target first, then peers.
- **Columns** (blueprint §6): price, market cap, EV, LTM revenue, LTM EBITDA, EBITDA margin, EV/Revenue, EV/EBITDA, P/E, financials-through date.
- **NM and statuses** exactly as the M2 `multiples.ts` / `nm.ts` handle them.

**Statistics** (methodology §11), per metric:

- mean, median, high, low, 25th and 75th percentile (`PERCENTILE.INC`, linear interpolation inclusive)
- `nValid` and `nExcluded`
- **peers only:** the target is excluded
- NM, "—" and Unsupported never enter a statistic

**Lag flag** (methodology §12):

- Flag a company whose LTM end is more than 75 days from the peer-set median LTM end, with `W_PERIOD_LAG`.
- The median of dates is computed on day numbers.

**Tests:**

- even and odd n
- n = 0 and n = 1
- all NM
- a mix of statuses
- percentile values checked against hand-computed `PERCENTILE.INC`
- the lag flag
- a 52/53-week fiscal year next to December filers

### 3. Peer state, add/remove, URL

The peer set state is: suggested peers (from `/api/peers`), plus added tickers, minus removed ones.

- **Add ticker box:**
    - validates, then runs the same fundamentals pipeline;
    - its reason is "Added by you";
    - an unsupported or unknown ticker shows its reason inline and never enters the table.
- **Remove / restore:** "Removed" list with a Restore button.
- **Excluded list:** every screening exclusion with its code and detail, plus any peer that failed to load.
- **URL holds the state:**
    - `?add=TT,WSO&remove=HAYW&px=LII:500,CARR:52.1&pxdate=2026-10-28`, or a compact equivalent you document;
    - the whole analysis is shareable by link;
    - nothing is stored on a server;
    - parse defensively.
- **Max 12 peers loaded**, consistent with `policy.ts`.

### 4. Per-peer prices

- One price input per listed class per row, plus one shared price date.
- **Paste box:** lines of `TICKER, price` or `TICKER<TAB>price` (copied from a spreadsheet).
- Every change recomputes instantly in the browser with the same domain code.
- **"Prices needed" state:** before prices are entered, the table still shows LTM revenue, EBITDA and margin. Valuation columns show "Needs price".
- Prices for removed peers stay in the URL but are ignored.

### 5. Workbench UI (blueprint §6)

- **Layout:** header search; as-of strip; target summary; left peer panel (collapsible, 320 px); main comps table; provenance drawer.
- **Comps table:**
    - columns in blueprint §6 order;
    - target row pinned, with an accent left border and a "Target" tag;
    - stats rows (Mean, Median, High, Low, n per column) below a rule, never sorted;
    - sticky header and sticky Company column;
    - sortable headers with `aria-sort`;
    - number formats as in M2;
    - NM shown with its reason in a tooltip;
    - lag flag shown in the "Fin. through" cell;
    - "parsed from filing" dot.
- **Progressive loading:** skeleton rows for peers, filled as each one arrives, using the step 1 concurrency.
- **Failure isolation:**
    - a peer that fails or is unsupported shows as a greyed row with its status;
    - it is excluded from stats;
    - it is listed under Excluded;
    - banner: "7 of 8 peers loaded; 1 failed (details)".
- **"All peers filtered out" state** (blueprint §6): shows the counts dropped at each filter, plus the add box.
- **Cell drawers:**
    - every peer cell opens the same provenance drawer as the target's;
    - stats cells open a small drawer listing the values used and those excluded, with reasons.
- **SIC wording:** the panel says "SIC matches" plus the tier (e.g. "3-digit group 358 — fewer than 5 exact matches"), never "the peers".
- **Mobile:** stacked regions; the table scrolls inside its own container with the Company column sticky; no page-level horizontal scroll.

### 6. Goldens, reconciliation and e2e

**GGG Q3 2026 LTM golden** (fixture already captured):

- 52/53-week fiscal year ending the last Friday of December.
- Values come from the **rendered 10-K and 10-Q statements**, cited.
- `docs/reconciliation/GGG.md`, every row "Awaiting Jiho".

**JCI fiscal Q3 2026 golden:**

- Capture the fixture: 10-Q `0000833444-26-000087`, period 2026-06-30, asof `2026Q3FY` (or your documented naming).
- September fiscal year-end, Irish-domiciled 10-K filer.
- EBITDA and EV/EBITDA must be **Unsupported** (no `OperatingIncomeLoss` since 2016, methodology §3); revenue LTM must work.
- `docs/reconciliation/JCI.md`.

**Comps golden** (fixture mode, offline):

- Target LII Q2 with peers CARR, AAON, TT, WSO and JCI from their fixtures.
- Documented test prices: LII 500, CARR 60, AAON 100, TT 400, WSO 450 (both classes), JCI 80.
- Assert every multiple, every stat (mean, median, high, low, p25, p75, n), and the NM and Unsupported exclusions.
- Write the arithmetic out in the golden file.
- These are test inputs, not market data.

**e2e** (fixture mode):

1. LII → peers load → paste prices → stats appear.
2. Remove a peer → stats update → restore it.
3. Add TT → it appears with reason "Added by you".
4. A forced peer failure is isolated.
5. Sort by EV/EBITDA keeps the target pinned.
6. The URL round-trips the whole state on reload.
7. axe on the full workbench: no serious or critical issues.

### 7. Live verification (after Jiho merges)

On production `/c/LII`:

- Report the cold load time for the default peers, and the warm time.
- Report the SEC requests per load from the runtime logs, and confirm there are no 403s.
- Enter real closing prices Jiho supplies, or skip this check.
- Confirm a shared URL reproduces the view.

Also report `/c/GGG`.

### 8. Stretch: implied valuation (methodology §13)

Target LTM metric × peer 25th percentile / median / 75th percentile multiple → implied EV → implied equity value → implied share price, for EV/EBITDA and EV/Revenue.

- Shown only when every input is valid.
- Has its own drawer with the math.
- Golden test at the comps-golden prices.

### 9. Stretch: LII Q3 2026

1. Capture the fixture: 10-Q `0001069202-26-000096`, asof `2026Q3`.
2. Write an LTM golden from the rendered filings.
3. Add a `docs/reconciliation/LII.md` "LTM through 2026-09-30" section, Awaiting Jiho.
4. Keep the Q2 goldens. The fixture loader picks one filing per ticker on purpose, from M4a.

## Out of scope

Excel export (M5); the in-app methodology page and the interview pack (M6); custom domains.

## Gate — M4 (blueprint §22)

- [ ] Peer index built by the workflow and merged via PR, with metadata *(met in M4a)*
- [ ] Every LII suggestion shows its reason; every exclusion shows its code
- [ ] NM matrix tested; per-metric n counts correct; percentiles match `PERCENTILE.INC`
- [ ] GGG and JCI golden tests pass; reconciliation docs written (Jiho confirms)
- [ ] One failing peer leaves the rest of the analysis intact (e2e)
- [ ] Peer loading stays within the documented SEC budget; live cold and warm timings reported
- [ ] typecheck, lint, test, e2e and build all pass; no secrets or emails in the repo or bundle

## Finishing

1. Run the full check.
2. Ask before pushing. Then push and open the PR "M4b: comps workbench".
3. CI green.
4. Run the code-review plugin.
5. Don't merge; Jiho merges.

Final report: the same 13 parts.

- **Part 6:** the comps golden table (multiples and stats), GGG and JCI LTM tables, and live timings.
- **Part 11:** exactly what Jiho should check.
