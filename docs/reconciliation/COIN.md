# COIN reconciliation — digital assets and the crypto EBITDA caution at September 30, 2026

Coinbase Global, Inc. · CIK 0001679788 · SIC 6199 · kind **digital-asset company** (methodology 0.5.0 §13B: no bank deposits; `CryptoAssetFairValueNoncurrent` 2,224,811 at the balance-sheet date) · golden file `tests/golden/COIN-2026Q3-kind.json`

**Documents**

- **10-Q** for the quarter ended September 30, 2026, filed October 29, 2026, accession 0001679788-26-000122: [filing index](https://www.sec.gov/Archives/edgar/data/1679788/000167978826000122/0001679788-26-000122-index.htm) · SEC's rendering of the balance sheet: [R2.htm](https://www.sec.gov/Archives/edgar/data/1679788/000167978826000122/R2.htm)
- **10-K** for the year ended December 31, 2025, filed February 12, 2026, accession 0001679788-26-000015 (FY2025 crypto gain or loss)

Statement: "Consolidated Balance Sheets", September 30, 2026 column, USD **thousands** as shown. "PeerSet" is the engine's value from the frozen fixtures (as of 2026-11-10).

## Digital assets at 2026-09-30

| Line (as labeled)                 | Concept                                     | Filing        | Counted?          | Rule                                                        | Status    |
| --------------------------------- | ------------------------------------------- | ------------- | ----------------- | ----------------------------------------------------------- | --------- |
| Crypto assets held for operations | `coin:CryptoAssetFairValueOperations`       | 53,059        | No                | §13C 1: company concept, `W_DIGITAL_ASSET_LINE_NOT_COUNTED` | Confirmed |
| Crypto assets held as collateral  | `coin:CryptoAssetFairValueHeldAsCollateral` | 1,299,500     | No                | §13C 1: company concept, caution                            | Confirmed |
| Crypto assets borrowed            | `coin:CryptoAssetFairValueBorrowed`         | 389,657       | No                | §13C 1: company concept, caution                            | Confirmed |
| Crypto assets held for investment | `CryptoAssetFairValueNoncurrent`            | 2,224,811     | Yes               | §13C 1                                                      | Confirmed |
| **Digital assets**                |                                             | **2,224,811** | PeerSet 2,224,811 |                                                             | Confirmed |

## Crypto remeasurement in EBITDA (LTM)

`CryptoAssetRealizedAndUnrealizedGainLossOperating` from SEC's companyfacts (§2 bridge):

| Component          | Filing | Value                                       |
| ------------------ | ------ | ------------------------------------------- |
| FY2025             | 10-K   | (20,704)                                    |
| + nine months 2026 | 10-Q   | (40,764)                                    |
| − nine months 2025 | 10-Q   | 10,077                                      |
| **LTM**            |        | (20,704) + (40,764) − 10,077 = **(71,545)** |

PeerSet: (71,545), named by the caution `W_EBITDA_INCLUDES_CRYPTO_REMEASUREMENT` on EBITDA, EBITDA margin and EV/EBITDA. EBITDA itself is not adjusted (§4).

## Things to know before checking

- **Most of Coinbase's crypto is not counted.** The collateral and borrowed lines are matched by liabilities ("Obligation to return collateral" 1,311,240) and the operations line is working inventory; the tags don't say which coins Coinbase owns outright, so only the us-gaap investment line counts. Market cap ÷ digital assets is therefore high for Coinbase, which is right: it is an exchange, not a treasury company.
- Customer custodial funds (4,462,310) are cash held for customers and are not digital assets.

## How to check (about 10 minutes)

1. Open R2.htm and find the four crypto lines (thousands).
2. Check that only "held for investment" uses a us-gaap concept: hover the line in SEC's viewer, or see the concept column above.
3. For LTM, the crypto gain or loss line is in the 10-Q's and the 10-K's income statements.
