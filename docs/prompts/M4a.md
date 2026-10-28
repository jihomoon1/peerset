# PeerSet — Claude Code session M4a: cache fix, peer index and screening

M3 is complete: https://peerset.vercel.app is public, smoke is green, `main` at `8371e6c`, methodology 0.3.2.

M4 is split in two:

- **M4a (this session):** fix the page cache miss, build the peer index from SEC bulk data in GitHub Actions, and implement screening with reasons.
- **M4b (next):** the comps workbench — peer panel, comps table, per-peer prices, NM display, statistics, lag flags, GGG and JCI goldens, and the implied range if time allows.

Sources of truth: blueprint §10, §13, §14, §18; `docs/decisions/0003-sec-bulk-files.md`; `docs/methodology.md` §1, §3 and §14; `CLAUDE.md`; and the M3 report's "Notes for M4". If anything conflicts, stop and ask Jiho.

## Session setup

1. `git switch main && git pull`, then `git switch -c m4a-peer-index`.
2. This file is at `docs/prompts/M4a.md`. In `docs/prompts/README.md`, mark M3 done; M4 is now M4a plus M4b. Commit.
3. **Plan mode.** Read:
    - `CLAUDE.md`
    - blueprint §10
    - ADR 0003
    - `src/lib/fundamentals.ts`, `src/lib/cache.ts`, `src/app/c/[ticker]/page.tsx` and `src/app/api/fundamentals/`
4. Check current docs for:
    - `unstable_cache` in Next 16.4
    - the `yauzl` API
    - GitHub Actions `permissions` and creating pull requests with `GITHUB_TOKEN`
5. Name your tools and skills: `systematic-debugging` for step 1, TDD for screening, `verification-before-completion`, and the methodology-reviewer agent at the end.
6. Present the plan, then wait.

## Working mode

Steps 1–4 may run unattended in auto mode after approval. Step 5 needs Jiho present.

Decide routine choices yourself and record them. Stop only for `CLAUDE.md` stopping conditions.

**Ask first:**

- `git push`
- any `gh secret`, `gh variable` or repo-settings change
- `vercel` commands
- methodology changes
- dependencies beyond the one pre-approved below

**Pre-approved dependency:** `yauzl` (plus `@types/yauzl` in dev), for streaming specific entries out of SEC's zip files in Node. `CLAUDE.md` rules out Python, so this is the reader. Record it in `CLAUDE.md`'s approved list.

## Scope — in this order

### 1. Fix the page vs. API cache miss (`systematic-debugging`)

The M3 report found that `/api/fundamentals` hits the cache on its second call, but `/c/<ticker>` re-fetches all 8 SEC requests every time (3–6 s).

1. Find the root cause first. Likely candidates:
    - The page and the route build different cache keys.
    - The page calls the pipeline outside `unstable_cache`.
    - Page rendering is dynamic, so `fetch` options are ignored.
2. Write a failing test first if feasible. At minimum, add a log or metric that shows cache hits, and show it before and after the fix.
3. **Fix:** both page and API go through one cached `getFundamentals(cik)` with the same key (CIK + latest accession + methodology version, per blueprint §14). Submissions stay cached for 6 hours. The cached entry stays under 2 MB.
4. **Verify locally.** Two loads of `/c/LII`: the second makes zero SEC requests for fundamentals, at most the cached-submissions check. Report the timings.
5. Production verification happens after merge, in step 5.

### 2. Small M3 follow-ups

- **One saved filing per ticker in fixture mode.** The loader picks exactly one saved filing per ticker on purpose: the newest `asof`, or one given explicitly. It fails loudly on ambiguity. This must land before any second LII fixture exists.
- **Real HTTP status codes.** Unknown ticker → 404. Unsupported issuer → 422. Both the API and the page; for the page, use Next's `notFound()` or set the status. Update the e2e tests.
- **Tiny values.** A value that rounds to 0.0 in USD millions but isn't zero (AAON cash, $13,000) displays as `<0.1` with the exact value in the drawer and tooltip. Exact zero still shows `0.0`. Test both.

### 3. Peer-index builder (`scripts/build-peer-index.ts`)

Implements blueprint §10.1.

**Inputs** (URLs from ADR 0003):

- `company_tickers_exchange.json`
- `submissions.zip`
- `companyfacts.zip`

**Rules:**

- Three SEC requests per run, with the project User-Agent.
- Stream to disk. Fail clearly if `Last-Modified` or `Content-Type` look wrong.

**Universe:** CIKs with a ticker on NYSE, Nasdaq, NYSE American or Cboe. Drop OTC and blank exchanges.

**Per company, from `submissions.zip`** (read only the needed `CIK##########.json` entries with `yauzl`, not all ~995k):

