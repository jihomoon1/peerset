# PeerSet — Claude Code session M1a: SEC adapter, freshness check and XBRL parser

M0 is merged (`main` at `38b09fd`). Methodology 0.2.0 is approved. This session builds the **data-acquisition layer**: everything that turns SEC responses into clean, typed, provenance-carrying facts. **No financial calculations yet** — LTM, EBITDA and the UI are M1b.

Sources of truth: `docs/methodology.md` (0.2.0), `docs/blueprint.md` §8, §11, §12, §14, §15, and `CLAUDE.md`. If this prompt conflicts with them, stop and ask Jiho.

## Session setup

1. Move this file into place on a new branch:
    - `git switch -c m1a-sec-adapter`
    - Move `~/Downloads/M1a.md` to `docs/prompts/M1a.md`.
    - In `docs/prompts/README.md`, mark M0 done and M1a in progress.
    - Commit: `docs: add M1a session prompt`.
2. Start in plan mode. Read `CLAUDE.md`, `docs/methodology.md`, and blueprint §8, §11, §12, §15. Check what tools, skills and plugins this session actually has, and say which you'll use. Expected: Superpowers `test-driven-development` for the parser and freshness logic, `systematic-debugging` for any failure, `verification-before-completion` at the end; Context7 or WebFetch for current Zod 4 and fast-xml-parser docs.
3. Present the plan and wait for Jiho's approval.

## Working mode

Jiho may let this run unattended in auto mode after approving the plan.

- Don't stop for routine choices: decide, and record the choice in the report.
- Stop only for `CLAUDE.md` stopping conditions, or anything in "Ask first" below.
- Work test-first for parsing and freshness logic. Write the test from the fixture or filing, watch it fail, then implement.
- Never call live SEC from tests. Live calls are allowed only from the dev script in step 8, at most 4 requests per second.

### Ask first

- `git push` and opening the PR.
- Any dependency beyond `zod` and `fast-xml-parser`.
- Changing anything in `docs/methodology.md` or the blueprint.
- Any `vercel` command.

## Dependencies

Add exactly these (both are pre-approved for M1 in `CLAUDE.md`), at their current stable versions:

- `zod`: v4; import as `import * as z from "zod"`.
- `fast-xml-parser`

Confirm current versions and APIs from their docs, not memory.

## Scope — build in this order

### 1. Domain types and policy (`src/domain/`)

- **`types.ts`:** the blueprint §11 types this layer needs: `Unit`, `FilingReference`, `ReportingPeriod`, `ReportedFinancialFact`, `CompanyIdentity`, `UnsupportedReason`. Add the rest only when used (M1b).
- **`policy.ts`:** `METHODOLOGY_VERSION = "0.2.0"`, plus every constant in methodology §14.
    - Concept lists:
        - The priority lists from methodology §3.
        - The debt and cash concepts from §7–§8 (0.2.0).
        - The EV-adjustment warning concepts from §9.
        - The cover-page concepts: `dei:EntityCommonStockSharesOutstanding`, `dei:DocumentPeriodEndDate`, `dei:DocumentFiscalYearFocus`, `dei:DocumentFiscalPeriodFocus`, `dei:CurrentFiscalYearEndDate`, `dei:TradingSymbol`, `dei:SecurityExchangeName`.
        - The finance-lease `…ExtensibleList` concepts.
        - Shares and EPS cross-check concepts: `WeightedAverageNumberOfDilutedSharesOutstanding`, and stock-split concepts such as `StockholdersEquityNoteStockSplitConversionRatio1`.
    - One exported `CONCEPT_WHITELIST`, the union of all the above. It is the only set of concepts the adapter keeps.
- **Unit test** that `policy.ts` matches methodology §14's values. Hardcode the expected numbers in the test, citing the section.

### 2. Errors (`src/lib/errors.ts`)

Error classes matching blueprint §15:

- `TICKER_NOT_FOUND`
- `UNSUPPORTED_ISSUER`
- `SEC_UNAVAILABLE`
- `SEC_RATE_LIMITED`
- `SEC_SCHEMA_CHANGED`
- `INTERNAL`

Each has a code, a user-safe message, and internal detail. Never include the User-Agent value.

### 3. SEC client (`src/sec/client.ts`)

- **Inputs:** `fetch` is injected, defaulting to global `fetch`, so tests can mock it. Reads `SEC_USER_AGENT` from `process.env` and fails with a clear error if it's missing.
- **Headers:** `User-Agent` and `Accept-Encoding: gzip, deflate` on every request.
- **Hosts:** only `www.sec.gov` and `data.sec.gov`; reject anything else.
- **Pacing:** at most 4 requests per second and 3 in flight, per instance (one module-level limiter).
- **Limits:** 10 s timeout; 15 MB response cap.
- **Retries:** at most 2, on 5xx or timeout only, with jittered backoff (about 0.5 s, then 1.5 s). Never retry 403 or 404.
- **403 classification:**
    - A body or title containing "Request Rate Threshold Exceeded" → `SEC_RATE_LIMITED`.
    - "Undeclared Automated Tool" → `SEC_UNAVAILABLE`, with detail "User-Agent rejected".
    - Anything else → `SEC_UNAVAILABLE`.
