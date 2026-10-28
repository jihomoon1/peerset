# PeerSet — Product & Engineering Blueprint

Oct 23, 2026 · @jiho

PeerSet v1 is a public, non-commercial, open-source trading-comps app on Vercel Hobby, built in seven milestones that put a correct LII analysis on a live URL before peers and Excel export.

## Decisions locked

These came from your Phase A answers (all defaults) plus your GitHub and Vercel details.

| Decision | Choice |
| --- | --- |
| Price data | Ask Alpha Vantage for written open-source/educational approval; the public site uses user-entered prices until it arrives |
| Repo | Public `jihomoon1/peerset` on GitHub, MIT license |
| Hosting | Your existing Vercel account, Hobby plan, region `iad1` (Washington DC) |
| Audience | Public URL; personal and non-commercial; no ads, payments or club branding |
| SEC contact | A dedicated project email, stored in the `SEC_USER_AGENT` environment variable |
| Issuer scope | 10-K/10-Q filers reporting in USD; no SIC 6000–6799 (banks, insurers, REITs, funds); multi-class only when every class is listed |
| Peer screen | Revenue 0.2–5x the target, ranked by closeness; market cap shown after finalists are priced |
| Excel | 3 sheets; blue hardcoded inputs; derived metrics as live formulas with cached values |
| Pace | About 5–6 hours a week; correct LII plus a live URL first |
| Control | Plan mode at the start of each milestone; Claude edits and tests on branches; you approve merges to main and every deploy |
| LII stock pitch | Built with FactSet; PeerSet runs in parallel and is not on the pitch's critical path |

