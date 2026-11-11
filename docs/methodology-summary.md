# PeerSet methodology: working summary

Full rules and the version number: `docs/methodology.md`. It wins wherever this summary is shorter or seems to disagree.

## Rules every task follows

1. Fact selection: for each concept and exact period, use the most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports it. Consolidated facts only, except share classes (§6).
2. Units: money in USD, per-share in USD/shares, share counts in shares. Anything else is Unsupported.
3. Full precision internally; round only in display and Excel formats.
4. Missing is never zero. Never estimate: if a rule can't be met, the value is Unsupported with a reason.
5. Every value has one status: Reported, Derived, NM, Missing ("—") or Unsupported.
6. Thresholds and concept lists live only in `src/domain/policy.ts` and methodology.md; changing either bumps the version in both.
7. LTM = FY(prior) + YTD(current) − YTD(prior year); after a 10-K, LTM = that fiscal year. Quarters are never summed; Q4 is never derived.
8. EBITDA = operating income + D&A, labeled "standardized, unadjusted"; no add-backs.
9. EV = market cap + total debt − cash and short-term investments. Debt and cash come from balance-sheet face lines; an unrecognized line makes the total Unsupported.
10. NM: denominator ≤ 0, EV ≤ 0, or a multiple above 100.0x. A missing input shows "—", never NM.
11. Issuer kinds (0.5.0): SIC outside 6000–6799 is an operating company. Inside it, bank deposits make a bank (valued on P/E, P/BV, P/TBV, ROTCE; no EV or EBITDA) and crypto fair value makes a digital-asset company (operating columns plus digital assets and market cap ÷ digital assets). Anything else is Unsupported. Peers are screened within the target's kind; banks are sized by total assets.

## Read this section of methodology.md before changing code in that area

| Area                                                     | Section |
| -------------------------------------------------------- | ------- |
| LTM periods and checks                                   | §2      |
| Revenue, operating income, D&A, net income, EPS concepts | §3      |
| EBITDA and D&A warnings                                  | §4      |
| Diluted EPS, P/E, splits, discontinued operations        | §5      |
| Shares, market cap, share classes                        | §6      |
| Debt (fallback in §7.F)                                  | §7      |
| Cash (fallback in §8.F)                                  | §8      |
| EV, preferred stock, NCI, temporary equity               | §9      |
| Multiples and NM order                                   | §10     |
| Summary statistics                                       | §11     |
| Dates, lag and stale-price flags                         | §12     |
| Implied valuation                                        | §13     |
| Peer screening                                           | §13A    |
| Issuer kinds (bank, digital-asset company)               | §13B    |
| Digital assets, mNAV, crypto EBITDA caution              | §13C    |
| Bank equity, TCE, P/BV, P/TBV, ROTCE                     | §13D    |
| Peer screening by kind, peer index format 2              | §13E    |
| Policy constants                                         | §14     |
| Change log                                               | §15     |
