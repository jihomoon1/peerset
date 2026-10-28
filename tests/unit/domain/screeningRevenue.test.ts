import { describe, expect, it } from "vitest";
import { screeningRevenue } from "@/domain/screeningRevenue";
import type { PeriodicForm, ReportedFinancialFact } from "@/domain/types";
import { trimCompanyFacts } from "@/sec/companyFacts";
import { fixtureText } from "@/sec/fixtureFetch";
import { fact, filing } from "../../helpers/facts";

// Synthetic facts. Screening revenue is the latest fiscal year's revenue from a 10-K
// or 10-K/A (blueprint §10.1 step 4), chosen with the app's own revenue code.

const ASC606 = "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax";
const REVENUES = "us-gaap:Revenues";
const SALES = "us-gaap:SalesRevenueNet";

let seq = 0;
const by = (form: PeriodicForm, filed: string, report: string) =>
  filing(
    `0000000001-26-${String(++seq).padStart(6, "0")}`,
    form,
    filed,
    report,
  );

const rev = (
  concept: string,
  start: string,
  end: string,
  value: number,
  form: PeriodicForm,
  filed: string,
): ReportedFinancialFact =>
  fact({ concept, start, end, value, filing: by(form, filed, end) });

describe("screeningRevenue", () => {
  it("takes the latest fiscal year reported by a 10-K", () => {
    const r = screeningRevenue([
      rev(ASC606, "2024-01-01", "2024-12-31", 900, "10-K", "2025-02-15"),
      rev(ASC606, "2025-01-01", "2025-12-31", 1_000, "10-K", "2026-02-15"),
      // A 10-Q's year-to-date never counts, even when it is newer.
      rev(ASC606, "2026-01-01", "2026-06-30", 600, "10-Q", "2026-07-28"),
    ]);
    expect(r).toMatchObject({
      kind: "ok",
      value: 1_000,
      periodEnd: "2025-12-31",
      concept: ASC606,
    });
  });

  it("records the accession of the fact it used", () => {
    const fy = rev(
      REVENUES,
      "2025-01-01",
      "2025-12-31",
      500,
      "10-K",
      "2026-02-20",
    );
    const r = screeningRevenue([fy]);
    expect(r).toMatchObject({ kind: "ok", accession: fy.filing.accession });
  });

  it("uses the latest-filed value when a 10-K/A restates the year", () => {
    const r = screeningRevenue([
      rev(ASC606, "2025-01-01", "2025-12-31", 1_000, "10-K", "2026-02-15"),
      rev(ASC606, "2025-01-01", "2025-12-31", 1_050, "10-K/A", "2026-05-01"),
    ]);
    expect(r).toMatchObject({ kind: "ok", value: 1_050 });
  });

  it("accepts a 53-week fiscal year", () => {
    // 2024-12-29 to 2026-01-03 is 371 days, inside 350–378.
    const r = screeningRevenue([
      rev(ASC606, "2024-12-29", "2026-01-03", 2_000, "10-K", "2026-02-25"),
    ]);
    expect(r).toMatchObject({
      kind: "ok",
      value: 2_000,
      periodEnd: "2026-01-03",
    });
  });

  it("follows a concept switch to the concept the latest year uses", () => {
    const r = screeningRevenue([
      rev(SALES, "2017-01-01", "2017-12-31", 700, "10-K", "2018-02-15"),
      rev(ASC606, "2025-01-01", "2025-12-31", 1_000, "10-K", "2026-02-15"),
    ]);
    expect(r).toMatchObject({ kind: "ok", concept: ASC606, value: 1_000 });
  });

  it("has no screening revenue when the latest year fails the 350–378 day check", () => {
    // 2025-01-01 to 2026-01-20 is 385 days.
    const r = screeningRevenue([
      rev(ASC606, "2024-01-01", "2024-12-31", 900, "10-K", "2025-02-15"),
      rev(ASC606, "2025-01-01", "2026-01-20", 1_000, "10-K", "2026-03-01"),
    ]);
    expect(r.kind).toBe("none");
  });

  it("has no screening revenue without any 10-K revenue fact", () => {
    expect(screeningRevenue([])).toEqual({
      kind: "none",
      reason: "no fiscal-year revenue in a 10-K or 10-K/A",
    });
    expect(
      screeningRevenue([
        rev(ASC606, "2026-01-01", "2026-06-30", 600, "10-Q", "2026-07-28"),
      ]).kind,
    ).toBe("none");
  });

  it("prefers the larger Revenues total when two concepts disagree", () => {
    const r = screeningRevenue([
      rev(ASC606, "2025-01-01", "2025-12-31", 1_000, "10-K", "2026-02-15"),
      rev(REVENUES, "2025-01-01", "2025-12-31", 1_100, "10-K", "2026-02-15"),
    ]);
    expect(r).toMatchObject({ kind: "ok", value: 1_100, concept: REVENUES });
  });
});

describe("screeningRevenue on LII's saved filing", () => {
  it("is FY2025 net sales from the 10-K (docs/reconciliation/LII.md: 5,195.3)", () => {
    const raw = JSON.parse(fixtureText("LII/2026Q2", "companyfacts.json.gz"));
    expect(screeningRevenue(trimCompanyFacts(raw).facts)).toEqual({
      kind: "ok",
      value: 5_195_300_000,
      periodEnd: "2025-12-31",
      concept: "us-gaap:Revenues",
      accession: "0001069202-26-000028",
    });
  });
});
