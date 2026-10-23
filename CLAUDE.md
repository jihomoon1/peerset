# PeerSet — working rules for Claude Code

PeerSet is a public, non-commercial, open-source web app that turns a U.S. ticker into first-pass trading comps built from SEC filings. Every number must trace to its filing, period and XBRL concept.

- Source of truth for product and engineering: `docs/blueprint.md`.
- Source of truth for financial definitions: `docs/methodology.md` (imported below).
- If a request conflicts with either, stop and ask Jiho.
- Jiho is a finance student and a beginner programmer: explain important choices in one or two plain sentences.

@docs/methodology.md

## Architecture map (blueprint §12)

One Next.js app. `domain/` is pure finance logic with no I/O; adapters do I/O; UI only displays.

```text
src/app/        Next.js routes: home, c/[ticker], methodology, api/{fundamentals,peers,quotes,export}
src/domain/     pure, isomorphic, fully unit-tested: types, policy, factSelection, ltm, metrics/,
                capitalization, debt, cash, enterpriseValue, multiples, nm, stats, comps
src/sec/        SEC adapter: client (User-Agent, pacing, retries, errors), submissions,
                companyFacts, filingInstance, freshness, schemas
src/prices/     quote adapter: provider, userEntered, alphaVantage
src/peers/      peer-index loader and screening
src/export/     workbook, styles, sanitize
src/ui/         CompsTable, ProvenanceDrawer, PeerPanel, AsOfStrip, ...
src/lib/        errors, log, format, cache
data/           peer-index.json (generated monthly)
scripts/        capture-fixture.ts, build-peer-index.ts
tests/          unit/, fixtures/sec/<ticker>/<as-of>/, golden/, integration/, workbook/, e2e/
docs/           blueprint, methodology, licensing, decisions/, reconciliation/, interview/
```

Rules: `domain/` never touches network, clock or environment; tests feed it facts and dates. The browser never calls SEC. Outbound requests only to `www.sec.gov`, `data.sec.gov`, `www.alphavantage.co`.

## Financial invariants (never break these)

1. **Missing is never zero.** A missing input makes dependents Missing or Unsupported. Never `?? 0`, never `|| 0` on a financial value.
2. **Full units internally.** Dollars and shares, unrounded. Convert to millions or round only in `lib/format.ts` and the workbook writer.
3. **One snapshot, two outputs.** The web table and the Excel workbook render the same computed snapshot. The export route recomputes server-side; it never trusts numbers from the browser.
4. **Latest-filed rule.** For each (concept, start, end), use the most recently filed 10-K/10-K/A/10-Q/10-Q/A reporting exactly that period. Consolidated facts only, except share classes.
5. **Golden values are never edited to make tests pass.** A golden value changes only with a reconciliation note in `docs/reconciliation/` and a commit message saying whether it was a new filing, a definition change or a bug.
6. **Never estimate.** If a rule can't be satisfied, the value is Unsupported with a reason.
7. **Methodology changes** bump the version in `docs/methodology.md` and `policy.ts` together.

## Approved dependencies

Runtime: `next`, `react`, `react-dom`. Dev: `typescript`, `@types/*`, `eslint`, `eslint-config-next`, `tailwindcss`, `@tailwindcss/turbopack`, `vitest`, `prettier`, `tsx` (runs TypeScript scripts).

Planned for later milestones (add only in that milestone): `zod` (M1), `fast-xml-parser` (M1), `exceljs` (M5), `@playwright/test` and `@axe-core/playwright` (M3+).

Anything else needs a written justification and Jiho's OK. No Python, Redis, Postgres, Docker or queues.

## Commands

```bash
npm run dev         # local server at http://localhost:3000
npm run typecheck   # next typegen + tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # production build
npm run format      # prettier --write .
npx tsx scripts/capture-fixture.ts --ticker LII --cik 0001069202 --accession <acc> --asof 2026Q2
```

Before saying work is done: `npm run typecheck && npm run lint && npm test && npm run build`, and quote the result.

## Conventions

- TypeScript strict. Dates as ISO strings (`YYYY-MM-DD`). CIKs as 10-digit zero-padded strings.
- Commits: `type: summary` with types feat, fix, test, docs, chore, ci, data. Small and descriptive.
- Work happens on a branch per milestone (e.g. `m1-ltm-financials`). **Never commit on `main`.** Jiho squash-merges PRs.
- Tests: CI never calls live SEC; tests read frozen fixtures under `tests/fixtures/sec/`.
- SEC requests always send the project User-Agent and `Accept-Encoding: gzip, deflate`; at most 4 requests/second per instance; never retry a 403 or 404.
- Decisions go in `docs/decisions/NNNN-title.md`.

## Secrets

- `SEC_USER_AGENT` (contains the contact email) lives only in `.env.local` and Vercel/GitHub settings. Never commit it, log it, print it, or write it into fixtures or manifests.
- Do not read `.env`, `.env.local` or other `.env*` files except `.env.example`.

## Stopping conditions

Stop and ask Jiho when:

- a request conflicts with the blueprint or methodology;
- a financial value would need to be guessed, estimated or defaulted;
- a golden test fails and the fix would be to change the expected value;
- SEC returns a 403, or any rate-limit sign appears;
- a new dependency, global setting, plugin or MCP server seems needed;
- the milestone's gate is reached: report, don't start the next milestone.

## Deploy and publish safeguards

Always ask Jiho first before: `git push`, creating or changing a GitHub repo or its settings, merging a PR, any `vercel` command that links, deploys or changes env vars, and any change to global Claude settings. Never `vercel deploy --prod` unless Jiho explicitly asks in that milestone. Never `npm install -g` or `sudo`.
