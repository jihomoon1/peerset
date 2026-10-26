import { describe, expect, it } from "vitest";
import { selectFact, selectShareClassFacts } from "@/domain/factSelection";
import { parseInstance } from "@/sec/filingInstance";
import type { ReportedFinancialFact } from "@/domain/types";
import { fact, filing } from "../../helpers/facts";
import { fixtureText } from "../../helpers/fixtures";

const REV = "us-gaap:Revenues";
const FY24 = { start: "2024-01-01", end: "2024-12-31" };

const k2024 = filing(
  "0000000001-25-000010",
  "10-K",
  "2025-02-15",
  "2024-12-31",
);
const k2025 = filing(
  "0000000001-26-000010",
  "10-K",
  "2026-02-15",
  "2025-12-31",
);
const kA2024 = filing(
  "0000000001-25-000030",
  "10-K/A",
  "2025-06-01",
  "2024-12-31",
);
const q2 = filing("0000000001-26-000050", "10-Q", "2026-07-29", "2026-06-30");

const rev = (
  value: number,
  f = k2024,
  extra: Partial<Parameters<typeof fact>[0]> = {},
): ReportedFinancialFact =>
  fact({ concept: REV, value, ...FY24, filing: f, ...extra });

describe("selectFact — latest-filed rule (methodology §1 rule 1)", () => {
  it("returns the only matching fact", () => {
    const r = selectFact([rev(100)], REV, FY24);
    expect(r).toEqual({ kind: "found", fact: rev(100) });
  });

  it("returns none when nothing matches", () => {
    expect(selectFact([rev(100)], "us-gaap:NetIncomeLoss", FY24)).toEqual({
      kind: "none",
    });
  });

  it("uses a later filing's restated comparative over the original", () => {
    const r = selectFact([rev(100, k2024), rev(104, k2025)], REV, FY24);
    expect(r).toMatchObject({ kind: "found", fact: { value: 104 } });
  });

  it("uses an amendment filed after the original", () => {
    const r = selectFact([rev(100, k2024), rev(99, kA2024)], REV, FY24);
    expect(r).toMatchObject({
      kind: "found",
      fact: { value: 99, filing: { form: "10-K/A" } },
    });
  });

  it("matches the exact period only", () => {
    const shifted = fact({
      concept: REV,
      value: 50,
      start: "2024-01-02",
      end: "2024-12-31",
      filing: k2025,
    });
    const r = selectFact([rev(100), shifted], REV, FY24);
    expect(r).toMatchObject({ kind: "found", fact: { value: 100 } });
  });

  it("does not match an instant to a duration or the reverse", () => {
    const instant = fact({
      concept: REV,
      value: 7,
      end: "2024-12-31",
      filing: k2025,
    });
    expect(selectFact([instant], REV, FY24)).toEqual({ kind: "none" });
    expect(selectFact([rev(100)], REV, { end: "2024-12-31" })).toEqual({
      kind: "none",
    });
    expect(selectFact([instant], REV, { end: "2024-12-31" })).toMatchObject({
      kind: "found",
      fact: { value: 7 },
    });
  });

  it("ignores dimensional facts, even when filed later", () => {
    const segment = rev(40, k2025, {
      dimensions: { "srt:StatementGeographicalAxis": "country:US" },
    });
    const r = selectFact([rev(100), segment], REV, FY24);
    expect(r).toMatchObject({ kind: "found", fact: { value: 100 } });
  });

  it("ignores facts from non-periodic forms", () => {
    const eightK = {
      ...rev(1, k2025),
      filing: { ...k2025, form: "8-K" },
    } as unknown as ReportedFinancialFact;
    const r = selectFact([rev(100), eightK], REV, FY24);
    expect(r).toMatchObject({ kind: "found", fact: { value: 100 } });
  });

  describe("tie on filed date", () => {
    it("same accession, both sources agree: prefers the filing", () => {
      const cf = rev(100, q2, { source: "companyfacts" });
      const fi = rev(100, q2, { source: "filing" });
      expect(selectFact([cf, fi], REV, FY24)).toEqual({
        kind: "found",
        fact: fi,
      });
      expect(selectFact([fi, cf], REV, FY24)).toEqual({
        kind: "found",
        fact: fi,
      });
    });

    it("same accession, sources disagree: conflict", () => {
      const cf = rev(100, q2, { source: "companyfacts" });
      const fi = rev(101, q2, { source: "filing" });
      const r = selectFact([cf, fi], REV, FY24);
      expect(r.kind).toBe("conflict");
      if (r.kind === "conflict") expect(r.facts).toHaveLength(2);
    });

    it("different accessions filed the same day with equal values: takes the amendment", () => {
      const sameDay = { ...kA2024, filedDate: k2024.filedDate };
      const r = selectFact([rev(100, sameDay), rev(100, k2024)], REV, FY24);
      expect(r).toMatchObject({
        kind: "found",
        fact: { filing: { form: "10-K/A" } },
      });
    });

    it("different accessions filed the same day with different values: conflict", () => {
      const sameDay = { ...kA2024, filedDate: k2024.filedDate };
      const r = selectFact([rev(100, k2024), rev(90, sameDay)], REV, FY24);
      expect(r.kind).toBe("conflict");
    });
  });
});