- CIK, name, tickers and exchanges, primary ticker (SEC's first listed ticker)
- SIC and its description, fiscal year end, state or country of incorporation
- latest periodic form, filing date and accession
- `files20F` flag: latest periodic is 20-F or 40-F

**Screening revenue, from `companyfacts.zip`:**

- The latest full fiscal year's revenue, selected with the **same domain code** as the app: revenue priority list (methodology §3, 0.2.0 rule), latest-filed rule, USD only, a duration of 350–378 days, from a 10-K or 10-K/A.
- Store the value, period end, concept and accession.
- No qualifying fact → no screening revenue (screening excludes it, with a reason).

**Output: `data/peer-index.json`:**

- **Metadata:** `generatedAt`, each source's `Last-Modified`, `methodologyVersion`, counts (total, listed, with revenue, by exclusion reason).
- **Companies:** a compact array. Measure the size. If it's over about 1.5 MB, use a columnar or short-key format and document it.

**Tests (offline):**

- A tiny synthetic zip fixture under `tests/fixtures/peer-index/`: about 6 companies covering listed and OTC, 10-K and 20-F, missing revenue, a 52/53-week fiscal year, and a revenue concept switch.
- The builder's pure parts are tested without network.

**Determinism:** the same inputs produce byte-identical output.

### 4. Screening (`src/peers/screen.ts`) and `/api/peers`

Pure functions over the index plus the target. Implements blueprint §10.2 exactly:

1. **Tiers:**
    - Same 4-digit SIC.
    - If fewer than 5 are eligible, widen to the 3-digit SIC group, then the 2-digit major group.
    - Each peer's reason names its tier.
2. **Eligibility:**
    - Major exchange.
    - Latest periodic is 10-K or 10-Q.
    - Not SIC 6000–6799.
    - Latest periodic filed at most 200 days before the analysis date (injected, never read from the clock).
    - Has screening revenue in USD.
    - Not the target. One row per CIK.
3. **Size:** screening revenue between 0.2× and 5× the target's.
4. **Rank:** by |ln(peer ÷ target)|; ties broken by ticker A–Z.
5. **Select:** the top 8 by default; the caller may ask for 5–12.
6. **Reasons:**
    - Each selected peer gets a reason, e.g. "SIC 3585 exact · revenue 0.6× · Dec FYE · 10-Q filed 2026-07-29".
    - Each exclusion gets a code and a detail (blueprint §15 style).

**`PeerSelectionResult`** follows blueprint §11.

**`/api/peers?ticker=`:**

- Reads the committed index. No SEC calls.
- Validates the ticker.
- 404 for an unknown ticker; 422 for an unsupported target.

**Unit tests:** every rule, tier widening, ties, 5–12 bounds, and exclusion codes, on a synthetic index.

### 5. GitHub Actions workflow and first real index (Jiho present)

**`.github/workflows/refresh-peer-index.yml`:**

- **Triggers:** monthly (1st of the month, 06:17 UTC) and `workflow_dispatch`.
- **Permissions:** `contents: write`, `pull-requests: write`.
- **Job:**
    - `npm ci`
    - run the builder with `SEC_USER_AGENT` from a repo **secret**
    - if `data/peer-index.json` changed, open a PR "data: refresh peer index" whose body summarizes counts and added, removed and reclassified companies
- **Timeout:** 30 minutes.
- The job never prints the User-Agent.

**Jiho's steps (ask before each):**

1. **Add the secret.** Jiho runs `gh secret set SEC_USER_AGENT` herself in a separate terminal and pastes the value at the prompt.
2. **Allow Actions to open PRs.** Repo Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests". She clicks it, or you use `gh api` with her yes.
3. **Ship the code.** Push the branch, open the PR "M4a: cache fix, peer index, screening", wait for green CI, and run the code-review plugin. Jiho merges.
4. **Generate the first index.** Run the workflow by hand: `gh workflow run refresh-peer-index.yml`. Watch it, and report duration, download sizes and counts. Jiho reviews and merges its data PR.
5. **Production checks, after both merges:**
    - The cache fix: two loads of `/c/LII`; the second is fast, with no fundamentals SEC calls in the runtime logs.
    - `/api/peers?ticker=LII`: report the selected peers with reasons, the tier used, and the top exclusion codes. Expect Carrier, JCI and AAON among the SIC 3585 matches; Trane (3822) and Watsco (5070) won't be (blueprint §10.3).
    - `/api/peers` for GGG and AAON as well.

## Out of scope

Peer panel UI, comps table, per-peer prices, statistics, lag flags, the GGG and JCI LTM goldens, the implied range, and Excel. Those are M4b and M5.

## Gate — M4a

- [ ] Root cause of the page cache miss found and fixed; a second load makes no fundamentals SEC calls, locally and in production
- [ ] Fixture loader is unambiguous; 404/422 status codes; `<0.1` display, all tested
- [ ] Builder tested offline on the synthetic zip; deterministic output
- [ ] Workflow ran on GitHub; its index PR is merged; `data/peer-index.json` metadata and size reported
- [ ] Screening matches blueprint §10.2, unit-tested; `/api/peers` live for LII, GGG and AAON, with reasons and exclusions reported
- [ ] typecheck, lint, test, e2e and build all pass; no User-Agent or email in the repo

## Finishing

The final report has the same 13 parts.

- **Part 6:** cache timings before and after; the workflow run (duration, sizes, counts); LII's, GGG's and AAON's peer lists with reasons.
- **Part 13:** notes for M4b.

Stop at the gate.
