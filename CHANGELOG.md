# Changelog

PeerSet was built in milestones, one pull request each. Before 1.0.0 the app version in `package.json` stayed at 0.x and no releases were tagged, so earlier entries are listed by milestone and merge date. Methodology versions are in [`docs/methodology.md`](docs/methodology.md) §15.

## 1.0.0 (M6: hardening, interview pack, v1 release)

- Methodology 0.4.0: P/E uses continuing-operations diluted EPS when an LTM period reports discontinued operations (JCI 14.06x → 22.54x at its test price); D&A carries a caution in that case; the implied price is Unsupported when implied equity is not positive.
- Methodology 0.4.1: a reverse split already reflected in the last 10-K is no longer treated as a split since the 10-K (found with Lucid).
- New goldens: LII through September 30, 2026 (Q3 10-Q) and Lucid (LCID) as the negative-EBITDA case: EV/EBITDA and P/E NM.
- `/methodology` page rendered from `docs/methodology.md`, linked from every comps-table header.
- Every blueprint §6 UX state built and tested end to end: identity card before analysis, loading lines that name the filing, unsupported 20-F filers, rate limits, and shared links whose ticker has moved or been delisted.
- Accessibility checks (axe) on the new states; mobile layout checked at 375 px.
- Interview pack in `docs/interview/`; Alpha Vantage's decline recorded in `docs/licensing.md`.

## M5: Excel export (November 1, 2026, #18)

- Three-sheet workbook (Trading Comps, Calculations, Sources & Methodology) with live formulas that carry their cached values, recomputed server-side from the same snapshot as the screen; LibreOffice recalculation in CI.

## Methodology 0.3.5 and GGG/JCI spot-check (October 31, 2026, #15, #16)

- Written rules for when the implied price is Unsupported; Jiho's spot-check of the GGG and JCI reconciliations.

## M4b: comps workbench (October 30, 2026, #14)

- Comps table with peers, summary statistics (mean, median, quartiles, high, low, n), lag flags, peer add/remove, pasted prices, implied valuation and shareable URLs.

## M4a: peer index and screening (October 29, 2026, #9, #11, #12)

- Monthly peer index from SEC bulk data; peers screened by SIC tier and a 0.2x–5x revenue band, each with a reason; cache fix.

## M3: public deployment (October 27, 2026, #7)

- Live on Vercel with a home page, end-to-end tests on frozen fixtures and a scheduled smoke test.

## M2b: shares, prices, EV and multiples (October 26–27, 2026, #5, #6)

- Cover-page shares by class, user-entered prices, market cap, enterprise value, EV/Revenue, EV/EBITDA and P/E with the NM policy.

## M2a: debt and cash from the balance sheet (October 26, 2026, #4)

- Debt and cash read from the balance sheet's face lines (methodology 0.3.0), with tag rules as a labeled fallback.

## M1b: LTM financials (October 26, 2026, #3)

- LTM revenue, operating income, D&A, EBITDA, net income and diluted EPS for LII, reconciled to the filings.

## M1a: SEC adapter (October 25, 2026, #2)

- SEC client with User-Agent, pacing and retries; freshness check; XBRL instance parser.

## M0: setup and feasibility (October 24, 2026, #1)

- Project setup, CI and SEC feasibility checks.
