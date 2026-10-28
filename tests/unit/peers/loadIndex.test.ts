import { describe, expect, it } from "vitest";
import { PeerIndexUnavailableError } from "@/lib/errors";
import { indexFromText, loadPeerIndex } from "@/peers/loadIndex";

describe("loadPeerIndex", () => {
  it("reads the committed index file", () => {
    const index = loadPeerIndex();
    expect(index.meta.methodologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(index.companies.length).toBe(index.meta.counts.listed);
  });

  it("a missing or broken file is PEER_INDEX_UNAVAILABLE", () => {
    const missing = () => {
      throw new Error("ENOENT");
    };
    expect(() => indexFromText(missing)).toThrow(PeerIndexUnavailableError);
    expect(() => indexFromText(() => '{"format":"other"}')).toThrow(
      PeerIndexUnavailableError,
    );
  });
});
