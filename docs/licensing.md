# Data licensing

## SEC EDGAR

SEC filings and EDGAR APIs are public data. PeerSet identifies itself with a User-Agent containing a contact email (blueprint §8.2) and stays under SEC's fair-access limit of 10 requests per second.

## Prices: Alpha Vantage permission request

Status: **declined; production stays on user-entered prices** (`PRICE_PROVIDER=user`, blueprint §9).

| When (ET)                 | What happened                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| October 28, 2026, 1:23 PM | Jiho emailed support@alphavantage.co asking for written permission to show end-of-day closes publicly, include them in the Excel export and cache them for one day.                                                                                   |
| October 28, 2026, 1:37 PM | Alpha Vantage declined: "Unfortunately, we couldn't verify an ongoing educational collaboration with your school." They offered a permanent 25% discount on a premium plan. The reply did not say whether a paid plan includes public-display rights. |
| October 28, 2026, 1:43 PM | Jiho declined the offer.                                                                                                                                                                                                                              |

PeerSet's servers therefore never fetch or redistribute vendor prices in production. The server-side Alpha Vantage adapter (`src/prices/alphaVantage.ts`) stays in the code, off by default, in case permission is granted later. v1.1 adds a different route, described next, in which PeerSet's servers still never touch a vendor price.

## Prices: bring your own key (v1.1)

Status: **in use from v1.1** (November 2026).

### The design

A visitor who wants prices filled in pastes their **own free Alpha Vantage key** into the workbench's "Price autofill" panel. Clicking **Fill prices** makes the visitor's **own browser** call `https://www.alphavantage.co/query` directly, one request per ticker (`TIME_SERIES_DAILY`, compact; the latest finished close and its date). Alpha Vantage answers browser requests with `access-control-allow-origin: *` (checked 2026-11-02).

The quotes come back to the visitor's browser and go into the same price inputs a visitor would otherwise type into. From there they are **user inputs**, exactly like typed prices. PeerSet's servers never receive, store, cache or forward the key or the quotes. They only ever see the closing price the visitor's browser submits, the same way as a typed price.

This is the visitor's personal use of their own free key under Alpha Vantage's terms. PeerSet acts like a calculator the visitor types the numbers into, with the typing done by the visitor's browser.

### Hard rules (each one has a test)

1. **The key never reaches PeerSet.** The key is never sent to any PeerSet route, log, analytics or error report. It is held in the page's memory, and in the browser's `localStorage` only when the visitor ticks "Remember on this device" (off by default; "Forget key" removes it). It is never in the URL or the export request. Error messages are built from the ticker and a fixed reason, never from the request URL. Tests: `tests/unit/prices/browserAlphaVantage.test.ts` (no key in any message or cache entry); `e2e/autofill.spec.ts` (a network listener checks every request to PeerSet's origin, its URL, headers and body, for the key).
2. **Browser only, Alpha Vantage only.** Quotes are fetched only from `https://www.alphavantage.co`, and only from the browser (`src/prices/browserAlphaVantage.ts`).
   - Requests go one at a time, at least 1.2 s apart (Alpha Vantage's burst notice asks for 1 per second), with at most 13 tickers per click.
   - A rate-limit or daily-cap answer stops the fill at once and keeps what was already filled.
   - Each close is cached in the visitor's own `localStorage` until 6 p.m. ET on the next weekday, so a reload spends no calls.
   - A cached close is put back into an empty price box when the visitor opens a company again (November 2026), with its bar date and attribution. The expiry is unchanged, and it spends no calls.
3. **The server stays off.** `PRICE_PROVIDER` stays `user` in production, and `/api/quotes` keeps answering 404 there (tests: `tests/integration/quotesRoute.test.ts`, "is 404 in user mode"; `tests/unit/prices/alphaVantage.test.ts`, `priceProviderName`).
4. **Filled prices are user inputs.**
   - They go into the URL state (`px=` with `pxav=` naming the filled tickers and their bar dates), so the visitor decides whether to share a link.
   - The export sends them as inputs, labelled as filled. The server recomputes every fundamental itself (server-truth export); it treats the prices as the visitor's inputs, as it does typed ones.
5. **Attribution wherever filled prices appear:**
   - **As-of strip:** "Prices: Alpha Vantage, fetched with your key · close of <date>";
   - **EV-bridge drawer:** the same line next to each filled price;
   - **Workbook header:** "Prices: Alpha Vantage via the user's own key, close of <date>; entered by the user's browser.";
   - **Workbook Sources sheet:** a per-ticker source.

### Why this differs from server-side use

What Alpha Vantage declined (above) was PeerSet itself fetching, displaying, exporting and caching its data for the public. Under bring-your-own-key, PeerSet's servers do none of that:

- **No request:** PeerSet makes no request to Alpha Vantage.
- **No vendor data on PeerSet's servers:** they never hold Alpha Vantage's response, and PeerSet has no key of its own in production.
- **No shared cache:** nothing is cached for other visitors. Each visitor's cached closes live only in that visitor's browser.
- **The only price a server sees** is a number the visitor's browser submits as an input, in an export the visitor asked for.

A visitor using their own free key for their own analysis is the personal use Alpha Vantage's free tier allows.

### Free-tier limits (checked 2026-11-02)

- **Daily limit:** Alpha Vantage's support and premium pages state **25 requests per day** for a free key, with no per-minute figure. One fill for a target and 8 peers is about 10 requests (two for a two-class company such as WSO), so a free key covers about two fresh fills a day.
- **Repeat fills:** the same-day cache makes repeat fills free.
- **When the limit is hit:** PeerSet shows "Alpha Vantage's daily limit was reached; filled X of Y. Enter the rest by hand or try tomorrow."

### Caveat

Provider terms are a contract between Alpha Vantage and each key holder. PeerSet stays non-commercial: no ads, payments or accounts. If that changes, this route needs a fresh look. This is not legal advice (blueprint §9).

The draft below was the starting point for the request; the email Jiho sent may have been edited.

---

**Subject:** Permission request: open-source student project using daily closing prices

Hello Alpha Vantage team,

I'm a finance student at George Washington University building PeerSet, a free, open-source, non-commercial web app that builds first-pass trading comparables from SEC filings. It is a student portfolio project: there are no ads, payments, accounts or sponsors, and the code is public at https://github.com/jihomoon1/peerset under the MIT license.

Your support page mentions free access for verified open-source and educational projects, and I'd like to ask for written permission for the following use:

- **Data:** end-of-day closing prices only (`TIME_SERIES_DAILY`, compact), for U.S.-listed stocks.
- **Volume:** at most 13 tickers per analysis (one target and up to 12 peers), one call per ticker per trading day.
- **Public display:** showing the closing price, its date, and multiples derived from it (market capitalization, EV/EBITDA, P/E) on the public website.
- **Excel export:** including those closing prices and derived figures in a downloadable workbook the user generates.
- **Caching:** storing each closing price for up to one trading day, until the next close.
- **Attribution:** "Price data provided by Alpha Vantage" with a link, shown on screen and in every exported workbook.

No real-time or intraday data would be used, and prices would never be resold or offered as a data feed.

Could you confirm whether this use is permitted, and whether a specific key or attribution format is required? I'm happy to share more detail about the project.

Thank you,
Jiho Moon
George Washington University School of Business

---

### Reply

Declined on October 28, 2026 (see the table above). The reply is kept in Jiho's email, not in the repo.
