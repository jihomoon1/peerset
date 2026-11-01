// The export's server path on the frozen fixtures (M5): the same deps fixture mode
// uses, with fixed clocks, and the comps-golden request.

import { readFileSync } from "node:fs";
import path from "node:path";
import { memoryCache } from "@/lib/cache";
import type { ExportDeps } from "@/lib/exportSnapshot";
import { FIXTURE_AS_OF } from "@/lib/fixtureMode";
import { indexFromText } from "@/peers/loadIndex";
import { createLimiter, createSecClient } from "@/sec/client";
import { allFixtureDirs, fixtureFetch } from "@/sec/fixtureFetch";

export const compsGolden = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/golden/comps-LII-2026Q2.json"),
    "utf8",
  ),
);

export const PULLED_AT = "2026-10-26T12:00:00.000Z";
export const GENERATED_AT = "2026-10-26T15:30:00.000Z";

export function fixtureDeps(): ExportDeps {
  return {
    load: {
      client: createSecClient({
        fetch: fixtureFetch(
          allFixtureDirs({
            pins: "AAON:2026Q2,CARR:2026Q2,GGG:2026Q3,JCI:2026Q2,LII:2026Q2,TT:2026Q2,WSO:2026Q2",
          }),
        ).fetch,
        env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
        logger: () => {},
        limiter: createLimiter(0),
      }),
      cache: memoryCache(),
      asOf: FIXTURE_AS_OF,
      logger: () => {},
      now: () => new Date(PULLED_AT),
    },
    peers: {
      index: () =>
        indexFromText(() =>
          readFileSync(
            path.join(
              process.cwd(),
              "tests/fixtures/peer-index/fixture-peer-index.json",
            ),
            "utf8",
          ),
        ),
      analysisDate: FIXTURE_AS_OF,
      logger: () => {},
    },
    now: () => new Date(GENERATED_AT),
    appVersion: "9.9.9-test",
  };
}

// The fixture index suggests GGG, AAON, CARR and JCI for LII; the golden set swaps
// GGG for TT and WSO, the same state as /c/LII?add=TT,WSO&remove=GGG.
export const GOLDEN_REQUEST = {
  target: "LII",
  add: ["TT", "WSO"],
  remove: ["GGG"],
  prices: compsGolden.prices.close as Record<string, number>,
  priceDate: compsGolden.prices.asOfDate as string,
};
