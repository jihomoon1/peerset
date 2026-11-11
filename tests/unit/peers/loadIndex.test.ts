import { describe, expect, it } from "vitest";
import { PeerIndexUnavailableError } from "@/lib/errors";
import { decodeIndex, encodeIndex } from "@/peers/indexFormat";
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

describe("index format 2 (§13E) and format 1", () => {
  it("round-trips each company's kind and a bank's total assets", () => {
    const one = loadPeerIndex();
    const base = one.companies[0];
    const bank = {
      ...base,
      cik: "0000000099",
      kind: "bank" as const,
      totalAssets: {
        value: 123_456_000_000,
        accession: "0000000099-26-000001",
      },
    };
    const lender = {
      ...base,
      cik: "0000000098",
      kind: null,
      totalAssets: null,
    };
    const back = decodeIndex(
      JSON.parse(encodeIndex({ ...one, companies: [base, bank, lender] })),
    );
    expect(back.kindsRecorded).toBe(true);
    // Rows are sorted by CIK.
    expect(back.companies.map((c) => [c.cik, c.kind, c.totalAssets])).toEqual([
      ["0000000098", null, null],
      ["0000000099", "bank", bank.totalAssets],
      [base.cik, base.kind, null],
    ]);
  });

  it("still reads a format-1 file: financial SICs get no kind, the rest are operating", () => {
    const v2 = JSON.parse(encodeIndex(loadPeerIndex()));
    const v1 = {
      ...v2,
      format: "peerset-peer-index/1",
      fields: v2.fields.slice(0, 9),
      rows: [
        ...v2.rows.slice(0, 1).map((r: unknown[]) => r.slice(0, 9)),
        [
          "0000000097",
          "Bank Corp",
          [["BNK", "NYSE"]],
          "6021",
          "1231",
          "DE",
          null,
          null,
          "x",
        ],
      ],
    };
    const back = decodeIndex(v1);
    expect(back.kindsRecorded).toBe(false);
    expect(back.companies.at(-1)!.kind).toBeNull();
    expect(
      back.companies
        .filter((c) => c.sic !== "6021")
        .every((c) => c.kind === "operating" || c.sic === ""),
    ).toBe(true);
  });
});
