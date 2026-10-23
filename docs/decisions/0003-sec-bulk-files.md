# 0003 — SEC bulk-file locations

Date: October 23, 2026 · Status: recorded (M0, part G)

## Source

SEC's [EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) page (read October 23, 2026) gives:

- `https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip`
- `https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip`

and says they are "updated and republished nightly at approximately 3:00 a.m. ET". Note the two files live in **different folders** (`bulkdata/` vs. `xbrl/`).

## HEAD check (no download)

One `HEAD` request each, with the project User-Agent, on 2026-10-23 at 12:08 UTC:

| File               | Status | Content-Length (bytes) | GB (10⁹) | Last-Modified                 | Content-Type    |
| ------------------ | ------ | ---------------------- | -------- | ----------------------------- | --------------- |
| `submissions.zip`  | 200    | 1,570,741,644          | 1.571    | Fri, 23 Oct 2026 04:27:22 GMT | application/zip |
| `companyfacts.zip` | 200    | 1,411,323,831          | 1.411    | Fri, 23 Oct 2026 04:19:52 GMT | application/zip |

Both match blueprint §8.1 / §10.1 (about 1.57 GB and 1.41 GB). The Last-Modified times (about 00:20–00:27 ET) are consistent with a nightly rebuild.

## Consequence for M4

The peer-index job downloads about 2.98 GB a month in two requests. The URLs above go into `scripts/build-peer-index.ts`; the job should check `Last-Modified` and fail clearly if either URL stops returning a zip.
