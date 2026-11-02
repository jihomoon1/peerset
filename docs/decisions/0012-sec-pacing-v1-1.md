# 0012 — SEC pacing in v1.1: 2 requests per second per instance, exports reuse recent checks

Date: November 2, 2026 · Status: approved by Jiho Moon in v1.1 planning · Supersedes the pacing numbers of ADR 0009 (its 3-in-flight browser rule and cost model still hold)

## Context

On 2026-11-02 at 15:12:41–42 UTC production sent SEC **10 requests per second** for two seconds (M6 report, part 6c). Four function invocations overlapped:

- three peer loads (the smoke test's workbench);
- one export (the M6 production check).

Each invocation stayed within its own limit of 2.5 per second (each sent at most 3 in a second). SEC refused nothing, but the total reached SEC's limit of 10 per second.

ADR 0009's worst case only counted peer loads: 3 in flight × 2.5 = 7.5 per second. It left out two cases:

- an export running beside peer loads;
- a second user.

An export also cost SEC limiter slots even when everything was cached. `loadIdentity` always asks for submissions. Next's fetch cache usually answers it, but the limiter runs before `fetch` and can't know that, so each company still took a slot.

## Decision

### (a) Exports reuse a recent submissions check

- **Recording:** every live identity check (ticker list + submissions) is also written to the persistent cache. The entry is keyed by ticker, analysis date and a **10-minute bucket**, and it stores the time the check ran.
- **Exports:** an export looks in the current bucket and the previous one. It accepts an entry at most **10 minutes** old (`IDENTITY_RECENT_SECONDS = 600`).
- **Result:** with that identity, the fundamentals come from the existing `(CIK, latest accession, methodology)` cache entry. An export of comps the browser has just loaded makes **zero** SEC requests (`tests/integration/exportReuse.test.ts`).
- **Scope:** only the export reuses checks. The page, `/api/fundamentals` and `/api/identity` always run the live check, so they discover new filings exactly as before.
- **Misses:** a lookup that misses runs a callback that throws, and neither `unstable_cache` nor the fixture `memoryCache` keeps a failed run.

**Why 10 minutes.** A workbench session normally exports within minutes of loading. Any filing SEC lists during that window can be missed by the export. Submissions are already fetch-cached for 6 hours (blueprint §14), so this adds at most 10 minutes to a delay that already exists.

### (b) Per-instance pacing 400 → 500 ms (2 requests per second)

`MIN_GAP_MS` in `src/sec/client.ts`. The in-flight cap stays at 3.

**Worst case for one user.** The Export button is disabled while any peer is loading. But a user can add a peer while an export is running. So at most these run at once:

| Running at once                         | Instances | Rate each | Total         |
| --------------------------------------- | --------- | --------- | ------------- |
| Peer loads (browser cap, ADR 0009)      | 3         | 2.0/s     | 6.0/s         |
| Export (target + peers on one instance) | 1         | 2.0/s     | 2.0/s         |
| **Total**                               | **4**     |           | **8.0/s ≤ 8** |

The target page itself doesn't overlap: it has finished before the browser starts peer loads (ADR 0009). With (a), an export of already-loaded comps adds 0, so the usual worst case is 6.0/s.

**Cost:**

- Cold peer: 7 gaps × 0.5 s = 3.5 s of pacing plus about 1 s of SEC response time, ≈ **4.5 s** (was ≈ 4.0 s at 400 ms).
- 8 cold peers at 3 in flight: 3 waves × ≈ 4.5 s ≈ **13.5 s** (was ≈ 12 s).
- Warm peers: unchanged, about 2–3 s for 8.

**Rejected alternative:** keep 400 ms and lock peer changes while an export runs. It covers fewer cases (a second tab still overlaps), and the UI gets more complicated.

### (c) Two users at the same moment: not capped

The limit is per instance, and Vercel may run each request on its own instance. So two users loading cold comps at the same moment can reach:

**2 × 8.0 = 16 requests per second** in theory. That is above SEC's 10 per second.

- **What happens then:** SEC may answer 429 or 403 for a moment.
- **How PeerSet reacts:** the affected row shows "SEC rate-limited" (blueprint §6), and PeerSet never retries a 403 (`CLAUDE.md`).
- **Why it is rare:** PeerSet's traffic is low, warm companies cost at most 1–2 limiter slots, and most identity checks are answered by the fetch cache.
- **Future work:** a hard global cap needs one limiter shared by every instance, which needs a datastore (for example Redis). That is out of scope for v1.1 (`CLAUDE.md`: no Redis).

## Revisit when

- SEC refuses a request in production;
- traffic grows enough that overlapping users are common;
- peer loading moves to one server request per analysis. Then one instance's limiter caps a user, and the per-instance rate could rise.
