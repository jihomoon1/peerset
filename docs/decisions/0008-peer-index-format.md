# 0008 — Peer index: universe, format and build choices

Date: October 28, 2026 · Status: recorded (M4a)

## Context

Blueprint §10.1 builds `data/peer-index.json` monthly from SEC bulk data, estimated at 1–1.5 MB for about 6,000 companies. M4a asks for a columnar or short-key format if plain JSON goes over about 1.5 MB.

## Decisions

1. **Format: columnar rows, one company per line** (`src/peers/indexFormat.ts`, format `peerset-peer-index/1`). The file has `meta`, `sicDescriptions` (SIC → description, stored once), `concepts` (revenue concept names, stored once and referred to by position), `fields`, `rows` and `unlisted`. Each row is `[cik, name, [[ticker, exchange], …], sic, fiscalYearEnd, incorporation, [form, filed, report, accession] | null, [value, periodEnd, conceptIndex, accession] | null, revenueNote | null]`. Why: a stand-in index built from SEC's real ticker list (6,060 listed companies) measured 1.52 MB even in this format, with an over-stated SIC table; plain objects with repeated keys would be about 40% larger. One row per line makes the monthly PR diff readable line by line. The primary ticker and the 20-F flag are derived when the file is read (first listing; latest form is 20-F/40-F), not stored twice.
2. **Universe.** SEC's `company_tickers_exchange.json` labels are `NYSE`, `Nasdaq`, `CBOE`, `OTC`, `TXSE` and blank. NYSE American has no label of its own (those companies are `NYSE`). Major exchanges are `NYSE`, `Nasdaq` and `CBOE`. `TXSE` (Texas Stock Exchange, 12 tickers on October 24, 2026) is not on the blueprint's list, so it is treated like OTC. Off-exchange tickers are kept in `unlisted`, so `/api/peers` can answer "not listed on a major exchange" (422) instead of "unknown ticker" (404).
3. **Primary ticker** is the first major-exchange ticker in SEC's ticker file order.
4. **Raw facts, not eligibility.** The index stores the latest report's form and dates; staleness (200 days) is judged at screening time against the analysis date. `meta.counts.byExclusionReason` applies the same rules on the data date, for information.
5. **Determinism.** `generatedAt` is the newest of the three sources' `Last-Modified`, not the clock, so the same SEC files give byte-identical output. SEC re-dates its bulk files nightly, so a monthly run always changes `meta` and opens a PR, even when no company row changed.
6. **Screening revenue** (methodology §13A) reuses `computeRevenue` on the latest fiscal year reported in a 10-K or 10-K/A (`src/domain/screeningRevenue.ts`): same priority list, latest-filed rule and 350–378-day check as the app. No fallback to an older year: if the latest year fails a check, the company has no screening revenue, with the reason in `revenueNote`.
7. **Bulk entries that fail SEC schema validation** are kept without that data and counted in `meta.counts.unreadable`, rather than failing the whole run.

## Revisit when

The file passes about 2 MB (Vercel bundles it into `/api/peers`), or SEC adds an exchange label.
