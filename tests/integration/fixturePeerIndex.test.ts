import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURE_AS_OF } from "@/lib/fixtureMode";
import { decodeIndex, encodeIndex } from "@/peers/indexFormat";
import { peerIndexPath } from "@/peers/loadIndex";
import { findTarget, screenPeers } from "@/peers/screen";
import {
  buildFixtureIndex,
  FIXTURE_INDEX_PATH,
} from "../fixtures/peer-index/build-fixture-index";

// Fixture mode screens peers from a small index over the frozen SEC fixtures (M4b),
// so e2e never depends on the live index or the clock.

const committed = readFileSync(FIXTURE_INDEX_PATH, "utf8");
const index = decodeIndex(JSON.parse(committed));

describe("fixture peer index", () => {
  it("is up to date with the frozen fixtures (regenerate with build-fixture-index.ts)", () => {
    expect(committed).toBe(encodeIndex(buildFixtureIndex()));
  });

  it("is the file fixture mode reads", () => {
    expect(peerIndexPath({ PEERSET_SEC_FIXTURES: "1" })).toMatch(
      /tests\/fixtures\/peer-index\/fixture-peer-index\.json$/,
    );
    expect(peerIndexPath({})).toMatch(/data\/peer-index\.json$/);
  });

  it("gives LII four SIC matches, widened to the 2-digit group 35", () => {
    const lii = findTarget(index, "LII", FIXTURE_AS_OF);
    const r = screenPeers(index, lii, { analysisDate: FIXTURE_AS_OF });
    expect(r.tier).toBe("sic2");
    // Ranked by |ln(peer ÷ LII)| on screening revenue.
    expect(r.selected.map((p) => p.ticker).sort()).toEqual([
      "AAON",
      "CARR",
      "GGG",
      "JCI",
    ]);
  });
});
