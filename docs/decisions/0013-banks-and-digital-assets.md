# 0013 — Banks and digital-asset companies (M7)

Date: November 10, 2026 · Status: approved by Jiho in M7 planning

## Context

v1 rejected every company with SIC 6000–6799 ("Financial company; trading comps by EV/EBITDA don't apply"). Jiho asked for banks and, above all, digital-asset companies. Live SEC data checked on November 10, 2026:

- SIC does not separate crypto businesses from lenders. Coinbase, Strategy, MARA, Riot, CleanSpark, Circle and SoFi are all SIC 6199; Robinhood and Galaxy are 6211.
- With the SIC block lifted, the existing engine already computes Coinbase's EV, EBITDA and P/E. Strategy's LTM operating income is (19,337.4)M because ASU 2023-08 puts bitcoin fair-value changes in operating income, so its EV/EBITDA says nothing; market cap ÷ digital assets is what analysts use.
- Banks fail almost everywhere on the operating route: "Cash and due from banks", Federal Home Loan Bank advances and repos are unrecognized lines, and `OperatingIncomeLoss` is not tagged. Equity, goodwill, intangibles, deposits and `NetIncomeLossAvailableToCommonStockholdersBasic` are tagged consistently.

## Decisions

1. **Kind from the filing, not a hand-made list** (methodology §13B). Inside SIC 6000–6799 a company is a bank when it reports us-gaap bank deposits, a digital-asset company when it reports us-gaap crypto fair value, otherwise Unsupported. A curated ticker list was rejected: it needs upkeep and can't screen peers.
2. **Digital-asset companies keep the operating route** plus digital assets, market cap ÷ digital assets and three cautions (§13C). EBITDA is never adjusted for crypto remeasurement; the caution names the tagged amount. Only us-gaap crypto lines count; company lines are shown, not counted, so holdings can be understated (MARA's 1,603.2M receivable).
3. **Banks get an equity route** (§13D): P/E, P/BV, P/TBV, ROTCE on ending TCE. EV is Unsupported for banks. NIM, efficiency ratio, CET1 and dividend yield are left for later.
4. **Peers by kind** (§13E): the peer index gains a kind and total assets; banks are sized by total assets.
5. **Columns follow the target's kind** in the comps table and the workbook, so operating-company tables and goldens are unchanged.

## Consequences

- JPMorgan's TCE is Unsupported (its goodwill, MSRs and intangibles share one company-concept line); its P/BV and P/E still work.
- Galaxy uses only company crypto concepts on its face; it is a digital-asset company only if a us-gaap crypto fair-value fact appears at the date, and its digital assets are Missing.
- The peer index format moves to `peerset-peer-index/2`: each row gains `kind` and `totalAssets` ([value, accession], banks only, at the latest report date). Format 1 still reads, with financial-SIC companies left without a kind, so the committed index keeps working for operating companies until the next rebuild; bank and digital-asset targets then say the index must be rebuilt.
- Robinhood (SIC 6211) is a digital-asset company by this rule, but its face has no us-gaap crypto line, so its digital assets are Missing (live check, November 11, 2026).
- Goldens: Fifth Third (bank) and Coinbase (digital-asset company), 10-Qs for September 30, 2026 (`tests/golden/FITB-2026Q3-kind.json`, `COIN-2026Q3-kind.json`, `docs/reconciliation/FITB.md`, `COIN.md`).

## Revisit when

Insurers or REITs are requested, or the 2026+ us-gaap taxonomy adds bank-specific concepts PeerSet should read.
