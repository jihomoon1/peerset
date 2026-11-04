# 0012 — SEC pacing in v1.1: 2 peers at a time, 600 ms per instance, exports reuse recent checks

Date: November 2, 2026 · Status: approved by Jiho Moon in v1.1 planning · Supersedes the pacing numbers of ADR 0009 · **Amended November 4, 2026** after the v1.1 live check (section d), approved by Jiho Moon: the browser loads 2 peers at a time (was 3) and request starts are 600 ms apart (was 500 ms). Sections (b) and (c) keep their original reasoning; their numbers are replaced by (d)

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

### (d) Amendment after the live check (November 4, 2026)

**What production showed.** On 2026-11-04 the live check loaded `/c/LII` with 7 peers. All 42 SEC requests returned 200, with no 403s and no retries, but the peak was **9–10 requests in one second**, above the cap of 8.

- At 04:45:27 UTC the browser started 3 peer loads together. Each sent the ticker list and its submissions request. Start times are the logged end time minus `ms`, which includes the wait for a limiter slot. Within each load the two starts were 0.5 s apart, as designed.
- Six to seven starts landed within about one second, on top of the page's own two.

**What (b) got wrong.** "2 per second per instance" counts starts in a half-open second. A limiter that spaces starts 500 ms apart can start at 0, 0.5 and 1.0 s, so a 1-second window with both ends included holds **3**. Counted that way, (b)'s worst case is 4 × 3 = 12, and 2 loads plus an export is 3 × 3 = 9.

**Decision.**

- **Browser:** at most **2** peer loads in flight (`PEER_LOAD_CONCURRENCY`).
- **Server:** request starts at least **600 ms** apart (`MIN_GAP_MS`). Starts at 0 and 0.6 s mean the next falls at 1.2 s, so any 1-second window, ends included, holds at most **2** per instance (`tests/unit/sec/client.test.ts`).

**Worst case for one user** (starts in any 1-second window, ends included):

| Running at once                                  | Instances | 500 ms (before) | 600 ms (now) |
| ------------------------------------------------ | --------- | --------------- | ------------ |
| 2 peer loads                                     | 2         | 6               | 4            |
| 2 peer loads + an export (peer added mid-export) | 3         | 9               | 6            |
| … + a reload's server render of the page         | 4         | 12              | **8 ≤ 8**    |

An export of already-loaded comps still adds 0 (section a).

**Rejected:**

- _Staggering the two loads' start times by 0.5 s._ It only offsets the first pair: with starts at 0, 0.5, 1.0 and 0.5, 1.0, 1.5, the window from 0.5 to 1.5 s still holds 6. Each later peer starts whenever an earlier one finishes, so the offset is lost.
- _Locking peer changes while an export runs._ Gives 6 but leaves the reload and second-tab cases, and complicates the UI (as in b).
- _1,000 ms per instance._ Caps the rate but slows every load, including a single company, by about 2×.

**Cost:**

- Cold peer: 7 gaps × 0.6 s = 4.2 s of pacing plus about 1 s of SEC response time, ≈ **5.2 s**.
- 8 cold peers at 2 in flight: 4 waves × ≈ 5.2 s ≈ **21 s** (was ≈ 13.5 s).
- Warm peers: 1–2 limiter slots each (about 0.6–1 s), so 4 waves ≈ **2.5–4 s** for 8 (was 2–3 s).

**Two users (c)** become 2 × 8 = 16 in theory, unchanged in kind: still above SEC's 10 per second, still needing a shared limiter.

**Check:** confirm the peak in `vercel logs` after the next production deploy.

## Revisit when

- SEC refuses a request in production;
- traffic grows enough that overlapping users are common;
- peer loading moves to one server request per analysis. Then one instance's limiter caps a user, and the per-instance rate could rise.
