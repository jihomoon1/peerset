import { describe, expect, it } from "vitest";
import { memoryCache } from "@/lib/cache";
import { loadExportSnapshot } from "@/lib/exportSnapshot";
import { loadFundamentals, type LoadDeps } from "@/lib/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { allFixtureDirs, fixtureFetch } from "@/sec/fixtureFetch";
import { fixtureDeps, GOLDEN_REQUEST } from "../helpers/exportFixture";
import { FIXTURE_PINS } from "../helpers/fixturePins";

// ADR 0012 (v1.1): exporting comps the browser just loaded makes no SEC request. The
// browser's loads ran the submissions checks within the last 10 minutes and the
// fundamentals are cached, so the export reuses both. Older than 10 minutes, the
// export checks SEC again.

const SLOW = 30_000;
const LOADED_AT = Date.parse("2026-10-26T15:00:00.000Z");

function sharedDeps() {
  const fake = fixtureFetch(allFixtureDirs({ pins: FIXTURE_PINS }));
  let now = LOADED_AT;
  const load: LoadDeps = {
    client: createSecClient({
      fetch: fake.fetch,
      env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
      logger: () => {},
      limiter: createLimiter(0),
    }),
    cache: memoryCache(), // one cache for the "browser's" loads and the export
    asOf: fixtureDeps().load.asOf,
    logger: () => {},
    now: () => new Date(now),
  };
  const deps = { ...fixtureDeps(), load };
  return {
    deps,
    requested: fake.requested,
    setClock: (ms: number) => {
      now = ms;
    },
  };
}

// What the workbench loads for GOLDEN_REQUEST: the target and its active peers.
async function loadComps(load: LoadDeps) {
  const snapshot = await loadExportSnapshot(GOLDEN_REQUEST, {
    ...fixtureDeps(),
    load,
  });
  // the page and /api/fundamentals load without reuse, as in production
  for (const t of [
    snapshot.table.target.ticker,
    ...snapshot.table.peers.map((p) => p.ticker),
  ])
    await loadFundamentals(t, load).catch(() => undefined);
  return snapshot;
}

describe("export after the comps view loaded", { timeout: SLOW }, () => {
  it("makes zero SEC requests within 10 minutes", async () => {
    const { deps, requested, setClock } = sharedDeps();
    await loadComps(deps.load);
    const before = requested.length;
    expect(before).toBeGreaterThan(0);

    setClock(LOADED_AT + 60_000);
    const snapshot = await loadExportSnapshot(GOLDEN_REQUEST, deps);
    expect(requested.length - before).toBe(0);
    expect(snapshot.table.peers.length).toBeGreaterThan(0);
  });

  it("checks SEC again after 10 minutes", async () => {
    const { deps, requested, setClock } = sharedDeps();
    await loadComps(deps.load);
    const before = requested.length;

    setClock(LOADED_AT + 11 * 60_000);
    await loadExportSnapshot(GOLDEN_REQUEST, deps);
    const after = requested.slice(before);
    expect(after.length).toBeGreaterThan(0);
    // only identity checks: fundamentals are still cached
    expect(after.every((u) => /submissions|company_tickers/.test(u))).toBe(
      true,
    );
  });
});
