import { describe, expect, it } from "vitest";
import {
  buildFundamentals,
  type FundamentalsInput,
} from "@/domain/fundamentals";
import type { CompanyIdentity, ReportedFinancialFact } from "@/domain/types";
import { fact, filing } from "../../helpers/facts";

const k25 = filing("0000000001-26-000010", "10-K", "2026-02-15", "2025-12-31");
const q2 = filing("0000000001-26-000050", "10-Q", "2026-07-28", "2026-06-30");

function series(
  concept: string,
  [fy, ytd, prior]: number[],
  unit: ReportedFinancialFact["unit"] = "USD",
) {
  return [
    fact({
      concept,
      value: fy,
      start: "2025-01-01",
      end: "2025-12-31",
      filing: k25,
      unit,
    }),
    fact({
      concept,
      value: ytd,
      start: "2026-01-01",
      end: "2026-06-30",
      filing: q2,
      unit,
      source: "filing",
    }),
    fact({
      concept,
      value: prior,
      start: "2025-01-01",
      end: "2025-06-30",
      filing: q2,
      unit,
      source: "filing",
    }),
  ];
}

const identity: CompanyIdentity = {
  cik: "0000000001",
  ticker: "SYN",
  name: "Synthetic Corp",
  exchange: "NYSE",
  tickers: [{ ticker: "SYN", exchange: "NYSE" }],
  sic: "3585",
  sicDescription: "Air-Cond & Warm Air Heating Equip",
  fiscalYearEnd: "1231",
  stateOfIncorporation: "DE",
  latestPeriodic: { ...q2, primaryDocument: "syn-20260630.htm" },
  support: { supported: true },
};

const input = (
  status: FundamentalsInput["freshness"]["status"],
): FundamentalsInput => ({
  identity,
  facts: [
    ...series("us-gaap:Revenues", [1000, 530, 495]),
    ...series("us-gaap:OperatingIncomeLoss", [200, 110, 100]),
    ...series("us-gaap:DepreciationAndAmortization", [50, 26, 25]),
    ...series("us-gaap:NetIncomeLoss", [150, 80, 70]),
    ...series("us-gaap:EarningsPerShareDiluted", [1.5, 0.8, 0.7], "USD/shares"),
    fact({
      concept: "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
      value: 100,
      start: "2025-01-01",
      end: "2025-12-31",
      filing: k25,
      unit: "shares",
    }),
    ...(status === "filing-missing"
      ? []
      : [
          ["us-gaap:CashAndCashEquivalentsAtCarryingValue", 40],
          ["us-gaap:LongTermDebtNoncurrent", 300],
          ["us-gaap:MinorityInterest", 5],
        ].map(([concept, value]) =>
          fact({
            concept: concept as string,
            value: value as number,
            end: "2026-06-30",
            filing: q2,
            source: "filing",
          }),
        )),
  ],
  textFacts: [],
  balanceSheet: {
    date: "2026-06-30",
    face:
      status === "filing-missing"
        ? { kind: "unavailable", reason: "filing index returned 404" }
        : {
            kind: "face",
            url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000050/R2.htm",
            statement: "Consolidated Balance Sheets",
            scale: "Millions",
            lines: [
              ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "Cash", "40"],
              ["us-gaap:Assets", "Total assets", "900"],
              ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", "300"],
              ["us-gaap:MinorityInterest", "Noncontrolling interest", "5"],
            ].map(([concept, label, displayed], i) => ({
              order: i + 1,
              concept,
              label,
              total: label.startsWith("Total"),
              displayed,
            })),
          },
  },
  freshness: {
    status,
    latestAccession: q2.accession,
    companyfactsNewestAccession: k25.accession,
  },
  warnings:
    status === "filing-parsed"
      ? [{ code: "W_FILING_PARSED", message: "parsed" }]
      : [],
});

describe("buildFundamentals", () => {
  const f = buildFundamentals(input("filing-parsed"));

  it("composes all seven metrics", () => {
    const values = Object.fromEntries(
      Object.entries(f.metrics).map(([k, m]) => [
        k,
        m.status === "reported" || m.status === "derived" ? m.value : m.status,
      ]),
    );
    expect(values).toEqual({
      revenue: 1035,
      operatingIncome: 210,
      da: 51,
      ebitda: 261,
      ebitdaMargin: 261 / 1035,
      netIncome: 160,
      dilutedEps: expect.closeTo(1.6, 10),
    });
  });

  it("carries identity, LTM end, freshness, warnings and the methodology version", () => {
    expect(f.identity.ticker).toBe("SYN");
    expect(f.ltmEnd).toBe("2026-06-30");
    expect(f.freshness.status).toBe("filing-parsed");
    expect(f.warnings.map((w) => w.code)).toEqual(["W_FILING_PARSED"]);
    expect(f.methodologyVersion).toBe("0.3.2");
  });

  it("keeps each metric's LTM calculation for the drawer", () => {
    expect(Object.keys(f.ltmDetail).sort()).toEqual(
      ["da", "dilutedEps", "netIncome", "operatingIncome", "revenue"].sort(),
    );
    expect(f.ltmDetail.revenue.method).toBe("fy_plus_ytd_minus_prior_ytd");
  });

  it("records the EPS cross-check and split flag", () => {
    expect(f.eps.crossCheck.status).toBe("checked");
    expect(f.eps.splitSinceLastAnnual).toBe(false);
  });

  it("adds debt, cash and the EV adjustments from the balance-sheet face", () => {
    expect(f.balanceSheet).toEqual({
      date: "2026-06-30",
      statement: {
        url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000050/R2.htm",
        name: "Consolidated Balance Sheets",
        scale: "Millions",
      },
    });
    expect(f.debt.metric).toMatchObject({ status: "derived", value: 300 });
    expect(f.cash.metric).toMatchObject({ status: "derived", value: 40 });
    expect(f.evAdjustments.nci.metric).toMatchObject({ value: 5 });
    expect(f.evAdjustments.preferred.metric.status).toBe("missing");
  });

  it("is plain JSON: a round trip changes nothing", () => {
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });

  it("filing-missing: every metric is Unsupported, none computed on an older quarter", () => {
    const g = buildFundamentals(input("filing-missing"));
    for (const m of Object.values(g.metrics))
      expect(m.status).toBe("unsupported");
    expect(g.balanceSheet.statement).toBeNull();
    expect(g.debt.metric.status).toBe("missing");
    expect(g.cash.metric.status).toBe("missing");
  });
});
