# FITB reconciliation — bank equity, TCE and ROTCE at September 30, 2026

Fifth Third Bancorp · CIK 0000035527 · SIC 6022 · kind **bank** (methodology 0.5.0 §13B: `Deposits` 239,486 at the balance-sheet date) · golden file `tests/golden/FITB-2026Q3-kind.json`

**Documents**

- **10-Q** for the quarter ended September 30, 2026, filed November 3, 2026, accession 0000035527-26-000243: [filing index](https://www.sec.gov/Archives/edgar/data/35527/000003552726000243/0000035527-26-000243-index.htm) · SEC's rendering of the balance sheet: [R2.htm](https://www.sec.gov/Archives/edgar/data/35527/000003552726000243/R2.htm)
- **10-K** for the year ended December 31, 2025, filed February 24, 2026, accession 0000035527-26-000124 (FY2025 net income to common)

Statement: "CONDENSED CONSOLIDATED BALANCE SHEETS (unaudited)", September 30, 2026 column, USD **millions** as shown. "PeerSet" is the engine's value from the frozen fixtures (as of 2026-11-10).

## Equity at 2026-09-30

| Line (as labeled) | Concept                                | Filing                              | PeerSet              | Rule                            | Status    |
| ----------------- | -------------------------------------- | ----------------------------------- | -------------------- | ------------------------------- | --------- |
| Total Equity      | `StockholdersEquity`                   | 33,296                              | 33,296               | §13D 1: parent equity line      | Confirmed |
| Preferred stock   | `PreferredStockValue`                  | 2,182                               | 2,182                | §13D 1: preferred inside equity | Confirmed |
| **Common equity** |                                        | 33,296 − 2,182 = **31,114**         | 31,114               | §13D 1                          | Confirmed |
| Goodwill          | `Goodwill`                             | 9,984                               | 9,984                | §13D 2: deducted                | Confirmed |
| Intangible assets | `IntangibleAssetsNetExcludingGoodwill` | 1,190                               | 1,190                | §13D 2: deducted                | Confirmed |
| Servicing rights  | `ServicingAssetAtAmortizedValue`       | 1,669                               | not deducted         | §13D 2: servicing stays in TCE  | Confirmed |
| **TCE**           |                                        | 31,114 − 9,984 − 1,190 = **19,940** | 19,940               | §13D 2                          | Confirmed |
| Total Assets      | `Assets`                               | 301,226                             | 301,226 (peer index) | §13E: bank size                 | Confirmed |

## LTM net income to common and ROTCE

`NetIncomeLossAvailableToCommonStockholdersBasic` from SEC's companyfacts (§2 bridge):

| Component          | Filing | Value                             |
| ------------------ | ------ | --------------------------------- |
| FY2025             | 10-K   | 2,376                             |
| + nine months 2026 | 10-Q   | 1,719                             |
| − nine months 2025 | 10-Q   | 1,677                             |
| **LTM**            |        | 2,376 + 1,719 − 1,677 = **2,418** |

ROTCE = 2,418 ÷ 19,940 = **0.1213 (12.1%)**; PeerSet 0.121264. EBITDA and EV are Unsupported (`NOT_FOR_BANKS`).

## Things to know before checking

- **Share count jumped in 2026.** Common shares outstanding went from 661,197,787 (December 31, 2025) to 907,366,824 (September 30, 2026), per the balance sheet's footnote 2. Ending TCE includes the acquired equity while LTM income includes only part of a year of it, so ROTCE on ending TCE (a disclosed §13D simplification) reads lower than a full-year figure would.
- The total-deposits line is the bank evidence; the debt and cash rules (§7–§8) are not used for banks.

## How to check (about 10 minutes)

1. Open R2.htm above and find each line in the first table; the numbers are in millions.
2. Redo the two subtractions and the ROTCE division.
3. For LTM, open the 10-Q's income statement and the 10-K's: "Net income available to common shareholders" for the nine months and the year.
