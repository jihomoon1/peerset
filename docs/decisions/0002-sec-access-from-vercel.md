# 0002 — SEC access from Vercel works

Date: October 23, 2026 · Status: feasibility confirmed (M0, part E)

## Question

Blueprint §8.2: "Vercel is untested." Can a Vercel function fetch SEC's `data.sec.gov` APIs with the project User-Agent, without 403s?

## Method

A temporary route, `src/app/api/spike/sec/route.ts` (commit `5be3258`, removed at the end of M0), fetched for LII (CIK 0001069202):

- `https://data.sec.gov/submissions/CIK0001069202.json`
- `https://data.sec.gov/api/xbrl/companyfacts/CIK0001069202.json`

with `User-Agent: PeerSet (Jiho Moon) <project email>` (from `SEC_USER_AGENT`) and `Accept-Encoding: gzip, deflate`. No caching (`cache: "no-store"`, `force-dynamic`), 10 s timeout, at most one retry on 5xx/timeout, at most 2 SEC requests per call. "Gzipped bytes" is the `Content-Length` header; "decoded bytes" is the body after decompression.

## Results

| Run | Where                   | Time (UTC)          | submissions                               | companyfacts                                           |
| --- | ----------------------- | ------------------- | ----------------------------------------- | ------------------------------------------------------ |
| 1   | Local (Mac, `next dev`) | 2026-10-23 12:06:08 | 200 · 60 ms · 21,635 gz / 157,300 decoded | 200 · 64 ms · 277,941 gz / 4,266,684 decoded           |
| 2   | Local                   | 12:06:15            | 200 · 48 ms · same sizes                  | 200 · 62 ms · same sizes                               |
| 3   | Vercel preview, `iad1`  | 14:30:19            | 200 · 76 ms · 21,635 gz / 157,300 decoded | 200 · 311 ms · (no Content-Length) / 4,266,684 decoded |
| 4   | Vercel preview, `iad1`  | 14:30:27            | 200 · 118 ms · same sizes                 | 200 · 77 ms · 277,941 gz / 4,266,684 decoded           |
| 5   | Vercel preview, `iad1`  | 14:30:35            | 200 · 40 ms · same sizes                  | 200 · 51 ms · 277,941 gz / 4,266,684 decoded           |

- **No 403s** anywhere; no retries were needed (each call made exactly 2 SEC requests).
- Every response was gzip-encoded, so the `Accept-Encoding` header is honored: companyfacts is about 278 KB on the wire vs. 4.27 MB decoded.
- Preview deployment: `peerset-2kyhuucqy-jihomoon1-7911s-projects.vercel.app`, called via `vercel curl` because Vercel Authentication protects previews (a plain `curl` got HTTP 302 to the login page).

## companyfacts freshness (same answer from every run)

- Latest periodic filing in submissions: **10-Q, accession 0001069202-26-000087, filed 2026-07-29, period 2026-06-30.**
- Newest accession in companyfacts: **0001069202-26-000054, filed 2026-04-29** (65 distinct accessions).
- **The latest 10-Q is not in companyfacts.** The gap observed on 2026-10-22 (blueprint §8.3) persists 86 days after filing, so the freshness check and filing parser in M1 are required.

## Decision

SEC access from Vercel Hobby (`iad1`) is feasible with the project User-Agent. Proceed with the server-side SEC adapter in M1 as designed.

## Incident: first deploy went to production

The first `vercel deploy` (no `--prod`) was assigned to **production** by Vercel because it was the project's first deployment ("This is the project's first deployment, so it was assigned to production"). It served the placeholder page at `peerset.vercel.app`; its spike route returned `SEC_USER_AGENT is not set` (the variable exists only in Preview), so it made no SEC requests and exposed no secret. With Jiho's approval, a second deploy (a real preview) was made, the spike run on it, and the production deployment `peerset-3gdbjtb43-…` was removed with `vercel remove`; `peerset.vercel.app` then returned 404.

Lesson for M3: Vercel promotes a project's first deployment to production regardless of `--prod`. Production deploys must be a deliberate step.

Also: creating the project with `vercel project add` left the framework preset as "Other"; `vercel.json` now sets `"framework": "nextjs"`.
