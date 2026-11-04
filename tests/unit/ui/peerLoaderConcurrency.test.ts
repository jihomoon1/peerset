import { describe, expect, it } from "vitest";
import { PEER_LOAD_CONCURRENCY } from "@/ui/usePeerLoader";

// ADR 0012 (v1.1 live check): the browser loads at most 2 peers at once, so one
// visitor's SEC rate stays within the worst case written in the ADR.
describe("peer load concurrency", () => {
  it("is 2 (ADR 0012, live check of 2026-11-04)", () => {
    expect(PEER_LOAD_CONCURRENCY).toBe(2);
  });
});
