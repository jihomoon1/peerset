# Data licensing

## SEC EDGAR

SEC filings and EDGAR APIs are public data. PeerSet identifies itself with a User-Agent containing a contact email (blueprint §8.2) and stays under SEC's fair-access limit of 10 requests per second.

## Prices: Alpha Vantage permission request

Status: **draft, not sent.** Production uses user-entered prices (`PRICE_PROVIDER=user`) until written approval is filed here (blueprint §9).

Jiho: edit this in your own words, send it from your own email via the contact options on [alphavantage.co/support](https://www.alphavantage.co/support/), and paste the reply below.

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

### Reply (paste here when received)

_Not yet received._
