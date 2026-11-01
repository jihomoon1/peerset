# Four problems and what PeerSet does about them

## 1. SEC's companyfacts lagged the latest 10-Q

- **Problem.** companyfacts, SEC's one-call API of every XBRL fact, can trail a new filing. When the LII fixture was captured, it didn't yet contain Lennox's Q2 2026 10-Q (filed July 29, 2026), so an LTM built from it alone would have silently ended a quarter early.
- **Evidence.** [LII reconciliation](../reconciliation/LII.md), "Companyfacts gap"; `tests/integration/fundamentalsRoute.test.ts` asserts the LII Q2 freshness status `filing-parsed`.
- **Decision.** A freshness check (blueprint §8.3, `src/sec/freshness.ts`) compares the newest accession in companyfacts with the latest 10-K/10-Q in submissions. When companyfacts is behind, PeerSet parses that filing's own XBRL instance, merges its facts, and marks the values (`W_FILING_PARSED`, a dot in the UI).
- **Result.** LII's Q2 values came from the parsed filing and match the rendered statements. The Q3 fixture, captured after companyfacts caught up, reads `current`. Both paths are covered by goldens.

## 2. Debt tags double-counted some lines and missed others

- **Problem.** Fixed lists of debt tags gave wrong totals for four of six HVAC peers ([ADR 0006](../decisions/0006-balance-sheet-face.md)).
- **Evidence.** Carrier's `DebtCurrent` already includes its commercial paper, so adding the commercial-paper tag would count it twice, and its total tag leaves the commercial paper out. AAON tags its revolver `LineOfCredit`, which wasn't in the list. Graco's 30.0M bank loans and 0.7M unsecured debt weren't either. Watsco tags a "current portion of lease liabilities" line, mostly operating leases, with a debt concept ([methodology §7](../methodology.md)).
- **Decision.** Methodology 0.3.0: read the balance sheet the company presents (FilingSummary → rendered statement) to learn which lines are on the face, take each value from the XBRL instance, and sum the debt lines. A debt-looking line PeerSet can't classify makes debt Unsupported instead of guessed. Total tags are only a cross-check.
- **Result.** Debt goldens for LII, WSO, CARR, AAON, TT, GGG and LCID match the face lines to the dollar. Carrier at June 30, 2026: 1,638 + 10,314 = 11,952M from the face, against a total tag of 11,230M, with the warning `W_DEBT_TOTAL_TAG_DIFFERS` ([CARR balance golden](../../tests/golden/CARR-2026Q2-balance.json)).

## 3. No free price API allows public display

- **Problem.** Market cap needs a price, and showing prices (and multiples built from them) on a public site is redistribution.
- **Evidence.** Blueprint §9 compares seven providers' terms (Alpha Vantage, Twelve Data, Tiingo, Massive/Polygon, Finnhub, FMP, EODHD). None allows public display on its free tier, and Tiingo's terms treat a P/E built from its price as derived data.
- **Decision.** Launch with user-entered end-of-day prices: the user supplies the fact, so no vendor contract is involved. Ask Alpha Vantage, the only provider with a free route to permission, in writing.
- **Result.** On October 28, 2026, Alpha Vantage declined ("Unfortunately, we couldn't verify an ongoing educational collaboration with your school") and offered a 25% discount on a premium plan. Their reply didn't say a paid plan includes public display, and Jiho declined the offer. Production stays on user-entered prices ([licensing](../licensing.md)).

## 4. Johnson Controls' P/E was flattered by discontinued operations

- **Problem.** In FY2025, 1,570M of JCI's 3,291M net income came from discontinued operations, and 2.40 of its 5.03 diluted EPS. Total EPS gave an LTM of 5.69 and a P/E of 14.06x at the test price of 80, not comparable with peers.
- **Evidence.** [JCI reconciliation](../reconciliation/JCI.md), cited from the rendered 10-K and 10-Q income statements.
- **Decision.** Methodology 0.4.0: when any LTM component period reports discontinued operations, diluted EPS uses continuing-operations EPS with the same bridge, and D&A carries a caution because the cash-flow line may include them.
- **Result.** JCI: 2.63 + 3.12 − 2.20 = 3.55, P/E 22.54x, with an EPS cross-check warning (6.1% gap). The same rule moved Carrier (to 42.86x) and Trane (to 29.81x). The golden change is recorded as a definition change.