- **404** → a typed not-found result the caller can turn into `TICKER_NOT_FOUND` or a filing-missing state.
- **Logging:** one structured log line per request — host, path, status, ms, bytes, retries. Never headers.
- **Tests (mocked fetch):** headers sent; host allow-list; pacing (fake timers); retry on 503, then success; no retry on 403 or 404; both 403 classifications; timeout; size cap; the UA never appears in errors or logs.

### 4. Zod schemas (`src/sec/schemas.ts`)

Schemas for:

- `company_tickers_exchange.json`
- submissions
- companyfacts
- the filing `index.json`

Validate only the fields we use, so new fields don't break us. A schema failure throws `SEC_SCHEMA_CHANGED` with the path, never a guessed value. Tests run every schema against the committed LII and WSO fixtures.

### 5. Tickers and identity

#### Tickers (`src/sec/tickers.ts`)

- Load `company_tickers_exchange.json`.
- Capture it once into `tests/fixtures/sec/_shared/company_tickers_exchange.json.gz` with a manifest. Extend `scripts/capture-fixture.ts` or add a small sibling script.
- Uppercase the input and match exactly.
- Return all rows for a CIK (multi-class companies have several; WSO has `WSO` and `WSO-B`).

#### Submissions (`src/sec/submissions.ts`)

- **`CompanyIdentity`:** CIK (10-digit), name, tickers and exchanges, SIC and description, `fiscalYearEnd`, state or country of incorporation, and `latestPeriodic` — the newest 10-K/10-K/A/10-Q/10-Q/A **by report date, then filing date**, with accession, form, dates, primary document and index URL.
- **Support check:** `support: supported | {unsupported, reason}`, applying blueprint §3:
    - Last periodic filing is 20-F or 40-F.
    - SIC 6000–6799.
    - Latest periodic filing older than 200 days relative to an **injected `asOf` date** (`domain/` and `sec/` never read the clock).
    - A 10-KT or 10-QT as the latest periodic.
- **Tests:**
    - LII: latest periodic `0001069202-26-000087`, 10-Q, filed 2026-07-29, period 2026-06-30, SIC 3585.
    - WSO: `0001193125-26-340204`, SIC 5070, tickers `WSO` and `WSO-B`.
    - Synthetic cases for each unsupported reason.

### 6. companyfacts trimming (`src/sec/companyFacts.ts`)

- **Input:** companyfacts JSON. **Output:** `ReportedFinancialFact[]` with `source: "companyfacts"`, kept only when:
    - the concept is in `CONCEPT_WHITELIST`;
    - the form is periodic (10-K, 10-K/A, 10-Q, 10-Q/A) — WSO's companyfacts includes 424B7 prospectus facts that must be dropped;
    - the unit is `USD`, `USD/shares` or `shares`.
- **Periods:** duration facts carry `start`; instant facts don't.
- **Accessions:** also return the set of periodic accessions present, for the freshness check.
- **Size:** the trimmed output for LII should be well under 200 KB serialized. Report the actual size.
- **Tests:**
    - LII's newest periodic accession in companyfacts is `0001069202-26-000054`.
    - WSO's includes `0001193125-26-340204`.
    - No 424B7 facts survive.
    - No non-whitelisted concepts survive.

### 7. Filing XBRL parser (`src/sec/filingInstance.ts`)

- **Locate the instance:** find it in the filing's `index.json`. It's the `*_htm.xml` extracted from the inline-XBRL filing. If none is found, return a typed "no instance" result.
- **Parse with `fast-xml-parser`, namespace-aware:**
    - Resolve prefixes through the document's `xmlns` declarations.
    - Never match on literal prefix strings. LII's and WSO's instances both write `<context>` with no prefix; other filers use `xbrli:`.
    - Match concepts by namespace URI family plus local name: `us-gaap` and `dei` for any year.
- **Extract:**
    - Contexts: entity, period (instant or start/end), explicit dimension members. Typed dimensions are skipped.
    - Units: `iso4217:USD`, `shares`, `USD/shares` via divide.
    - Facts for whitelisted concepts only, with value, `decimals`, unit and context.
- **Values:**
    - Accept decimal-formatted numbers (e.g. `209000000.0`) and negatives.
    - Skip `xsi:nil="true"`.
    - Keep full precision; no rounding.
    - Collapse duplicate facts (same concept, context and unit) when values agree. When they disagree, keep neither and record a parse warning.