Your Mac, checked 2026-10-23: Node v24.15.0 and git 2.39.5 are ready. Claude Code is 2.1.126, older than the 2.1.273 needed for plugins to sync from claude.ai \[doc\], so updating it is step one of M0. The GitHub CLI `gh` is not installed yet. Still open: whether you have desktop Excel (check whether GW's Microsoft 365 license includes it).

Tags used throughout: **\[doc\]** official source read 2026-10-22 · **\[obs\]** SEC data we downloaded and checked · **\[conv\]** banking convention · **\[call\]** my recommendation. M0–M6 are the milestones in section 21.

## 1. Executive product definition

PeerSet turns a U.S. ticker into a first-pass trading-comps analysis built from SEC filings, where every number links to the filing, period and XBRL concept it came from.

Promise: *from ticker to defensible public trading comps, with transparent methodology and traceable source data.*

What makes it more than a comps table:

- **Per-cell provenance.** Click any figure to see formula, inputs, concept, period, accession number and a link to the filing.
- **Filing-freshness check.** PeerSet confirms it is using the latest 10-K or 10-Q, and parses the filing itself when SEC's convenience API lags (it does: section 8).
- **Honest statuses.** Every value is Reported, Derived, NM, Missing or Unsupported. Missing is never zero.
- **One snapshot, two outputs.** The web table and the Excel workbook render the same computed object, so they cannot disagree.

Positioning, shown on screen: *Automated first-pass comps from SEC filings. Unadjusted. Not a substitute for analyst review.*

## 2. Target users and use cases

The primary user is a student or junior analyst building first-pass comps; the second is the interviewer judging your work.

| User | Need | What PeerSet gives them |
| --- | --- | --- |
| Student / junior analyst | A starting peer set and LTM multiples fast | Ticker to comps table in under a minute, editable peers, Excel to keep working in |
| Recruiter or banker interviewer | Evidence you understand the work | Provenance drawer, EV bridge, methodology page, honest limitations |
| You | A project you can defend line by line | Golden fixtures you verified by hand, documented decisions |

Use cases v1 must serve:

1. Build a quick comps set for a pitch idea and see where the target trades against peers.
2. Answer "where did this number come from?" for any cell in two clicks.
3. Remove, add and restore peers and watch the statistics update.
4. Export to Excel and continue the analysis manually.
5. Learn the method: LTM construction, EBITDA proxy, EV bridge, NM rules.

Not served: bankers needing adjusted EBITDA or diluted share counts, and investors wanting recommendations.

## 3. Refined v1 scope

v1 is the ticker-to-Excel workflow for supported issuers, done correctly, plus one stretch feature.

| Feature | v1 | Notes |
| --- | --- | --- |
| Ticker resolution to CIK, name, exchange, SIC, fiscal year-end | Yes | Unsupported tickers are refused, never remapped |
| LTM revenue, operating income, D&A, EBITDA, margin, net income, diluted EPS | Yes | Section 7 rules |
| Filing-freshness check + filing XBRL parser | Yes | Required by the companyfacts gap |
| Shares by class from the cover page | Yes | Market cap only when every class is priced |
| Debt and cash bridge, enterprise value | Yes | Inclusive-total hierarchy; operating leases excluded |
| Prices: user-entered; Alpha Vantage adapter behind a flag | Yes | Alpha Vantage goes public only after written approval |
| Peer suggestions (SIC + revenue screen) with reasons | Yes | Manual add, remove, restore |
| Excluded-companies list with reasons | Yes |  |
| Comps table, NM rules, stats with per-metric n | Yes | Target shown, excluded from stats |
| As-of strip and per-company "financials through" | Yes | Lag flag |
| Provenance drawer per cell | Yes | Signature feature |
| 3-sheet Excel workbook | Yes | Section 17 |
| Methodology page | Yes | Readable by a recruiter |
| Implied valuation range (25th–75th percentile) | Stretch | Ships in v1 only if M4 gates pass early; else v1.1 |

Support matrix v1:

| Supported | Unsupported (clear message, no number) |
| --- | --- |
| 10-K / 10-Q filers, including foreign-domiciled ones such as Trane and JCI | 20-F / 40-F filers and ADRs |
| USD monetary facts | Non-USD reporting |
| Non-financial SIC codes | SIC 6000–6799 |
| Single class, or several classes that are all listed | An unlisted share class |
| Fiscal years of 52/53 weeks, any month-end | Transition-period reports (10-KT, 10-QT) |
| Latest periodic filing within 200 days | Stale or delinquent filers |

## 4. Explicit out-of-scope decisions

Each exclusion protects correctness or keeps the app maintainable by one student.

| Out of v1 | Why |
| --- | --- |
| Adjusted EBITDA and invented add-backs | Requires judgment PeerSet cannot verify |
| Diluted shares via treasury stock method | Needs options/RSU footnotes; planned for v1.1 |
| Preferred, NCI and equity-investment EV adjustments | Disclosed and warned instead; v1.1 |
| Saved peer sets, accounts, login | Need a database; no v1 need |
| Historical multiples, charts over time | Need licensed price history |
| Football-field chart | v1.1, after the implied range proves out |
| AI recommendations, chatbot, natural-language analysis | Undermine trust in the numbers |
| Real-time or 15-minute-delayed quotes | Exchange licensing; EOD only |
| Trading, portfolios, brokerage or bank connections | Not this product |
| Microservices, Python, Redis, Postgres, Docker, queues | A modular Next.js app is enough (section 13) |

## 5. End-to-end user journey

A user goes from ticker to downloaded workbook in about ten steps, and the system says what it is doing at each one.

1. **Home.** A search box, three example tickers (LII, GGG, WSO), one line on what PeerSet is.
2. **Search.** Autocomplete from a static ticker list (ticker, name, exchange). An unknown ticker says "No SEC-registered company uses XYZ". An unsupported one names the reason (e.g. "files 20-F").
3. **Analyze target.** The page `/c/LII` resolves identity and checks the support matrix. It then finds the latest 10-K/10-Q, reads companyfacts, runs the freshness check and parses the filing if needed. A progress line narrates it: "Reading 10-Q filed Jul 29, 2026".
4. **Target panel.** The operating block renders. The valuation block asks for a price: "Enter LII's closing price and its date". With Alpha Vantage approved, it fills itself.
5. **Peers.** Suggestions and exclusions arrive from the peer index. Peer fundamentals load three at a time, and rows fill in as they finish.
6. **Prices.** One price input per row plus one shared as-of date. Pasting a two-column block (ticker, price) is supported. Market cap, EV and multiples recompute instantly in the browser using the same domain code as the server.
7. **Inspect.** Click any cell to open the provenance drawer: LTM bridge, EBITDA build, EV bridge, sources.
8. **Edit peers.** Remove, restore, or add a ticker. An added ticker runs the same pipeline and shows its own status.
9. **Export.** The server recomputes from cached fundamentals plus the submitted peers and prices, then streams `PeerSet_LII_comps_2026-10-23.xlsx`.
10. **Learn.** The methodology page and "?" links on column headers explain each definition.

## 6. Screen and interaction specification

The main screen is a dense, desktop-first workbench: as-of strip, target summary, then the comps table with the peer panel beside it.

### Layout regions (desktop, 1280 px and wider)

| Region | Position | Contents | Behavior |
| --- | --- | --- | --- |
| Header | Top, 56 px, sticky | Wordmark, ticker search, current company, Export button | Export disabled until at least one valid row exists |
| As-of strip | Under header, sticky | Prices as of · financials LTM through · shares as of · data pulled at | Each item opens its explanation |
| Target summary | Full width | Identity line (name, ticker, CIK, SIC, FYE, exchange); Operating block; Valuation block | "View calculations" opens the drawer on EBITDA |
| Peer panel | Left rail, 320 px, collapsible | Suggested peers with reasons, add box, removed list, excluded list, count | Changes re-run stats only |
| Comps table | Main area | Target row, peer rows, stats rows | Sort, click cells, enter prices |
| Provenance drawer | Right overlay, 440 px | Formula, inputs, concept, period, accession, filing link, status, warnings | Modal dialog; Esc closes |
| Footer | Bottom | Disclaimer, data attributions, GitHub link, app and methodology versions |  |

### Comps table

Columns, in order: Company · Ticker · Fin. through · Price · Market cap · EV · LTM revenue · LTM EBITDA · EBITDA margin · EV/Revenue · EV/EBITDA · P/E. Money columns are in USD millions, labeled in the header.

- **Numbers:** right-aligned, tabular figures. Millions to one decimal with thousands separators. Multiples one decimal plus "x". Percentages one decimal. Negatives in parentheses.
- **Target row:** pinned at top through any sort, accent left border, "Target" tag. Excluded from stats by default.
- **Stats rows:** Mean, Median, High, Low, n — below a rule, never sorted. n is counted per column.
- **Sticky:** header row and the Company column.
- **Long names:** truncated with an ellipsis; full name on hover and in the drawer.
- **Cell states:** value · "NM" in secondary color with a tooltip saying why · "—" unavailable · "Unsupported" with an icon. A small dot marks values parsed from the filing because companyfacts was behind.
- **Sorting:** header buttons with `aria-sort`; stable sort; the target and stats rows stay put.

### Visual system

- One accent (a deep ink blue) for the target, focus rings and primary buttons. Amber only for warnings, red only for errors. Status is never carried by color alone.
- Inter with tabular numerals, 13 px table text, 32 px rows, subtle row separators, no zebra striping on screen.
- No gradients, shadows or hero sections. It should read like a banking workbook, not a startup homepage.

### UX states

| State | What the user sees |
| --- | --- |
| No ticker yet | Search box, examples, one-line explanation |
| Invalid ticker | Inline: "No SEC-registered company uses XYZ" |
| Valid, not analyzed | Company identity card with "Analyze" |
| Loading | Skeleton rows plus a progress line naming the filing being read |
| Target unsupported | Reason in one sentence (e.g. "Reports in EUR"), and what PeerSet would need |
| SEC data incomplete | Values shown where valid; the missing metric shows "—" with the reason; dependent multiples withheld |
| Price missing | Price input highlighted; valuation cells say "Needs price" |
| A peer invalid | Row shown greyed with its status; excluded from stats; listed under Excluded |
| Metric is NM | "NM" plus a tooltip, e.g. "EBITDA ≤ 0" |
| All peers filtered out | "No peers passed the screen", the counts dropped at each filter, and the add-ticker box |
| Export with missing values | Allowed; workbook shows NM and "—" exactly as on screen; a note lists what is missing |
| SEC or price provider rate-limited | "SEC is limiting requests; try again in about 10 minutes"; cached data still shown with its date |
| Partial dataset usable | Banner: "7 of 8 peers loaded; 1 failed (details)" |
| Ticker changed or delisted | "LII now maps to a different company" or "no longer listed"; never silently remapped |

### Accessibility

- A real `<table>` with `<th scope>`, captions and column definitions linked from headers.
- Every control reachable by keyboard; visible focus rings; drawer is a dialog with focus trap and Esc.
- WCAG AA contrast; warnings written in words, not only color; `aria-busy` while loading.
- Checked automatically with axe in Playwright (section 16).

### Mobile fallback

Below 768 px, regions stack. The table scrolls sideways inside its own container with the Company column sticky; the page itself never scrolls sideways.

## 7. Financial methodology and formula specification

Every metric follows one fact-selection rule and one LTM rule. When a rule cannot be satisfied, the metric is Unsupported with a reason — never estimated.

### 7.1 Core rules

1. **Fact selection \[call\].** For each (concept, period start, period end), use the value from the most recently filed 10-K, 10-K/A, 10-Q or 10-Q/A that reports exactly that period. Only consolidated facts (no dimensions) count, except share classes (7.6). This one rule handles duplicates, restatements, amendments and split-restated comparatives.
2. **Units.** Monetary facts must be in `USD`, EPS in `USD/shares`, share counts in `shares`. Anything else is Unsupported.
3. **Precision.** Full units internally (dollars, shares). Rounding happens only in display formatting and Excel number formats. SEC's `decimals` attribute is kept in provenance. JavaScript numbers are exact enough at this scale, so no decimal library \[call\].
4. **Missing is never zero.** A missing input makes every dependent value Missing or Unsupported.
5. **One policy file.** Thresholds and concept priority lists live in `policy.ts` and in `docs/methodology.md`, under a methodology version number.

### 7.2 LTM construction

LTM ends at the period end of the latest 10-K or 10-Q. After a 10-K, LTM is that fiscal year. After a 10-Q:

```latex
\text{LTM} = \text{FY}_{\text{prior}} + \text{YTD}_{\text{current}} - \text{YTD}_{\text{prior year}}
```

The formula is used only if all checks pass; otherwise the metric is Unsupported ("cannot reconstruct LTM"):

- Fiscal-year duration is 350–378 days, which covers 52/53-week years.
- Current YTD starts the day after the fiscal year ends (±7 days).
- Prior-year YTD lasts within 7 days of the current YTD, and starts about one year earlier (±10 days).
- All three components use the same concept; revenue tags are never mixed across components.
- Prior-year YTD is taken as restated in the latest filing (this falls out of rule 1).

Q4 is never derived in v1, because LTM does not need it. A 53-week year inside the window adds the warning "LTM covers 53 weeks". Non-December year-ends need no special case: periods are dates, not calendar labels. SEC "frames" are never used for calculations \[obs: frames file JCI's September fiscal year and Modine's March fiscal year under CY2025\].

### 7.3 Metric definitions

| Metric | Formula | XBRL concepts, in priority order | Rules |
| --- | --- | --- | --- |
| Revenue | LTM | `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` → `RevenueFromContractWithCustomerIncludingAssessedTax` → `SalesRevenueNet` | If two concepts report the same period with different values, use `Revenues` when it is the larger (it is the total element), warn, and show both. Confirm against fixtures in M1 |
| Operating income | LTM | `OperatingIncomeLoss` | No fallback in v1; if absent, EBITDA is Unsupported |
| D&A | LTM | `DepreciationDepletionAndAmortization` → `DepreciationAndAmortization` → `DepreciationAmortizationAndAccretionNet` → `Depreciation` + `AmortizationOfIntangibleAssets` (both, same periods) | Always warns "from cash-flow statement" |
| EBITDA | Operating income + D&A | Derived | Both inputs share the same periods |
| EBITDA margin | EBITDA ÷ revenue | Derived | Shown even when negative |
| Net income | LTM | `NetIncomeLoss` | Attributable to the parent |
| Diluted EPS | LTM | `EarningsPerShareDiluted` | See 7.5 |

Tag choices differ even among close peers \[obs\]: LII tags revenue as `Revenues` while most peers use `RevenueFromContractWithCustomerExcludingAssessedTax`, and LII's D&A is `DepreciationAndAmortization`.

### 7.4 EBITDA (standardized, unadjusted)

```latex
\text{EBITDA}_{\text{LTM}} = \text{Operating income}_{\text{LTM}} + \text{D\&A}_{\text{LTM}}
```

- Labeled "EBITDA (standardized, unadjusted)" everywhere; never "Adjusted EBITDA".
- No add-backs: no restructuring, stock compensation or acquisition costs.
- D&A comes from the cash-flow statement and may include items that are not in operating expenses. Example: finance-lease right-of-use amortization, which LII tags separately (19.3M USD in FY2025) \[obs\]. Golden fixtures check each company's D&A against the filing text.
- Operating income and D&A are shown separately in the drawer.

### 7.5 Diluted EPS and P/E

- LTM diluted EPS = FY + current YTD − prior-year YTD, from reported EPS facts \[conv\]. Quarters are never summed.
- Cross-check against LTM net income ÷ fiscal-year weighted-average diluted shares. A gap above 5% adds a warning, not a suppression.
- A stock split since the last 10-K makes P/E Unsupported ("split since last 10-K"). Detection: split-ratio facts, or the 10-Q's restated prior-YTD EPS differing from the originally filed value by a split-like ratio.
- P/E = price ÷ LTM diluted EPS, single-class companies only. Multi-class P/E is Unsupported in v1.

### 7.6 Shares and market capitalization

- Source: `dei:EntityCommonStockSharesOutstanding` from the latest 10-K/10-Q cover page, parsed from the filing so class detail survives. companyfacts drops it \[obs\].
- The cover date is recorded; it is usually weeks after the balance-sheet date.
- Several classes are summed only when every class has its own listed ticker and price. Example \[obs\]: Watsco reports 35,588,756 Common and 5,663,438 Class B shares as of 2026-08-04, both NYSE-listed.
- An unlisted class (e.g. super-voting B shares) is Unsupported in v1.
- Shares are basic, not diluted by the treasury stock method. Bankers usually use diluted shares \[conv\]; this is a disclosed v1 limitation.

```latex
\text{Market cap} = \sum_{c \in \text{classes}} P_c \times S_c
```

### 7.7 Debt

Prefer inclusive totals, add a component only when it is provably not already inside, and verify the sums.

1. **Total tags** at the balance-sheet date: `DebtAndCapitalLeaseObligations`, `DebtLongtermAndShorttermCombinedAmount`.
2. **Components.** Short-term: `ShortTermBorrowings`, `CommercialPaper`, `DebtCurrent`. Current long-term: `LongTermDebtAndCapitalLeaseObligationsCurrent` or `LongTermDebtCurrent`. Long-term: `LongTermDebtAndCapitalLeaseObligations` or `LongTermDebtNoncurrent`.
3. **Finance leases** (`FinanceLeaseLiabilityCurrent`, `FinanceLeaseLiabilityNoncurrent`) are added only when the debt tags used are not "…AndCapitalLeaseObligations" tags, and the filing's `FinanceLeaseLiability…StatementOfFinancialPositionExtensibleList` facts (which name the balance-sheet line holding the lease) do not point into a debt line.
4. **Reconcile.** When a total and a component sum both exist, they must agree within 0.1M USD; otherwise use the total and warn.
5. **Exclude** operating lease liabilities.

LII on 2026-03-31 shows why \[obs\]:

| Tag | USD m | Note |
| --- | --- | --- |
| `LongTermDebtAndCapitalLeaseObligationsCurrent` | 18.2 | Equals the current finance lease |
| `LongTermDebtAndCapitalLeaseObligations` | 1,144.1 | Includes the 50.1 noncurrent finance lease |
| `CommercialPaper` | 361.0 |  |
| Sum | 1,523.3 | Ties to `DebtAndCapitalLeaseObligations` |

The naive "debt + finance leases" formula adds 68.3 twice and reports 1,591.6.

### 7.8 Cash

- Cash = `CashAndCashEquivalentsAtCarryingValue` plus short-term investments (`ShortTermInvestments`, `MarketableSecuritiesCurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent`) when present and not already included.
- Restricted cash is excluded. If only `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents` exists, it is used with the warning "includes restricted cash".

### 7.9 Enterprise value

```latex
\text{EV} = \text{Market cap} + \text{Total debt} - \text{Cash and short-term investments}
```

v1 leaves out preferred stock, noncontrolling interests and equity-method investments. It warns "material item not in EV" when `PreferredStockValue` is above zero, or noncontrolling interest (`MinorityInterest`, `RedeemableNoncontrollingInterestEquityCarryingAmount`) exceeds 5% of market cap. Balance-sheet items are as of the LTM end date, prices as of the price date, shares as of the cover date; all three are shown.

### 7.10 Multiples and the NM policy

```latex
\text{EV/Revenue} = \frac{\text{EV}}{\text{Revenue}_{\text{LTM}}} \qquad \text{EV/EBITDA} = \frac{\text{EV}}{\text{EBITDA}_{\text{LTM}}} \qquad \text{P/E} = \frac{P}{\text{EPS}_{\text{LTM}}}
```

| Condition | Result |
| --- | --- |
| Revenue ≤ 0 | EV/Revenue is NM |
| EBITDA ≤ 0 | EV/EBITDA is NM; the negative margin is still shown |
| EPS ≤ 0 | P/E is NM |
| EV ≤ 0 | EV multiples withheld: "EV ≤ 0" |
| Any multiple above 100.0x | NM: "above 100x policy" (multiples only, never percentages) |
| An input is missing | "—" (unavailable), never NM |
| The method cannot apply | "Unsupported", with the reason |

### 7.11 Summary statistics

- Computed over peers only; the target is excluded by default.
- Per metric: mean, median, high, low, n valid, n excluded. NM, "—" and Unsupported never enter a statistic.
- Median of an even count = average of the middle two. Percentiles use linear interpolation, inclusive — the same as Excel's `PERCENTILE.INC`, so web and workbook match.

### 7.12 Dates and comparability

- The as-of strip shows the price date and source, the LTM end and filing date, the share cover date, and when data was pulled.
- A company is flagged as lagging when its LTM end is more than 75 days from the peer-set median LTM end.
- USD only in v1, so currencies are never mixed.
- Prices are end-of-day closes and are never called real-time.

### 7.13 Implied valuation (stretch)

Target LTM metric × peer 25th, median and 75th percentile multiple gives implied EV. Subtract debt and add cash for implied equity value, then divide by shares for an implied price. It is shown only when every target input is valid.

## 8. SEC data sourcing and normalization

The submissions API decides what the latest filing is. companyfacts is trusted only when it actually contains that filing; otherwise PeerSet parses the filing itself.

### 8.1 Endpoints

| Source | Path | Used for | Size \[obs\] | Cache |
| --- | --- | --- | --- | --- |
| Ticker and exchange list | `www.sec.gov/files/company_tickers_exchange.json` | Ticker to CIK and exchange | \~0.5 MB, 10,425 rows | Refreshed monthly with the peer index; runtime fallback 24 h |
| Submissions | `data.sec.gov/submissions/CIK##########.json` | SIC, fiscal year-end, filings list (accession, form, dates, primary document) | \~164 KB | 6 h |
| Companyfacts | `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` | History of standard-taxonomy facts | LII: 4.3 MB | Trimmed result, 24 h |
| Filing index and XBRL instance | `www.sec.gov/Archives/edgar/data/{cik}/{accession}/…_htm.xml` | Latest filing when companyfacts is behind; share classes always | Watsco Q2: 1.06 MB | 30 days (filings never change) |
| Bulk submissions | `submissions.zip`, rebuilt nightly around 3 a.m. ET \[doc\] | Peer-index build only | 1.57 GB | Monthly GitHub Action |

data.sec.gov paths use the CIK zero-padded to 10 digits. Archive paths use the unpadded CIK and the accession number without dashes. The bulk-file URL is confirmed in M0.

### 8.2 Fair access

- **Identify.** Every request sends `User-Agent: PeerSet (Jiho Moon) <project email>` and `Accept-Encoding: gzip, deflate` \[doc\]. A missing User-Agent gets a 403 "Undeclared Automated Tool" page \[obs\].
- **Limit.** 10 requests per second in total, however many machines \[doc\]. Above that, the IP is limited until the rate stays under the threshold for 10 minutes \[doc\]. A community report says the response is a 403 "Request Rate Threshold Exceeded", not a 429 \[unverified\].
- **PeerSet policy \[call\].**
  - Per-instance limiter: at most 4 requests per second and 3 in flight.
  - Per-analysis budget: 40 SEC requests; at most 12 peers.
  - Never retry a 403 or 404. On a 5xx or timeout, at most 2 retries with jittered backoff (about 0.5 s, then 1.5 s).
  - 10 s timeout; 15 MB response cap.
- **Server-side only.** SEC documents no CORS support for data.sec.gov (we did observe an `access-control-allow-origin: *` header \[obs\]), and browsers cannot set User-Agent. The browser never calls SEC.
- **Vercel is untested.** M0 calls SEC from a Vercel preview deployment before anything else is built.

### 8.3 Freshness reconciliation (the companyfacts gap)

On 2026-10-22, LII's companyfacts — both the live API and the bulk zip — ended with the 10-Q filed 2026-04-29 (accession 0001069202-26-000054). The 10-Q filed 2026-07-29 (accession 0001069202-26-000087) was missing \[obs\]. Carrier, JCI and Coca-Cola showed the same gap: 4 of 24 companies sampled. SEC describes these APIs as updated in real time \[doc\], so this is a reliability problem, not a schedule.

1. From submissions, take the latest 10-K or 10-Q (including amendments) by report date, and its accession.
2. Collect the accessions present in companyfacts.
3. If the latest accession is absent, fetch that filing's index, locate the XBRL instance, parse it, and merge its facts with source `filing`.
4. Always parse the latest filing's cover page for share classes, even when companyfacts is current.
5. Store the source and accession on every fact; the UI marks filing-parsed values with a dot.

Cost: about two extra requests per company, only when companyfacts is behind (plus the cover-page parse).

### 8.4 The bounded XBRL parser

- **Input:** the XBRL instance EDGAR extracts from each inline-XBRL filing.
- **Reads:** contexts (entity, period, explicit dimension members), units, and facts for a whitelist of about 30 concepts — section 7's lists, the cover-page facts, and the finance-lease line references.
- **Ignores:** company extension concepts, footnotes, typed dimensions, text blocks.
- **Output:** the same fact shape companyfacts produces, so selection code never cares where a fact came from.
- **Library:** `fast-xml-parser` — small, no native dependencies; version confirmed in M1.
- **Tests:** parse the saved Watsco and LII Q2 instances; assert class members and values.

### 8.5 Normalization pipeline

1. Raw JSON or XML is validated with Zod schemas at the boundary.
2. It becomes a list of reported facts: concept, value, unit, period start and end, accession, form, fiscal period, filed date, dimensions, source.
3. Each metric selects facts by its priority list, rule 1 and the period checks.
4. The result is a normalized metric carrying its status, value, warnings and the exact facts used.
5. Calculations consume only normalized metrics.

### 8.6 Edge cases

| Issue | Handling |
| --- | --- |
| Same fact in several filings | Rule 1: latest-filed value for the identical period |
| Amendments | Treated as filings; a Part-III-only 10-K/A carries no financial facts, so nothing changes |
| Restatements | Latest-filed wins; the drawer notes "restated in 10-Q filed …" when values differ |
| Year-to-date vs quarterly facts | Selected by exact start and end dates; only YTD and full-year durations used |
| Instant vs duration | Balance-sheet items are instants at the LTM end; flows are durations |
| Units and scale | Values arrive in full units; `decimals` is precision only |
| Similar concepts | Ordered priority lists; concepts never summed across one another |
| Company extension tags | Ignored; can cause Missing or Unsupported, always explained |
| Non-December fiscal years | Period math on dates; no calendar assumptions |
| 52/53-week years | 350–378 day window; a warning for 53-week windows |
| Late filers | Over 200 days since the latest periodic report is Unsupported; a lag flag below that |
| Foreign issuers | 20-F and 40-F filers Unsupported; foreign-domiciled 10-K filers are fine |
| Fiscal-year change | 10-KT, 10-QT or failed period checks are Unsupported |
| companyfacts missing filings | Section 8.3 |
| Frames | Never used for calculations |

## 9. Quote-provider comparison and recommendation

No free price API permits display on a public website. Alpha Vantage is the only one with a free route to written permission, so it is the primary candidate; user-entered prices are the launch path until approval arrives.

| Provider | Free tier | Public display on the free tier | Cheapest clear display license |
| --- | --- | --- | --- |
| [Alpha Vantage](https://www.alphavantage.co/support/) | 25 requests/day; EOD daily series; "unlimited API requests for verified open-source or educational projects" | Personal, non-commercial use unless agreed in writing | Written permission, likely free via that program |
| [Twelve Data](https://twelvedata.com/terms) | 8/min, 800/day; batch requests | No: internal, non-display use only | Venture, 149 USD/month (display only); external distribution needs Enterprise, 1,099 USD/month |
| [Tiingo](https://app.tiingo.com/tos/) | 50/hour, 1,000/day; no storage beyond the session | No: internal consumption only | Redistribution, 250 USD/month (startup pricing) |
| [Massive (formerly Polygon)](https://massive.com/legal/market-data-terms-of-service) | 5/min, EOD, 2 years of history | No apps for end users other than you | Business, 2,499 USD/month |
| [Finnhub](https://finnhub.io/terms-of-service) | 60/min; real-time quote endpoint | No: personal use; no redistribution without written approval | Commercial license, price unpublished |
| [FMP](https://site.financialmodelingprep.com/terms-of-service) | 250/day | No: "showcasing" banned even when free | Enterprise plus a display agreement, price unpublished |
| [EODHD](https://eodhd.com/financial-apis/terms-conditions) | 20/day | No: personal use only | Custom plans from 399 USD/month |

Two findings shape the design \[doc\]:

- **Hiding the price does not help.** Tiingo's terms name a P/E built from its price and SEC EPS as derived data, since the price can be backed out. The same logic covers EV multiples.
- **Real-time and 15-minute-delayed quotes bring exchange licensing.** PeerSet uses end-of-day closes only.

Recommendation:

1. **Launch with user-entered prices.** The user supplies the fact, so no vendor contract is involved. No pre-filled "suggested" price from an API.
2. **Email Alpha Vantage in M0.** Describe a free, open-source, non-commercial student portfolio app showing EOD closes for at most 13 tickers per analysis, with attribution. Ask explicitly for public display, Excel export and caching up to one trading day. File the reply in `docs/licensing.md`.
3. **After written approval,** switch production to `TIME_SERIES_DAILY` (compact): the last row's close and date, one call per ticker per trading day, cached until the next close.
4. **Local development** may use your own free key; that is personal use.
5. **If a paid feed is ever justified:** Twelve Data Venture (display) or Tiingo Redistribution (display and download).

The adapter keeps this swappable: a `QuoteProvider` interface returns quote snapshots; implementations are `userEntered` and `alphaVantage`; `PRICE_PROVIDER=user` in production until approval is on file. Caveat: provider terms are a contract binding you personally, and "non-commercial" ends with ads, paid features or running the site for an organization. This is not legal advice.

## 10. Peer universe and screening

A monthly GitHub Action builds a static peer index from SEC bulk data. Each analysis screens that index by SIC and revenue scale without a single price call, then prices only the finalists.

### 10.1 Index build

1. Download `company_tickers_exchange.json`, `submissions.zip` (1.57 GB) and `companyfacts.zip` (1.41 GB): three SEC requests a month \[obs sizes\].
2. Keep companies listed on NYSE, Nasdaq, NYSE American or Cboe; drop OTC. SEC labels NYSE American listings "NYSE"; TXSE (Texas Stock Exchange) and blank exchanges are dropped too (methodology §13A, decision 0008).
3. Record per company: CIK, name, tickers and exchanges, SIC and description, fiscal year-end, incorporation, latest periodic form with filing date and accession, and whether its latest report is a 20-F/40-F.
4. Compute **screening revenue**: latest fiscal-year revenue from a 10-K or 10-K/A, using the same TypeScript selection code as the app, with no fallback to an earlier year, and only if that year ends within 15 months of the latest report (methodology §13A). It is labeled "screening revenue (latest FY)" and never shown as LTM.
5. Write `data/peer-index.json` with generation time, source dates, methodology version and counts. Size is estimated at 1–1.5 MB for \~6,000 companies; measured in M4.
6. Open a pull request, "data: refresh peer index", summarizing added, removed and reclassified companies. Merging it redeploys the site.

GitHub disables scheduled workflows on public repos after 60 days without activity \[doc\]; merging the monthly PR keeps it alive. Manual runs are always available.

### 10.2 Screening algorithm

| Step | Rule |
| --- | --- |
| 1. Candidates | Same 4-digit SIC as the target. Fewer than 5 companies passing steps 2 and 3: widen to the 3-digit group, then the 2-digit major group (which may return fewer than 5). Each peer's reason names its tier |
| 2. Eligibility | Major exchange; latest periodic form is 10-K or 10-Q; not SIC 6000–6799; latest periodic filing at most 200 days old; screening revenue in USD; not the target; one row per company (primary listed class) |
| 3. Size | Screening revenue between 0.2x and 5x the target's, inclusive. The target itself must pass step 2 and have positive screening revenue, or screening is Unsupported |
| 4. Rank | Closest scale first: absolute value of ln(peer revenue ÷ target revenue); ties by ticker, A–Z (plain character order) |
| 5. Select | Top 8 by default; the user can keep 5–12 |
| 6. Explain | Each peer gets a reason, e.g. "SIC 3585 exact · revenue 0.6x · Dec FYE · 10-Q filed 2026-07-29"; each exclusion gets a reason code |

Selected peers then run the full fundamentals pipeline; any that fail stay visible with their status, outside the statistics. Market cap appears after prices are entered, and the 0.2–5x market-cap range becomes an optional second filter.

### 10.3 What SIC misses

LII's SIC 3585 finds Carrier, AAON and JCI, but Trane is 3822, Watsco 5070, Modine 3714 and Graco 3561 \[obs\]. So the UI says "SIC matches", never "the peers", and the add-ticker box sits at the top of the peer panel. Better similarity signals are post-v1 (section 24).

## 11. Typed domain model

Every financial value is a tagged union that cannot be read as a number without first checking its status, so a missing value can never become zero by accident.

```ts
// Every financial value carries a status. Only 'reported' and 'derived' are usable numbers.
type Metric =
  | { status: 'reported' | 'derived'; value: number; unit: Unit; period: ReportingPeriod;
      formula: string; inputs: Provenance[]; warnings: MetricWarning[] }
  | { status: 'nm'; value: number; reason: NmReason; inputs: Provenance[]; warnings: MetricWarning[] }
  | { status: 'missing'; reason: string; warnings: MetricWarning[] }
  | { status: 'unsupported'; reason: UnsupportedReason; warnings: MetricWarning[] };

type Unit = 'USD' | 'USD/shares' | 'shares' | 'ratio' | 'multiple';

interface FilingReference {
  accession: string;            // '0001069202-26-000087'
  form: '10-K' | '10-K/A' | '10-Q' | '10-Q/A';
  filedDate: string;            // ISO date
  reportDate: string;           // period end
  indexUrl: string;             // filing index on sec.gov
}

interface ReportingPeriod {
  kind: 'duration' | 'instant';
  start?: string;               // required when kind = 'duration'
  end: string;
  label?: string;               // 'FY2025', '6M FY2026'
}

interface ReportedFinancialFact {
  concept: string;              // 'us-gaap:Revenues'
  value: number;                // full units, never rounded
  unit: 'USD' | 'USD/shares' | 'shares';
  period: ReportingPeriod;
  decimals?: number;            // precision as filed
  dimensions: Record<string, string>;  // {} = consolidated
  filing: FilingReference;
  source: 'companyfacts' | 'filing';
}

type Provenance = ReportedFinancialFact | { metric: string; value: number };

interface MetricWarning { code: WarningCode; message: string; severity: 'info' | 'caution' }

interface LTMCalculation {
  method: 'annual' | 'fy_plus_ytd_minus_prior_ytd';
  ltmEnd: string;
  fy: ReportedFinancialFact;
  ytdCurrent?: ReportedFinancialFact;  // present for the 10-Q method
  ytdPrior?: ReportedFinancialFact;
  checks: { name: string; passed: boolean; detail?: string }[];
}

interface CompanyIdentity {
  cik: string;                  // 10-digit, zero-padded
  ticker: string; name: string; exchange: string;
  sic: string; sicDescription: string;
  fiscalYearEnd: string;        // 'MMDD' from submissions; shifts for 52/53-week filers
  latestPeriodic: FilingReference;
  support: { supported: true } | { supported: false; reason: UnsupportedReason };
}

interface QuoteSnapshot {
  symbol: string; close: number; currency: 'USD';
  asOfDate: string;             // trading date of the close
  source: 'user_entered' | 'alpha_vantage';
  retrievedAt: string;
}

interface ShareClassCapitalization {
  classMember: string;          // 'us-gaap:CommonClassBMember', or 'single'
  ticker?: string;              // absent = unlisted class
  shares: number; sharesAsOf: string; coverFiling: FilingReference;
  quote?: QuoteSnapshot;
  equityValue: Metric;
}

interface EnterpriseValueBridge {
  balanceSheetDate: string;
  marketCap: Metric;
  debtLines: { concept: string; value: number; included: boolean; why: string }[];
  totalDebt: Metric;
  cashLines: { concept: string; value: number; included: boolean; why: string }[];
  cashAndInvestments: Metric;
  notInEv: { item: 'preferred' | 'nci' | 'equity_investments'; value?: number }[];
  enterpriseValue: Metric;
}

interface ComparableCompany {
  identity: CompanyIdentity; role: 'target' | 'peer';
  ltm: { revenue: Metric; operatingIncome: Metric; da: Metric; ebitda: Metric;
         ebitdaMargin: Metric; netIncome: Metric; dilutedEps: Metric };
  ltmDetail: Record<string, LTMCalculation>;
  shareClasses: ShareClassCapitalization[];
  ev: EnterpriseValueBridge;
  multiples: { evRevenue: Metric; evEbitda: Metric; pe: Metric };
  lagging: boolean;
}

interface PeerSelectionResult {
  tier: 'sic4' | 'sic3' | 'sic2';
  selected: { cik: string; ticker: string; reason: string }[];
  excluded: { cik: string; ticker: string; code: ExclusionCode; detail: string }[];
  indexGeneratedAt: string;
}

interface CompsSummary {
  metric: 'evRevenue' | 'evEbitda' | 'pe' | 'ebitdaMargin';
  mean?: number; median?: number; high?: number; low?: number; p25?: number; p75?: number;
  nValid: number; nExcluded: number;
}

interface ExportSnapshot {
  appVersion: string; methodologyVersion: string; generatedAt: string;
  target: ComparableCompany; peers: ComparableCompany[];
  summary: CompsSummary[]; peerSelection: PeerSelectionResult; quotes: QuoteSnapshot[];
}
```

Zod schemas validate SEC and Alpha Vantage responses at the boundary; a schema failure is a `SEC_SCHEMA_CHANGED` error, never a guessed value. Dates are ISO strings, money is full dollars, and formatting into millions happens only in `format.ts` and the workbook writer.

## 12. Repository structure

One Next.js app with a strict split: `domain/` is pure finance logic with no I/O, adapters do I/O, UI only displays.

```text
peerset/
  src/
    app/                        Next.js routes
      page.tsx                  home and search
      c/[ticker]/page.tsx       analysis workbench
      methodology/page.tsx
      api/fundamentals/route.ts
      api/peers/route.ts
      api/quotes/route.ts
      api/export/route.ts
    domain/                     pure, isomorphic, fully unit-tested
      types.ts  policy.ts  factSelection.ts  ltm.ts
      metrics/  revenue.ts  operatingIncome.ts  da.ts  netIncome.ts  eps.ts
      capitalization.ts  debt.ts  cash.ts  enterpriseValue.ts
      multiples.ts  nm.ts  stats.ts  comps.ts
    sec/                        SEC adapter
      client.ts                 User-Agent, pacing, retries, error classes
      submissions.ts  companyFacts.ts  filingInstance.ts  freshness.ts  schemas.ts
    prices/                     quote adapter
      provider.ts  userEntered.ts  alphaVantage.ts
    peers/                      index loader and screening
    export/                     workbook.ts  styles.ts  sanitize.ts
    ui/                         CompsTable, ProvenanceDrawer, PeerPanel, AsOfStrip, ...
    lib/                        errors.ts  log.ts  format.ts  cache.ts
  data/peer-index.json          generated monthly
  scripts/
    build-peer-index.ts
    capture-fixture.ts          freezes SEC responses for a ticker and date
  tests/
    unit/  fixtures/sec/<ticker>/<as-of>/  golden/  integration/  workbook/  e2e/
  docs/
    methodology.md  architecture.md  licensing.md
    decisions/                  short decision records
    reconciliation/LII.md
    interview/
  .github/workflows/  ci.yml  refresh-peer-index.yml  smoke.yml
  CLAUDE.md  README.md  .env.example  .nvmrc  LICENSE
```

## 13. API and server-side architecture

The server fetches and normalizes fundamentals once per company; the browser applies prices with the same domain code; the export recomputes everything server-side.

*[Diagram: PeerSet data flow, SEC to snapshot to table and Excel — see the online blueprint]*

When companyfacts lacks the latest filing — as it did for LII's July 10-Q — the pipeline parses the filing itself; everything downstream is identical.

| Route | Method | Returns | Cache |
| --- | --- | --- | --- |
| `/c/[ticker]` | Page | Workbench shell, target fundamentals | Per company |
| `/api/fundamentals?ticker=` | GET | Pre-price fundamentals: LTM metrics, share classes, debt and cash | 24 h, keyed by CIK + latest accession + methodology version |
| `/api/peers?ticker=` | GET | Peer selection result | Static index |
| `/api/quotes?symbols=` | GET | Quote snapshots (Alpha Vantage mode only) | Until the next close |
| `/api/export` | POST target, peers, prices | XLSX stream | None |
| `/methodology` | Page | Static content | Build time |

Design rules:

- **Pure core.** `domain/` has no network, clock or environment access; tests feed it facts and dates.
- **Isomorphic pricing.** Entering a price recomputes in the browser instantly with the same `comps.ts` the server uses.
- **Server-truth export.** The export route never trusts numbers from the browser; it reloads cached fundamentals and recomputes with the submitted peers and prices.
- **Validation.** Tickers are uppercased and must match `^[A-Z][A-Z0-9.-]{0,9}$`; at most 12 peers; prices above zero and below 1,000,000; price dates not in the future.
- **Runtime.** Node.js runtime, region `iad1`, 60 s maximum duration. Identical in-flight SEC requests are shared per instance, best-effort.

## 14. Caching and operations

Cache small, trimmed results, not raw SEC files: Next.js 16 does not cache `fetch` by default, and Vercel's Data Cache refuses items over 2 MB, while LII's companyfacts alone is 4.3 MB \[doc, obs\].

| Data | Mechanism | Lifetime | Key | Size |
| --- | --- | --- | --- | --- |
| Peer index and ticker list | Committed static JSON | Until the monthly PR merges | File version | \~1–1.5 MB (estimate) |
| Submissions per company | `fetch` with `force-cache`, `revalidate: 21600` | 6 h | URL (+ constant User-Agent) | \~164 KB |
| Trimmed facts per company | `unstable_cache` around fetch-and-trim | 24 h | CIK + latest accession + methodology version | Target under 200 KB |
| Parsed filing instance | `unstable_cache` | 30 days | Accession (a filing never changes) | Under 200 KB trimmed |
| Fundamentals per company | `unstable_cache` | 24 h | CIK + latest accession + methodology version | Small |
| Quotes (Alpha Vantage mode) | `unstable_cache` | Until 6 p.m. ET next trading day | Symbol + trading date | Tiny |

Why these choices \[doc\]:

- `'use cache'` entries are keyed by build ID and reset on every deploy, and the plain form is in-memory and "typically" lost between serverless requests. The fetch Data Cache and `unstable_cache` persist across deploys, so v1 uses them. Revisit when Next.js 17 makes Cache Components the default.
- The User-Agent must stay constant, because headers are part of the fetch cache key.
- Including the methodology version in keys means a methodology change invalidates old results on deploy.
- Module-level memory is reused between requests on Vercel's Fluid compute but guaranteed nothing; it is only a best-effort de-duplication layer.

Operations:

- **Logs:** one structured JSON line per request — category, ticker, CIK, accession, SEC calls made, cache hits, duration. No personal data.
- **Smoke test:** after every production deploy and daily, a GitHub Action checks that the live site resolves LII, returns fundamentals with a filing accession, and serves an export. It checks presence and shape, not values, because values change with new filings.
- **Quota guards:** 40 SEC requests per analysis, 12 peers, the per-instance limiter (8.2).
- **Rollback:** Vercel's instant rollback to the previous production deployment.

## 15. Error handling, data quality and security

Errors are classified so the user always learns what failed and whether to retry, while diagnostic detail stays in logs.

### Error categories

| Code | Cause | User sees | Retry |
| --- | --- | --- | --- |
| `INVALID_INPUT` | Malformed ticker, price or date | Field-level message | Fix input |
| `TICKER_NOT_FOUND` | Not in SEC's list | "No SEC-registered company uses XYZ" | No |
| `UNSUPPORTED_ISSUER` | Outside the support matrix | One-sentence reason | No |
| `SEC_UNAVAILABLE` | 5xx or timeout after retries | "SEC didn't respond; showing cached data from …" or try again | Yes, later |
| `SEC_RATE_LIMITED` | 403 rate threshold | "SEC is limiting requests; try again in about 10 minutes" | After 10 min |
| `SEC_SCHEMA_CHANGED` | Zod validation failed | "SEC data format changed; this company can't be analyzed right now" | No; alerts in logs |
| `PRICE_UNAVAILABLE` | Provider error | Price input appears instead | Manual entry |
| `PRICE_RATE_LIMITED` | Provider quota | Same as above | Next day |
| `PARTIAL_RESULT` | Some peers failed | Banner with count and details | Per peer |
| `INTERNAL` | Bug | Generic message with a request ID | Report |

Failure policy: a peer's failure never blocks the analysis — it stays visible with its status, outside the statistics. A missing critical target input withholds the target's valuation and multiples, never fills them.

### Data-quality warnings

Each warning has a code, a plain message and a severity, shown in the drawer and in the workbook's Sources sheet:

| Code | Meaning |
| --- | --- |
| `W_FILING_PARSED` | companyfacts was behind; values parsed from the filing |
| `W_REVENUE_CONCEPTS_DIFFER` | Two revenue concepts disagree for the same period |
| `W_DA_FROM_CASH_FLOW` | D&A taken from the cash-flow statement |
| `W_RESTRICTED_CASH_INCLUDED` | Only a cash tag including restricted cash exists |
| `W_NOT_IN_EV` | Material preferred or noncontrolling interest not in EV |
| `W_DEBT_COMPONENTS_MISMATCH` | Debt components don't sum to the reported total |
| `W_PERIOD_LAG` | LTM end more than 75 days from the peer median |
| `W_53_WEEKS` | LTM window contains a 53-week fiscal year |
| `W_EPS_CROSSCHECK` | EPS differs over 5% from net income ÷ diluted shares |
| `W_SHARES_AFTER_BALANCE_SHEET` | Cover-page shares dated after the balance-sheet date (informational) |

### Security and hygiene

- Secrets live only in Vercel and GitHub environment settings and in a git-ignored `.env.local`; `.env.example` lists names without values.
- Outbound requests go only to an allow-list: `www.sec.gov`, `data.sec.gov`, `www.alphavantage.co`. No user-supplied URLs are ever fetched.
- All inputs are validated with Zod; retries, timeouts and response sizes are bounded.
- Spreadsheet formula injection: every text cell is written as an explicit string, and text starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading apostrophe.
- Stack traces and raw provider errors never reach the browser.
- CI runs `npm audit` for high-severity issues; GitHub's secret scanning push protection stays on for the public repo.
- Commits use your GitHub no-reply email so your personal address isn't published in the public history.
- No accounts, no authentication, no personal data collected.

## 16. Testing and financial reconciliation

A release ships only when the financial fixture tests pass and you have personally confirmed LII's reconciliation rows against the filing. A green test is evidence, not verification.

### Tools

| Tool | Role |
| --- | --- |
| Vitest 5 | Unit, fixture, integration and workbook tests (needs Node 22.12+) \[doc\] |
| `tsc --noEmit`, ESLint, Prettier | Types, lint, formatting |
| Playwright 1.64 | End-to-end and production smoke tests |
| `@axe-core/playwright` | Automated accessibility checks |
| LibreOffice (headless, in CI) | Independent recalculation of workbook formulas (from M5) |

### Test categories

| Category | Proves | Examples |
| --- | --- | --- |
| Financial unit | Math and policy are deterministic | LTM on synthetic December, September and 52/53-week calendars; amendment and restatement selection; LII-style debt double count; restricted-cash fallback; NM matrix incl. EV ≤ 0 and above 100x; stats counts, even-n median, `PERCENTILE.INC` match |
| SEC fixture | Extraction and normalization on real filings | Frozen responses produce golden values to the dollar |
| Integration | Adapters and routes behave | User-Agent sent; backoff; 403/404/5xx classified; timeout; companyfacts gap triggers the filing parse; Alpha Vantage parser on recorded responses |
| Workbook | Export is correct and well-formed | Read back the generated file (section 17) |
| End-to-end | The real workflow works | Fixture mode: search LII → metrics → EBITDA drawer → remove and restore a peer → enter prices → export → open the file |
| Production smoke | The live site works | Resolve LII, fetch fundamentals, serve an export |

CI never calls live SEC: tests read frozen fixtures.

### Golden fixtures

| Fixture | Why it's in the set | Frozen filing | When |
| --- | --- | --- | --- |
| LII Q2 2026 | Primary; exercises the companyfacts gap and the debt hierarchy | 10-Q filed 2026-07-29, accession 0001069202-26-000087 | M0 capture, M1 verify |
| LII Q3 2026 | Current-period check | 10-Q expected after the 2026-10-28 earnings release | Once filed |
| WSO Q2 2026 | Two NYSE-listed share classes | 10-Q filed 2026-08-07, accession 0001193125-26-340204 | M2 |
| GGG Q3 2026 | 52/53-week year ending the last Friday of December | 10-Q filed 2026-10-21, accession 0000042888-26-000145 | M4 |
| JCI fiscal Q3 2026 | September year-end; Irish-domiciled 10-K filer; also showed the gap | 10-Q filed 2026-07-29, accession 0000833444-26-000087 | M4 |
| Negative-EBITDA company | NM paths end to end | Chosen in M0: a 10-K filer whose LTM operating income + D&A is below zero, confirmed from its filing | M6 |

Each fixture keeps the raw SEC responses (gzipped) under `tests/fixtures/sec/<ticker>/<as-of>/`, plus a golden file recording accession, filed date, period, concept, units, inputs, formula and expected result.

### Reconciliation

Each golden company gets a table in `docs/reconciliation/<ticker>.md`. Illustrative row from LII data observed today:

| Metric | PeerSet | Filing input or manual calc | Source | Formula | Diff | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Total debt, 2026-03-31 (USD m) | 1,523.3 | 18.2 + 1,144.1 + 361.0 | 10-Q filed 2026-04-29, balance sheet | Section 7.7 | 0.0 | Awaiting your check |

- **Confirmed** means you checked the number against the filing itself (FactSet is an optional second check, never a source).
- **Drift protocol:** when a live result differs from a golden value, classify it — new filing, definition change, or bug. Golden values change only with a reconciliation note and a commit message saying which. Tests are never edited just to pass.
- **Release gate:** CI green; no skipped test without a written reason; every LII row Confirmed.

## 17. Excel workbook specification

The export is a banker-style three-sheet workbook whose every number equals the screen: inputs in blue, live formulas that already carry their computed values, and a full source trail.

### Sheet 1: Trading Comps

- **Header block (rows 1–6):** "PeerSet — Trading Comparables"; target name and ticker; SIC and description; analysis date; prices as of and source; "USD in millions, except per-share data".
- **Table:** headers on row 8, target on row 9 (bold, light fill), peers from row 11, then Mean, Median, High, Low and n after a blank row.
- **Columns:** Company · Ticker · Fin. through · Price · Equity value · EV · LTM revenue · LTM EBITDA · EBITDA margin · EV/Revenue · EV/EBITDA · P/E.
- **Statistics** are formulas (`AVERAGE`, `MEDIAN`, `MAX`, `MIN`, `COUNT`) over peer rows only. Excel skips text cells, so "NM" and "—" fall out automatically.
- **Footnotes** under the table: EBITDA definition, NM policy, basic-share note, active warnings.

### Sheet 2: Calculations

One block per company:

- LTM bridge (FY, plus YTD, minus prior YTD, equals LTM) for revenue, operating income, D&A, net income and EPS.
- EBITDA as a formula.
- Capitalization by share class: price × shares.
- Debt and cash lines, each marked included or excluded with the reason.
- EV as a formula.

Trading Comps cells link here, shown in green.

### Sheet 3: Sources & Methodology

- One row per fact used: company, metric, concept, period start and end, value (USD), form, accession, filed date, source (companyfacts or filing), and a `HYPERLINK` to the filing index.
- Then definitions, the NM policy, limitations, price source and attribution, app and methodology versions, and generation time.

### Formatting

| Element | Format |
| --- | --- |
| USD millions | `#,##0.0_);(#,##0.0)` |
| Share price, EPS | `#,##0.00_);(#,##0.00)` |
| Multiples | `0.0"x"` |
| Percentages | `0.0%_);(0.0%)` |
| Dates | `yyyy-mm-dd` |
| NM and unavailable | Text "NM" or "—", right-aligned, grey |
| Font colors \[conv\] | Blue = hardcoded input · black = formula · green = link to another sheet |

Freeze panes below the headers and after the Ticker column; set column widths; landscape, one page wide, header rows repeated when printed; light banding on peer rows.

### Formulas vs. static values

Hybrid \[call\]. Inputs are values. Derived figures — EBITDA, margins, equity value, EV, multiples, statistics — are formulas written with their cached results (ExcelJS supports a formula plus its result), and the workbook recalculates fully on open. So any viewer shows correct numbers immediately, and Excel shows live formulas. Values are stored in millions at full precision (divided by 1,000,000, never rounded); number formats do the rounding.

### Workbook validation

- The file opens via read-back; sheet names and header text match exactly.
- Numeric cells are numbers, not text; "NM" and "—" are text and never 0.
- Cached formula results equal the domain-computed values.
- LibreOffice headless recalculation in CI produces the same values, which proves the formulas themselves are right.
- Workbook peers match the selected peer set; unsupported companies never fall inside a statistics range.
- Statistics match the web table; formats, freeze panes and links are as specified.
- Manual: you open it in desktop Excel (or Excel for the web) before anyone claims Excel compatibility.

## 18. GitHub and CI/CD

One public repo, a protected `main`, one pull request per milestone, and three workflows.

- **Repo:** `github.com/jihomoon1/peerset`, public, MIT license, README from day one.
- **Branches:** `main` is protected — pull requests only, CI must pass. Work happens on a branch per milestone (e.g. `m1-ltm-financials`). Claude commits on branches; you review and squash-merge, which is your approval to change `main`.
- **Commits:** `type: summary` (feat, fix, test, docs, chore, data). The history should read as a progression: extraction → capitalization → deployment → comps → export → polish. No filler commits.
- **Review:** the code-review plugin reviews each milestone PR; you read its findings before merging.

| Workflow | Trigger | What it runs |
| --- | --- | --- |
| `ci.yml` | Every PR and push to `main` | `npm ci` → typecheck → lint → unit, fixture and integration tests → workbook tests → build; Playwright end-to-end in fixture mode as a second job; LibreOffice recalculation from M5 |
| `refresh-peer-index.yml` | Monthly (1st of the month, 06:17 UTC, off the top of the hour to avoid delays) and manual | Build the index → open a PR with the change summary |
| `smoke.yml` | Each successful production deploy, and daily | Playwright smoke test against the live URL |

Node is pinned in `.nvmrc` (24), actions to major versions, dependencies via a committed `package-lock.json`. CI needs no secrets; only the index job uses `SEC_USER_AGENT`, stored as a GitHub secret and never printed. The README shows a CI badge and says plainly that green CI is not proof the numbers are right.

## 19. Vercel deployment

Merging to `main` deploys production; every PR gets a preview URL. M0 uses a preview to prove SEC access from Vercel before anything else is built.

1. **Import** `jihomoon1/peerset` into your Vercel account on the Hobby plan. Next.js is auto-detected; Node 24 is the default (Node 20 was deprecated 2026-10-01) \[doc\].
2. **Region** stays `iad1`, Washington DC, the default \[doc\].
3. **Environment variables** for Production and Preview: `SEC_USER_AGENT`, `PRICE_PROVIDER=user`. `ALPHAVANTAGE_API_KEY` exists only in Development until approval is on file.
4. **Functions:** Node.js runtime, 60 s maximum duration (Hobby allows up to 300 s) \[doc\]. The 4.5 MB response limit \[doc\] is far above a comps workbook's size.
5. **URL:** `peerset.vercel.app` if free, otherwise Vercel's assigned name. A custom domain is optional and out of scope.
6. **Rollback:** Vercel's instant rollback to the previous production deployment.
7. **Terms:** Hobby is for non-commercial personal use \[doc\], so no ads, payments or sponsorships.
8. **First-deploy checks:** the smoke workflow passes; `/api/fundamentals?ticker=LII` returns 200 from production; the built client bundle contains no secret names or values.

The optional Vercel MCP can create deployments and has no documented read-only mode \[doc\], so Claude asks before any write action through it.

## 20. Claude tooling setup guide

About an hour of one-time setup on your Mac; each step ends with a check that proves it worked.

### What's already on your account (checked 2026-10-22)

| Capability | Status | Role in PeerSet |
| --- | --- | --- |
| Superpowers plugin (TDD, systematic debugging, writing and executing plans, verification before completion) | Enabled | Engineering discipline for the financial core and milestone gates |
| Code-review plugin | Enabled | Reviews each milestone PR |
| GitHub MCP plugin | Enabled | Optional; needs a personal access token. Use the `gh` CLI instead, as Anthropic's best-practices page recommends \[doc\] |
| Financial plugins (comps-analysis, audit-xls, xlsx-author and others) | Enabled | Review the workbook against banker conventions in M5; never a data source |
| xlsx skill | Enabled | Should sync into Claude Code with your claude.ai login \[doc\]; inspects generated workbooks |
| FactSet connector | Setup incomplete | Finish connecting; manual cross-checks of golden numbers only |
| Supabase plugin | Enabled | Not needed; disable for this project |

Plugins enabled on claude.ai sync into Claude Code terminal sessions automatically when you log in with your claude.ai account \[doc\].

### Setup steps

1. **Check what you have:** `claude --version`, `node -v`, `git --version`, `gh --version`.
2. **Git, if missing:** `xcode-select --install`, then `git --version`.
3. **Node 24:** the v24 LTS macOS installer from nodejs.org. Check: `node -v` prints v24.x (Vitest 5 needs at least 22.12).
4. **GitHub CLI:** install from cli.github.com, then `gh auth login` (GitHub.com, HTTPS, browser). Check: `gh auth status` shows jihomoon1.
5. **Git identity:** set `user.name` to your name and `user.email` to your GitHub no-reply address (GitHub → Settings → Emails), so your personal email stays out of the public history.
6. **Claude Code:** you have 2.1.126, older than the 2.1.273 needed for plugin sync \[doc\]; claude update fails on your npm install, so run claude install to switch to the self-updating native build, then remove the old npm copy; the same native installer is on the Claude Code setup page (`curl -fsSL https://claude.ai/install.sh` piped to `bash`) \[doc\]. Check: `claude doctor`.
7. **Log in with Max:** run `claude`, then `/login`, choosing your Claude subscription. Check: `/status` shows the subscription, not an API key. If `ANTHROPIC_API_KEY` is set in your shell, unset it — it would take priority \[doc\].
8. **See synced tools:** in a session, `/plugin` and `/skills`. Check: the plugins above and the xlsx skill appear.
9. **Disable Supabase** for this work: `claude plugin disable <its name>@synced`, using the name `/plugin` shows.
10. **Vercel CLI:** your global npm folder is root-owned, so skip global installs; run `npx vercel@latest login` instead. Check: `npx vercel@latest whoami`.
11. **VS Code extension:** install "Claude Code" (`anthropic.claude-code`). Check: the Claude panel opens. You'll see each edit as a diff — the best way to learn.
12. **Optional, Context7:** `/plugin install context7@claude-plugins-official` (no key needed) \[doc\] for current Next.js 16 and Vitest 5 docs.
13. **Optional, Vercel MCP:** `claude mcp add --transport http vercel https://mcp.vercel.com`, then `/mcp` to sign in and grant your team \[doc\].
14. **Later, in M3:** the Playwright CLI with skills for Claude-driven browser checks; the README of Playwright's MCP server now recommends this route for coding agents \[doc\]. Playwright Test itself is a repo dependency.

### Working rules for Claude Code

- **Modes:** each milestone starts in plan mode (Shift+Tab, or `--permission-mode plan`); you approve the plan, then work proceeds in default or accept-edits mode. Auto mode is now the default starting mode \[doc\]; keep it off for financial logic so nothing runs unseen.
- **Project permissions** (`.claude/settings.json`): allow tests, lint, build and git commands on branches; ask before `git push`, merging PRs and any deploy; deny reading `.env*` files.
- **CLAUDE.md:** under 200 lines \[doc\]. Purpose, architecture map, financial invariants (missing is never zero, full units internally, one snapshot for UI and Excel, latest-filed rule, golden values never edited to pass), approved dependencies, commands, stopping conditions. It imports `@docs/methodology.md` as the single source of truth for definitions.
- **Plugins by moment:** TDD for `domain/`; systematic debugging on any failure; verification-before-completion at each milestone end; code review on each PR; comps-analysis and audit-xls on the workbook in M5.
- **Subagents:** a read-only methodology reviewer at the M1 and M2 gates; a UX auditor in M6. Never two agents editing the same files.
- **Custom skills:** none at first. After M2, if a workflow repeats, candidates are `edgar-reconcile` (capture a filing, produce a reconciliation table) and `comps-review`.

## 21. Milestone roadmap

Seven milestones, each ending at a gate you sign off. At about 5–6 hours a week, a live URL with correct LII numbers lands around week 7, and v1 takes roughly 12–15 weeks — an estimate, not a commitment.

*[Diagram: roadmap, 7 milestones each with its gate — see the online blueprint]*

M3 is the turning point: after it, every improvement ships to a public URL you can show.

| Milestone | Objective | Main deliverables | Size | Est. weeks |
| --- | --- | --- | --- | --- |
| M0 Setup and feasibility | Prove the environment and SEC access work before building | Tools verified; repo, Next.js 16.4 skeleton, CI, CLAUDE.md, methodology v0; SEC spike on a Vercel preview; fixture capture script and LII Q2 fixture; Alpha Vantage email sent; FactSet connected; negative-EBITDA candidate chosen | S–M | 1 |
| M1 One company, correct LTM | LII's LTM financials, reconciled | SEC client; companyfacts trimming; freshness check; XBRL parser; fact selection; LTM, EBITDA, net income, EPS; minimal `/c/LII` page with provenance drawer; LII reconciliation | L | 2–3 |
| M2 Price, capitalization, EV | A defensible EV bridge | Cover-page shares by class; debt hierarchy; cash; EV bridge; quote adapter (user-entered, Alpha Vantage behind a flag); as-of strip; WSO fixture | M | 1–2 |
| M3 Early public deployment | A real public URL early | Vercel production; environment variables; smoke workflow; branch protection; README v1 stating what works so far | S | Under 1 |
| M4 Peers and comps engine | The ticker-to-comps workflow | Peer index script and monthly workflow; screening; peer panel; comps table; NM rules; statistics; lag flags; GGG and JCI fixtures; implied range if time allows | L | 2–3 |
| M5 Excel export | A workbook a banker would keep | Three sheets; formats; formulas with cached values; workbook tests; LibreOffice recalculation; plugin review; your manual Excel check | M | 1–2 |
| M6 Hardening and docs | Ready to demo and defend | All UX states; accessibility; negative-EBITDA fixture; README and methodology page; interview pack; final reconciliation | M | 2 |

Each milestone is one or more focused Claude Code sessions, each ending with this report: what was implemented · requirements met · files changed · new dependencies and why · tests run with exact results · financial outputs verified · what's uncertain · known limitations · commit or PR · live link if relevant · what you should inspect · one or two sentences teaching the central decision. Nothing is called done because code was written; done means its gate passed.

## 22. Acceptance gates

Tick these yourself. A gate with an unticked box is not passed, and the next milestone does not start.

### M0 — Setup and feasibility

- [ ] `claude doctor`, `node -v` (24.x), `gh auth status` and `vercel whoami` all pass
- [ ] Public repo with protected `main`; CI green on a first PR
- [ ] A Vercel preview fetched LII's submissions and companyfacts with the project User-Agent; status codes and timings recorded in a decision note
- [ ] LII Q2 and Watsco Q2 fixtures captured and committed
- [ ] Alpha Vantage email sent; FactSet connected
- [ ] Negative-EBITDA candidate named, with its filing as evidence
- [ ] You approved `docs/methodology.md` v0

### M1 — One company, correct LTM

- [ ] LII Q2 golden tests pass, including the filing-parse path
- [ ] Unit tests cover the LTM checks, the selection rule, and 52/53-week and September calendars
- [ ] Every LII reconciliation row Confirmed by you against the filings
- [ ] The drawer shows formula, inputs, concept, period, accession and link for every metric
- [ ] The methodology-reviewer subagent's findings are all addressed

### M2 — Price, capitalization, EV

- [ ] LII debt ties to the inclusive total; finance leases counted once
- [ ] WSO shows both classes, each priced; its P/E is Unsupported with the reason
- [ ] The as-of strip shows price date, LTM end, cover date and pull time
- [ ] EV bridge rows Confirmed in the reconciliation
- [ ] Alpha Vantage parser tested on recorded responses; production set to user-entered prices

### M3 — Early public deployment

- [ ] The public URL runs LII end to end with user-entered prices
- [ ] Smoke workflow green against production
- [ ] No secrets in the repo history or the client bundle
- [ ] README says what works now and what comes next

### M4 — Peers and comps engine

- [ ] Peer index built by the workflow and merged via PR, with metadata
- [ ] Every LII suggestion shows its reason; every exclusion shows its code
- [ ] NM matrix tested; per-metric n counts correct
- [ ] GGG and JCI golden tests pass
- [ ] One failing peer leaves the rest of the analysis intact (end-to-end test)

### M5 — Excel export

- [ ] Workbook values equal the web table for the same snapshot
- [ ] LibreOffice recalculation matches the cached values
- [ ] Missing and NM never appear as zero
- [ ] You opened it in Excel and it reads like a banker's sheet

### M6 — v1 release

- [ ] Every UX state in section 6 reachable and tested
- [ ] axe reports no serious or critical issues
- [ ] Negative-EBITDA fixture passes
- [ ] README, methodology page and known limitations complete
- [ ] All golden reconciliations Confirmed; no undocumented skipped tests
- [ ] Two-minute demo rehearsed on the live URL

## 23. Known limitations and decisions needing approval

v1's limits are deliberate and shown in the app; nine decisions below need your yes by the milestone named.

### Limitations in v1

- EBITDA is standardized and unadjusted; company-reported adjusted EBITDA will differ.
- Shares are basic (cover page), not diluted by the treasury stock method, so equity value runs below a banker's figure.
- EV leaves out preferred stock, noncontrolling interests and equity investments; it warns when they look material.
- Peers come from SIC codes and revenue scale, not economic judgment.
- Prices are user-entered until Alpha Vantage approves; there are no historical prices.
- Only U.S. 10-K/10-Q filers reporting in USD; no 20-F filers, ADRs or financial companies.
- Company extension tags are ignored, so some companies will be Unsupported.
- Multi-class P/E and unlisted share classes are Unsupported.
- LTM is only as current as each company's latest filing; laggards are flagged, not fixed.
- SEC's APIs can behave in undocumented ways; the companyfacts gap is handled, and others may exist.

### Decisions needing approval

| # | Decision | Recommendation | Needed by |
| --- | --- | --- | --- |
| 1 | MIT license for the public repo | Approve | M0 |
| 2 | Revenue rule when two concepts disagree: prefer `Revenues` when larger, warn | Approve; re-check against fixtures | M1 gate |
| 3 | Policy thresholds: 100x NM cap, 75-day lag flag, 5% EPS cross-check, 5% NCI materiality | Approve as v1 starting values | M1–M4 |
| 4 | A demo snapshot: frozen LII analysis with closing prices you enter by hand, labeled with source and date | Approve; low risk, but the source site's terms still apply | M3 |
| 5 | Install the Vercel MCP | Optional; the CLI is enough | M3 |
| 6 | Default of 8 peers, adjustable 5–12 | Approve | M4 |
| 7 | Monthly peer-index refresh through a PR you merge | Approve | M4 |
| 8 | Target excluded from peer statistics | Approve | M4 |
| 9 | Switch production prices to Alpha Vantage | Only after written approval is filed | When it arrives |

## 24. Future improvements

Each idea is judged on what it adds to the analysis versus what it costs and how it could mislead.

| Idea | Analysis value | Interview value | Cost | Data | Risk of misleading | When |
| --- | --- | --- | --- | --- | --- | --- |
| Implied valuation range (25th–75th percentile) | High | High | Low | Already have | Low when inputs valid | v1 stretch or v1.1 |
| Diluted shares (treasury stock method) | High | High | Medium–high | Partly in XBRL | Medium | v1.1 |
| Preferred, NCI and equity-investment EV adjustments | High | High | Medium | In XBRL | Low | v1.1 |
| Football-field chart | Medium | High | Low after the implied range | Already have | Medium (false precision) | v1.1 |
| Alternative screens (margin, growth) | Medium | Medium | Low | Already have | Low | v1.1 |
| Quarterly trend view | Low–medium | Medium | Medium (needs Q4 derivation) | Already have | Low | v1.2 |
| Reported vs. standardized EBITDA | High | Very high | High (non-GAAP lives in press releases, not XBRL) | Poor | High | Later |
| Business-description or segment similarity for peers | High | High | High | 10-K text | Medium | Later |
| Saved peer sets | Medium | Low | Needs a database and accounts | — | Low | Later |
| Historical multiples | Medium | Medium | Needs licensed price history | Paid | Medium | Later |
| 20-F and ADR support | Medium | Medium | High (IFRS, currencies) | Partial | High | Later |

## 25. Portfolio value

PeerSet's credibility comes from three real problems you found and solved, not from the stack.

What it demonstrates:

- **Finance:** LTM construction, the bridge from equity value to EV, EBITDA as a proxy and its limits, NM conventions, comparability across periods, scale and SIC, and why bankers still review by hand.
- **Engineering:** typed data modeling, API integration under rate limits, a bounded XBRL parser, caching on serverless, golden-fixture testing, CI/CD, a deployed product.
- **Judgment:** data licensing, honest statuses, refusing to fabricate numbers.

Three interview stories, all observed on 2026-10-22:

1. **"SEC's own API was a quarter behind."** companyfacts lacked LII's July 10-Q, and the latest filing of 3 other companies in a 24-company sample. You designed a freshness check and a filing parser.
2. **"The obvious debt formula double-counts."** LII's debt tags already include finance leases, so the naive sum overstates debt by 68.3M USD. You built an inclusive-total hierarchy with sum checks.
3. **"No free price API allows a public site."** You read seven providers' terms, found that hiding the price doesn't help, and designed user-entered prices plus a permission request.

Interview pack (built in M6, in `docs/interview/`): a one-paragraph product explanation, the architecture diagram, a one-page methodology cheat sheet, a two-minute demo script (LII → EBITDA drawer → debt bridge → remove a peer → export), a decision log, and the three challenges written up.

Draft résumé bullets — bracketed parts are filled only with true numbers once v1 exists:

- Built PeerSet, a public Next.js/TypeScript web app that generates trading comparables from SEC XBRL filings, with filing-level provenance for every figure and a formatted three-sheet Excel export (\[live URL\]).
- Designed a filing-freshness check and XBRL parser after finding SEC's companyfacts API omitted the latest 10-Q for \[N\] of \[M\] sampled issuers.
- Verified LTM, EBITDA and EV calculations against primary filings for \[N\] golden-test companies, enforced by \[N\] automated tests in CI.

No usage numbers or performance claims go on the résumé unless measured.

## Sources

Pages read on 2026-10-22 unless noted; \[obs\] figures come from SEC data downloaded that day and re-checked on 2026-10-23.

**SEC**

- [Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) — rate limit, User-Agent
- [EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) — submissions, companyfacts, frames, bulk files, CORS
- [Privacy and Security Policy](https://www.sec.gov/privacy) — consequences of exceeding the rate limit
- [Webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions) — User-Agent format
- [Financial Statement Data Sets](https://www.sec.gov/data-research/sec-markets-data/financial-statement-data-sets)

**Price providers**

- [Alpha Vantage support](https://www.alphavantage.co/support/) (re-checked 2026-10-23) and [terms](https://www.alphavantage.co/terms_of_service/)
- [Twelve Data terms](https://twelvedata.com/terms)
- [Tiingo terms](https://app.tiingo.com/tos/)
- [Massive market data terms](https://massive.com/legal/market-data-terms-of-service)
- [Finnhub terms](https://finnhub.io/terms-of-service)
- [FMP terms](https://site.financialmodelingprep.com/terms-of-service)
- [EODHD terms](https://eodhd.com/financial-apis/terms-conditions)

**Next.js, Vercel, GitHub, libraries**

- [Next.js caching](https://nextjs.org/docs/app/getting-started/caching) · [Next.js 16.4 release](https://nextjs.org/blog/next-16-4) · [use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) · [unstable\_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) · [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Function limits](https://vercel.com/docs/functions/limitations) · [Data Cache](https://vercel.com/docs/caching/runtime-cache/data-cache) · [Git deployments](https://vercel.com/docs/git) · [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [GitHub Actions: events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [ExcelJS](https://github.com/exceljs/exceljs) · [SheetJS Node install notes](https://docs.sheetjs.com/docs/getting-started/installation/nodejs) · [Vitest 5](https://vitest.dev/blog/vitest-5) · [Playwright CI](https://playwright.dev/docs/ci) · [Zod](https://zod.dev)

**Claude tooling**

- Claude Code: [setup](https://code.claude.com/docs/en/setup) · [authentication](https://code.claude.com/docs/en/authentication) · [permission modes](https://code.claude.com/docs/en/permission-modes) · [memory](https://code.claude.com/docs/en/memory) · [skills](https://code.claude.com/docs/en/skills) · [MCP](https://code.claude.com/docs/en/mcp) · [best practices](https://code.claude.com/docs/en/best-practices)
- [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp) · [Playwright MCP](https://github.com/microsoft/playwright-mcp) · [Playwright CLI](https://github.com/microsoft/playwright-cli) · [Context7](https://github.com/upstash/context7) · [GitHub MCP server](https://github.com/github/github-mcp-server)

**Company**

- [Lennox schedules Q3 2026 results](https://finviz.com/news/400427/lennox-schedules-third-quarter-results) (third-party reprint of the company release)