describe("selectShareClassFacts — StatementClassOfStockAxis", () => {
  it("returns one fact per class from the WSO Q2 2026 cover page", () => {
    const wsoQ2 = filing(
      "0001193125-26-340204",
      "10-Q",
      "2026-08-07",
      "2026-06-30",
    );
    const { facts } = parseInstance(
      fixtureText("WSO/2026Q2", "wso-20260630_htm.xml.gz"),
      wsoQ2,
    );
    const classes = selectShareClassFacts(
      facts,
      "dei:EntityCommonStockSharesOutstanding",
      { end: "2026-08-04" },
    );
    expect(
      classes.map((c) => [
        c.classMember,
        c.selection.kind === "found" ? c.selection.fact.value : null,
      ]),
    ).toEqual([
      ["us-gaap:CommonClassBMember", 5_663_438],
      ["us-gaap:CommonStockMember", 35_588_756],
    ]);
  });

  it("ignores facts on other axes or with extra dimensions", () => {
    const q = filing(
      "0000000001-26-000050",
      "10-Q",
      "2026-07-29",
      "2026-06-30",
    );
    const axis = "us-gaap:StatementClassOfStockAxis";
    const shares = (value: number, dimensions: Record<string, string>) =>
      fact({
        concept: "dei:EntityCommonStockSharesOutstanding",
        value,
        end: "2026-07-20",
        filing: q,
        unit: "shares",
        dimensions,
      });
    const classes = selectShareClassFacts(
      [
        shares(10, { [axis]: "us-gaap:CommonClassAMember" }),
        shares(99, { "srt:ProductOrServiceAxis": "x:Y" }),
        shares(77, {
          [axis]: "us-gaap:CommonClassAMember",
          "srt:ConsolidationItemsAxis": "x:Z",
        }),
        shares(5, {}),
      ],
      "dei:EntityCommonStockSharesOutstanding",
      { end: "2026-07-20" },
    );
    expect(classes).toMatchObject([
      { selection: { kind: "found", fact: { value: 10 } } },
    ]);
  });

  it("returns a class whose same-day facts disagree as a conflict", () => {
    const q = filing(
      "0000000001-26-000050",
      "10-Q",
      "2026-07-29",
      "2026-06-30",
    );
    const axis = "us-gaap:StatementClassOfStockAxis";
    const shares = (value: number, source: "filing" | "companyfacts") =>
      fact({
        concept: "dei:EntityCommonStockSharesOutstanding",
        value,
        end: "2026-07-20",
        filing: q,
        unit: "shares",
        source,
        dimensions: { [axis]: "us-gaap:CommonClassAMember" },
      });
    const classes = selectShareClassFacts(
      [shares(10, "filing"), shares(11, "companyfacts")],
      "dei:EntityCommonStockSharesOutstanding",
      { end: "2026-07-20" },
    );
    expect(classes).toMatchObject([
      {
        classMember: "us-gaap:CommonClassAMember",
        selection: { kind: "conflict" },
      },
    ]);
  });
});