- **Output:** `ReportedFinancialFact[]` with `source: "filing"` and the filing reference. Dimensional facts are kept with their `dimensions` map (needed for share classes); everything else has `dimensions: {}`.
- **Golden tests (LII Q2 instance):** expected values must come from the 10-Q's **rendered statements** (balance sheet and income statement in the filing document), not from reading the same XML. Cite page or statement in a test comment.
    - Planning observed these consolidated values at 2026-06-30 in the instance; your filing-derived values should match. If they don't, stop and report:
        - `CommercialPaper` 412.0M
        - `LongTermDebtAndCapitalLeaseObligationsCurrent` 20.1M
        - `LongTermDebtAndCapitalLeaseObligations` 1,149.2M
        - `DebtAndCapitalLeaseObligations` 1,581.3M
        - `FinanceLeaseLiabilityCurrent` 20.1M
        - `FinanceLeaseLiabilityNoncurrent` 54.6M
        - `CashAndCashEquivalentsAtCarryingValue` 51.5M
        - `ShortTermInvestments` 0.6M
    - Also assert `Revenues` and `OperatingIncomeLoss` for both YTD periods in the 10-Q (2026-01-01..2026-06-30 and 2025-01-01..2025-06-30), from the income statement.
- **Golden test (WSO Q2):** `dei:EntityCommonStockSharesOutstanding` on `us-gaap:StatementClassOfStockAxis` = `CommonStockMember` 35,588,756 and `CommonClassBMember` 5,663,438, as of 2026-08-04. Verify against the 10-Q cover page.
- **Synthetic unit tests:** `xbrli:`-prefixed contexts; decimal-formatted values; nil facts; duplicate-fact disagreement; a typed dimension being skipped; a non-whitelisted concept being ignored.

### 8. Freshness and merge (`src/sec/freshness.ts`)

`getCompanyFacts(cik, { asOf })`:

1. Fetch submissions, then companyfacts.
2. If `latestPeriodic.accession` is in companyfacts' periodic accessions → status `current`.
3. Otherwise → fetch the filing index and instance, parse it, and merge → status `filing-parsed`.
4. **Always** parse the latest filing's instance for cover-page share classes. When status is `current`, this is the only extra fetch (index plus instance = 2 requests).
5. Merge: return all facts, both sources, each tagged with its source and accession. Do **not** apply the latest-filed selection rule here — that's M1b's `factSelection.ts`, a pure domain function.
6. Return `{ identity, facts, freshness: { status, latestAccession, companyfactsNewestAccession }, warnings, requestsMade }`. Add `W_FILING_PARSED` when status is `filing-parsed`.
7. Request budget: at most 5 SEC requests per company here (submissions, companyfacts, index, instance, plus one spare).

**Tests (fixtures, mocked client):**

- LII → `filing-parsed`, companyfacts newest `…-26-000054`, latest `…-26-000087`, and the merged facts include the instance's 2026-06-30 debt values.
- WSO → `current`, with share classes still present from the instance.

**Dev script `scripts/sec-facts.ts`:** `npx tsx scripts/sec-facts.ts --ticker LII` runs the real pipeline against live SEC (reading `SEC_USER_AGENT` from `.env.local` as `capture-fixture.ts` does). It prints:

- identity;
- the freshness result;
- request count;
- a compact table of whitelisted facts for the latest two periods: concept, period, value in USD millions, source, accession.

This is how Jiho sees what the adapter does. Run it once for LII and once for GGG, and quote both outputs in the report. GGG's Q3 10-Q was filed 2026-10-21; note whether companyfacts includes it.

## Out of scope

Fact selection, LTM, EBITDA, debt or cash calculations, API routes, UI, caching (`unstable_cache` comes with the route in M1b), peers, prices, Excel, Vercel. Notes for later go under "Notes for M1b".

## Acceptance gate — M1a

- [ ] `zod` and `fast-xml-parser` added; no other new dependencies
- [ ] Client tests cover headers, host allow-list, pacing, retries, 403/404 handling and timeout; the UA never appears in logs or errors
- [ ] Schemas validate the LII and WSO fixtures
- [ ] Submissions: LII and WSO identities and latest periodic filings correct; every unsupported reason tested
- [ ] companyfacts trimming drops non-periodic forms and non-whitelisted concepts; trimmed size reported
- [ ] Parser: LII Q2 golden values match the filing's statements; WSO class shares match the cover page; namespace-aware; synthetic edge cases pass
- [ ] Freshness: LII → `filing-parsed`, WSO → `current`, both with share classes
- [ ] `scripts/sec-facts.ts` run live for LII and GGG, outputs in the report
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` pass
- [ ] Repo-wide search finds no User-Agent value or email address outside placeholders

## Finishing

1. Run the full check and quote the result.
2. Ask Jiho before pushing. Push `m1a-sec-adapter` and open a PR, "M1a: SEC adapter, freshness check, XBRL parser".
3. Confirm CI is green with `gh pr checks`.
4. Run the code-review plugin on the PR, and fix or explain each finding.
5. Do not merge; Jiho merges.

## Final report (same 13 parts as M0)

1. What was implemented
2. Each gate item: met or not met
3. Files materially changed
4. New dependencies and why
5. Commands run, with exact outcomes
6. Data results: LII and GGG live outputs, freshness statuses, trimmed sizes, the parser's golden values next to the filing values
7. What's uncertain
8. Known limitations
9. Commits, branch, PR link
10. Live link: none this milestone
11. What Jiho should inspect
12. A one- or two-sentence lesson on the central decision
13. Notes for M1b

## Stop

Stop at the gate. Do not start M1b.
