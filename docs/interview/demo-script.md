# Two-minute demo

Live site, desktop browser. Prices are **test inputs**, the same ones as the comps golden (`tests/golden/comps-LII-2026Q2.json`), not market data. Have the paste block ready:

```text
LII, 500
CARR, 60
AAON, 100
TT, 400
WSO, 450
WSO-B, 450
JCI, 80
```

| Time | Beat             | Do                                                      | Say                                                                                                                                                                                                                                                     |
| ---- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | 1. LII           | Home → type LII → Look up → Analyze LII                 | "One ticker in. PeerSet reads Lennox's latest 10-K and 10-Q straight from SEC. Every number on this page traces back to a filing."                                                                                                                      |
| 0:15 | 2. EBITDA drawer | Click LTM EBITDA                                        | "LTM is the fiscal year plus this year's nine months minus last year's nine months: the Q3 10-Q filed October 28. Operating income plus D&A from the cash-flow statement, with each piece's concept, period and accession. Standardized, no add-backs." |
| 0:35 | 3. Debt drawer   | Click Enterprise value → debt lines                     | "Debt is the lines Lennox actually shows on its balance sheet: commercial paper, current and long-term debt. Not SEC's total tags: Carrier's total tag leaves out its commercial paper, and other peers tag lines the old lists missed."                |
| 0:50 | 4. Peers         | Peer panel: read one reason; remove one; add TT and WSO | "Peers come from SEC industry codes and a 0.2x–5x revenue band. Each one says why it's here. I can remove one and add Trane and Watsco; statistics re-run."                                                                                             |
| 1:05 | 5. Prices        | Paste the block → Apply                                 | "Prices are end-of-day closes I enter. No free price API allows public display, so PeerSet doesn't pretend to have one. Medians and quartiles appear; a company whose LTM ends far from the others gets a lag flag."                                    |
| 1:25 | 6. Implied price | Scroll to Implied price per share                       | "Lennox's LTM EBITDA times the peer quartiles, minus debt plus cash, divided by shares: an implied price range."                                                                                                                                        |
| 1:40 | 7. Export        | Export to Excel → open → Sources sheet                  | "Same numbers in Excel, as live formulas, and a Sources sheet with every filing link. If it says NM or Unsupported on screen, it says the same in the workbook."                                                                                        |
| 2:00 | End              |                                                         |                                                                                                                                                                                                                                                         |

If something is slow: peers load three at a time from SEC (about 12 s cold for 7 peers, measured October 30, 2026). Keep talking through beat 2 while they load.
