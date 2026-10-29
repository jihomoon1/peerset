# 0009 — Peer load budget: 3 peers at a time, 2.5 SEC requests per second per instance

Date: October 29, 2026 · Status: approved by Jiho Moon in M4b planning

## Context

SEC allows 10 requests per second in total from all of a user's machines (blueprint §8.2). M4b's comps workbench loads up to 12 peers. The browser loads each peer through `/api/fundamentals`, so each concurrent peer request may run on its **own** Vercel instance, and each instance has its own limiter (`src/sec/client.ts`). The per-instance limit therefore does not cap the total. The browser's concurrency multiplied by the per-instance rate does.

M4b requires the worst-case total to stay at or below **8 requests per second**.

## Decision

- **Browser:** at most **3** peer loads in flight (`PEER_LOAD_CONCURRENCY` in `src/ui/usePeerLoader.ts`), as blueprint §5 says ("three at a time").
- **Server:** the per-instance limiter spaces request starts **400 ms** apart (2.5 per second). It was 250 ms (4 per second). The in-flight cap stays at 3.
- **Worst case:** 3 instances × 2.5 = **7.5 requests per second**, under the cap of 8. The rejected alternative was 2 at a time × 4 per second = 8.0, exactly at the cap. That would keep a cold target page about 1 s faster, but departs from blueprint §5.

The target page and `/api/peers` don't add to this. The page has finished loading before the browser starts peer loads, and `/api/peers` reads only the committed peer index (no SEC requests).

## What a load costs

A **cold** company (fundamentals not cached) makes about 8 SEC requests:

1. ticker list
2. submissions
3. submissions again, inside the freshness check
4. companyfacts
5. filing index
6. XBRL instance
7. `FilingSummary.xml`
8. the balance-sheet R file

The first one is skipped when the ticker-list memo below holds the list.

**Cold time for 8 peers:**

- **Pacing per peer:** 8 requests, so 7 gaps × 0.4 s = 2.8 s.
- **Response time:** SEC's response times add roughly 1 s per peer (M4a measured 3.1 s for a whole cold page at 4 per second).
- **Total per peer:** about **4 s**.
- **8 peers at 3 in flight:** 3 waves (3 + 3 + 2) × about 4 s ≈ **12 s**, with rows filling in as each peer finishes.
- **Worst case, 12 peers:** about 104 requests (12 × 8 + the target's 8), spread over about 16 s.

A **warm** company (fundamentals cached) costs at most 2 SEC requests (ticker list, submissions), and only 1 when the memo holds the ticker list. Both go through Next's fetch cache (24 h and 6 h), so they often never reach SEC. They still each take a limiter slot, because the limiter runs before `fetch` and cannot know whether the fetch cache will answer. So a warm peer costs at least 0.4 s of pacing on its instance. Eight warm peers at 3 in flight: about 3 waves × 0.5–1 s ≈ **2–3 s**.

## Cached peers: what can be skipped

- **Ticker list: memoized per instance** (`tickerTableMemo` in `src/lib/fundamentals.ts`, 24 h). This is best-effort: Vercel keeps module memory between requests on the same instance, but doesn't promise to. It saves one limiter slot and a 0.5 MB parse on every load.
- **Submissions: never skipped.** It is how a new 10-Q or 10-K is discovered, and the latest accession is part of the fundamentals cache key (latest-filed rule, methodology §1). The M4a report suggested taking the accession from the monthly peer index instead. That could serve fundamentals up to a month old after a company files, so it is rejected. The 6 h fetch cache already keeps most of these checks from reaching SEC.

## Blueprint change

Blueprint §8.2 and §14 said "40 SEC requests per analysis". A cold 8-peer analysis needs about 72 and 12 peers about 104, and nothing enforced the 40 (a budget kept in the browser couldn't be trusted anyway). With Jiho's approval, the per-analysis cap is replaced by the protections that actually hold:

- at most 8 requests per second in total (this ADR);
- the per-company budget;
- at most 12 peers.

## Revisit when

SEC's limit changes; Vercel guarantees instance reuse; or peer loading moves to one server request that loads all peers on one instance (then the per-instance limiter alone caps the total, and could go back to 4 per second).
