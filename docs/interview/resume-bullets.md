# Résumé bullets (draft: Jiho to rewrite in their own words)

Every number names where it was measured. Replace the local test counts with the CI run number after the v1.0.0 PR's CI passes.

- Built PeerSet, an open-source Next.js/TypeScript app that turns a U.S. ticker into trading comps from SEC XBRL filings, screening peers from an index of 8,023 SEC registrants (6,055 exchange-listed; `data/peer-index.json` meta, October 29, 2026).
- Verified every financial value against the rendered filings for 8 companies (`tests/golden/`), backed by 1,027 unit and integration tests and 43 browser tests (local run, November 1, 2026; CI run [#___]).
- Kept SEC usage light: a cached company load makes 2 SEC requests (production check, October 28, 2026; M3 report); a live LII analysis loaded in 2.40 s cold and 0.22 s warm, and 7 peers in 12.4 s cold and 1.4 s warm (production, October 30, 2026; M4b report).
