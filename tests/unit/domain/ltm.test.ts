import { describe, expect, it } from "vitest";
import { computeLtm, type LtmInput } from "@/domain/ltm";
import type {
  FilingReference,
  PeriodicForm,
  ReportedFinancialFact,
} from "@/domain/types";
import { fact, filing } from "../../helpers/facts";

// All facts are synthetic. Values are small integers so each expected LTM is easy to
// check by hand: LTM = FY + current YTD − prior-year YTD (methodology §2).

const REV = "us-gaap:Revenues";
const DDA = "us-gaap:DepreciationDepletionAndAmortization";
const DAAN = "us-gaap:DepreciationAmortizationAndAccretionNet";

let seq = 0;
const f = (form: PeriodicForm, filed: string, report: string) =>
  filing(
    `0000000001-26-${String(++seq).padStart(6, "0")}`,
    form,
    filed,
    report,
  );

const d = (
  concept: string,
  start: string,
  end: string,
  value: number,
  by: FilingReference,
  source: ReportedFinancialFact["source"] = "companyfacts",
) => fact({ concept, start, end, value, filing: by, source });

const input = (
  facts: ReportedFinancialFact[],
  ltmEnd: string,
  latestForm: PeriodicForm,
  freshness: LtmInput["freshness"] = "current",
): LtmInput => ({ facts, ltmEnd, latestForm, freshness });

function ok(r: ReturnType<typeof computeLtm>) {
  if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r;
}

describe("December year-end", () => {
  const k25 = f("10-K", "2026-02-15", "2025-12-31");
  const q1 = f("10-Q", "2026-04-28", "2026-03-31");
  const q2 = f("10-Q", "2026-07-28", "2026-06-30");
  const q3 = f("10-Q", "2026-10-27", "2026-09-30");
  const fy = d(REV, "2025-01-01", "2025-12-31", 1000, k25);

  it("after a 10-K, LTM is the fiscal year", () => {
    const r = ok(computeLtm(input([fy], "2025-12-31", "10-K"), [REV]));
    expect(r.value).toBe(1000);
    expect(r.calc.method).toBe("annual");
    expect(r.calc.fy).toBe(fy);
    expect(r.period).toEqual({
      kind: "duration",
      start: "2025-01-01",
      end: "2025-12-31",
    });
    expect(r.calc.checks).toEqual([
      expect.objectContaining({ name: "fiscal-year-duration", passed: true }),
    ]);
  });

  it("after a 10-K/A, LTM is also the fiscal year", () => {
    const r = ok(computeLtm(input([fy], "2025-12-31", "10-K/A"), [REV]));
    expect(r.value).toBe(1000);
  });

  it("after Q1: FY + Q1 − prior Q1", () => {
    const facts = [
      fy,
      d(REV, "2026-01-01", "2026-03-31", 260, q1),
      d(REV, "2025-01-01", "2025-03-31", 240, q1),
    ];
    const r = ok(computeLtm(input(facts, "2026-03-31", "10-Q"), [REV]));
    expect(r.value).toBe(1000 + 260 - 240);
    expect(r.calc.value).toBe(r.value);
    expect(r.calc.method).toBe("fy_plus_ytd_minus_prior_ytd");
    expect(r.period).toEqual({
      kind: "duration",
      start: "2025-04-01",
      end: "2026-03-31",
    });
    expect(r.calc.checks.every((c) => c.passed)).toBe(true);
    expect(r.calc.checks.map((c) => c.name)).toEqual([
      "fiscal-year-duration",
      "ytd-starts-after-fiscal-year",
      "prior-ytd-duration",
      "prior-ytd-start-offset",
      "same-concept",
    ]);
  });

  it("after Q2: uses the six-month YTD, not the three-month quarter", () => {
    const facts = [
      fy,
      d(REV, "2026-04-01", "2026-06-30", 270, q2), // Q2 alone: a distractor
      d(REV, "2026-01-01", "2026-06-30", 530, q2),
      d(REV, "2025-04-01", "2025-06-30", 255, q2), // prior Q2 alone: a distractor
      d(REV, "2025-01-01", "2025-06-30", 495, q2),
    ];
    const r = ok(computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]));
    expect(r.value).toBe(1000 + 530 - 495);
    expect(r.calc.ytdCurrent?.value).toBe(530);
    expect(r.calc.ytdPrior?.value).toBe(495);
  });

  it("after Q3: nine-month YTD", () => {
    const facts = [
      fy,
      d(REV, "2026-07-01", "2026-09-30", 280, q3),
      d(REV, "2026-01-01", "2026-09-30", 810, q3),
      d(REV, "2025-01-01", "2025-09-30", 760, q3),
    ];
    const r = ok(computeLtm(input(facts, "2026-09-30", "10-Q"), [REV]));
    expect(r.value).toBe(1000 + 810 - 760);
  });

  it("takes the prior-year YTD as restated in the latest filing", () => {
    const q2Of2025 = f("10-Q", "2025-07-28", "2025-06-30");
    const facts = [
      fy,
      d(REV, "2025-01-01", "2025-06-30", 480, q2Of2025), // as first filed
      d(REV, "2026-01-01", "2026-06-30", 530, q2),
      d(REV, "2025-01-01", "2025-06-30", 495, q2), // restated comparative
    ];
    const r = ok(computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]));
    expect(r.value).toBe(1000 + 530 - 495);
    expect(r.calc.ytdPrior?.filing.accession).toBe(q2.accession);
  });
});

describe("September year-end (JCI-like)", () => {
  it("fiscal Q3: FY to Sep 30 + 9-month YTD − prior 9-month YTD", () => {
    const k = f("10-K", "2025-11-14", "2025-09-30");
    const q = f("10-Q", "2026-07-29", "2026-06-30");
    const facts = [
      d(REV, "2024-10-01", "2025-09-30", 23_000, k),
      d(REV, "2025-10-01", "2026-06-30", 17_500, q),
      d(REV, "2024-10-01", "2025-06-30", 17_000, q),
    ];
    const r = ok(computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]));
    expect(r.value).toBe(23_000 + 17_500 - 17_000);
    expect(r.period).toMatchObject({ start: "2025-07-01", end: "2026-06-30" });
  });
});

describe("March year-end (Modine-like)", () => {
  it("fiscal Q2: FY to Mar 31 + 6-month YTD − prior 6-month YTD", () => {
    const k = f("10-K", "2026-05-20", "2026-03-31");
    const q = f("10-Q", "2026-11-05", "2026-09-30");
    const facts = [
      d(REV, "2025-04-01", "2026-03-31", 2_600, k),
      d(REV, "2026-04-01", "2026-09-30", 1_400, q),
      d(REV, "2025-04-01", "2025-09-30", 1_300, q),
    ];
    const r = ok(computeLtm(input(facts, "2026-09-30", "10-Q"), [REV]));
    expect(r.value).toBe(2_600 + 1_400 - 1_300);
  });
});

describe("52/53-week year ending the last Friday of December (Graco-like)", () => {
  // FY2025: Sat 2024-12-28 to Fri 2025-12-26, 52 weeks (364 days).
  // FY2026: Sat 2025-12-27 to Fri 2027-01-01, 53 weeks (371 days).
  const k25 = f("10-K", "2026-02-17", "2025-12-26");
  const k26 = f("10-K", "2027-02-16", "2027-01-01");
  const fy25 = d(REV, "2024-12-28", "2025-12-26", 2_100, k25);
  const fy26 = d(REV, "2025-12-27", "2027-01-01", 2_250, k26);

  it("52-week Q1: no 53-week warning", () => {
    const q = f("10-Q", "2026-04-22", "2026-03-27");
    const facts = [
      fy25,
      d(REV, "2025-12-27", "2026-03-27", 520, q),
      d(REV, "2024-12-28", "2025-03-28", 500, q),
    ];
    const r = ok(computeLtm(input(facts, "2026-03-27", "10-Q"), [REV]));
    expect(r.value).toBe(2_100 + 520 - 500);
    expect(r.warnings.map((w) => w.code)).not.toContain("W_53_WEEKS");
  });

  it("after the 10-K for a 53-week year: warns", () => {
    const r = ok(computeLtm(input([fy26], "2027-01-01", "10-K"), [REV]));
    expect(r.value).toBe(2_250);
    expect(r.calc.checks[0]).toMatchObject({ passed: true });
    expect(r.warnings).toContainEqual(
      expect.objectContaining({ code: "W_53_WEEKS" }),
    );
  });

  it("Q1 after a 53-week year: the window still holds 53 weeks, so warns", () => {
    const q = f("10-Q", "2027-04-21", "2027-04-02");
    const facts = [
      fy26,
      d(REV, "2027-01-02", "2027-04-02", 540, q), // 13 weeks
      d(REV, "2025-12-27", "2026-03-27", 520, q), // 13 weeks, a year earlier
    ];
    const r = ok(computeLtm(input(facts, "2027-04-02", "10-Q"), [REV]));
    expect(r.value).toBe(2_250 + 540 - 520);
    expect(r.calc.checks.every((c) => c.passed)).toBe(true);
    expect(r.period).toMatchObject({ start: "2026-03-28", end: "2027-04-02" });
    expect(r.warnings.map((w) => w.code)).toContain("W_53_WEEKS");
  });
});

describe("failing checks make the metric Unsupported, naming the check", () => {
  const k = f("10-K", "2026-02-15", "2025-12-31");
  const q = f("10-Q", "2026-07-28", "2026-06-30");

  function failed(
    facts: ReportedFinancialFact[],
    ltmEnd: string,
    form: PeriodicForm,
  ) {
    const r = computeLtm(input(facts, ltmEnd, form), [REV]);
    if (r.kind !== "unsupported") throw new Error("expected unsupported");
    expect(r.reason.code).toBe("LTM_CHECK_FAILED");
    expect(r.reason.message).toMatch(/^cannot reconstruct LTM/);
    return r;
  }

  it("fiscal year shorter than 350 days", () => {
    const r = failed(
      [d(REV, "2025-01-01", "2025-11-30", 900, k)],
      "2025-11-30",
      "10-K",
    );
    expect(r.reason.message).toContain("fiscal-year-duration");
    expect(r.calc?.checks[0]).toMatchObject({ passed: false });
    expect(r.calc).not.toHaveProperty("value"); // no LTM when a check fails
  });

  it("fiscal year longer than 378 days", () => {
    const r = failed(
      [d(REV, "2024-12-01", "2025-12-31", 1100, k)],
      "2025-12-31",
      "10-K",
    );
    expect(r.reason.message).toContain("fiscal-year-duration");
  });

  it("current YTD does not start the day after the fiscal year ends (±7 days)", () => {
    const r = failed(
      [
        d(REV, "2025-01-01", "2025-12-31", 1000, k),
        d(REV, "2026-01-20", "2026-06-30", 500, q),
        d(REV, "2025-01-20", "2025-06-30", 480, q),
      ],
      "2026-06-30",
      "10-Q",
    );
    expect(r.reason.message).toContain("ytd-starts-after-fiscal-year");
  });

  it("prior-year YTD length differs by more than 7 days", () => {
    const r = failed(
      [
        d(REV, "2025-01-01", "2025-12-31", 1000, k),
        d(REV, "2026-01-01", "2026-06-30", 500, q),
        d(REV, "2025-01-01", "2025-05-31", 400, q),
      ],
      "2026-06-30",
      "10-Q",
    );
    expect(r.reason.message).toContain("prior-ytd-duration");
    expect(r.reason.message).not.toContain("prior-ytd-start-offset");
  });

  it("prior-year YTD does not start about one year earlier (±10 days)", () => {
    const r = failed(
      [
        d(REV, "2025-01-01", "2025-12-31", 1000, k),
        d(REV, "2026-01-01", "2026-06-30", 500, q),
        d(REV, "2024-12-10", "2025-06-07", 480, q),
      ],
      "2026-06-30",
      "10-Q",
    );
    expect(r.reason.message).toContain("prior-ytd-start-offset");
    expect(r.reason.message).not.toContain("prior-ytd-duration");
  });
});

describe("missing components and concept choice (methodology §3)", () => {
  const k = f("10-K", "2026-02-15", "2025-12-31");
  const q = f("10-Q", "2026-07-28", "2026-06-30");

  it("Carrier-like D&A: priority 1 has only FY, priority 3 has all components → priority 3", () => {
    const facts = [
      d(DDA, "2025-01-01", "2025-12-31", 1_274, k),
      d(DAAN, "2025-01-01", "2025-12-31", 1_274, k),
      d(DAAN, "2026-01-01", "2026-06-30", 650, q),
      d(DAAN, "2025-01-01", "2025-06-30", 620, q),
    ];
    const r = ok(
      computeLtm(input(facts, "2026-06-30", "10-Q"), [
        DDA,
        "us-gaap:DepreciationAndAmortization",
        DAAN,
      ]),
    );
    expect(r.calc.concept).toBe(DAAN);
    expect(r.value).toBe(1_274 + 650 - 620);
    for (const c of [r.calc.fy, r.calc.ytdCurrent, r.calc.ytdPrior])
      expect(c?.concept).toBe(DAAN);
  });

  it("a concept whose latest FY is years old lacks the FY component, so the next concept is used", () => {
    const k23 = f("10-K", "2024-02-15", "2023-12-31");
    const facts = [
      d(DDA, "2023-01-01", "2023-12-31", 900, k23), // stopped tagging FY after 2023
      d(DDA, "2026-01-01", "2026-06-30", 650, q),
      d(DDA, "2025-01-01", "2025-06-30", 620, q),
      d(DAAN, "2025-01-01", "2025-12-31", 1_274, k),
      d(DAAN, "2026-01-01", "2026-06-30", 650, q),
      d(DAAN, "2025-01-01", "2025-06-30", 620, q),
    ];
    const r = ok(computeLtm(input(facts, "2026-06-30", "10-Q"), [DDA, DAAN]));
    expect(r.calc.concept).toBe(DAAN);
    expect(r.value).toBe(1_274 + 650 - 620);
  });

  it("never mixes concepts: priority 1 FY + priority 2 YTDs is not enough", () => {
    const facts = [
      d(DDA, "2025-01-01", "2025-12-31", 1_274, k),
      d(DAAN, "2026-01-01", "2026-06-30", 650, q),
      d(DAAN, "2025-01-01", "2025-06-30", 620, q),
    ];
    const r = computeLtm(input(facts, "2026-06-30", "10-Q"), [DDA, DAAN]);
    expect(r).toMatchObject({
      kind: "unsupported",
      reason: { code: "NO_CONCEPT_WITH_ALL_COMPONENTS" },
    });
  });

  it("a missing prior-year YTD makes the metric Unsupported and says which component", () => {
    const facts = [
      d(REV, "2025-01-01", "2025-12-31", 1000, k),
      d(REV, "2026-01-01", "2026-06-30", 500, q),
    ];
    const r = computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]);
    expect(r.kind).toBe("unsupported");
    if (r.kind === "unsupported")
      expect(r.reason.message).toContain("prior-year YTD");
  });

  it("a missing fiscal year makes the metric Unsupported", () => {
    const facts = [
      d(REV, "2026-01-01", "2026-06-30", 500, q),
      d(REV, "2025-01-01", "2025-06-30", 480, q),
    ];
    const r = computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]);
    expect(r).toMatchObject({
      kind: "unsupported",
      reason: { code: "NO_CONCEPT_WITH_ALL_COMPONENTS" },
    });
  });

  it("a fiscal year that ends after the LTM end is never used", () => {
    const r = computeLtm(
      input(
        [d(REV, "2025-01-01", "2025-12-31", 1000, k)],
        "2025-09-30",
        "10-Q",
      ),
      [REV],
    );
    expect(r.kind).toBe("unsupported");
  });
});

describe("freshness and sources", () => {
  const k = f("10-K", "2026-02-15", "2025-12-31");
  const q = f("10-Q", "2026-07-28", "2026-06-30");
  const facts = [
    d(REV, "2025-01-01", "2025-12-31", 1000, k),
    d(REV, "2026-01-01", "2026-06-30", 530, q, "filing"),
    d(REV, "2025-01-01", "2025-06-30", 495, q, "filing"),
  ];

  it("filing-missing: never computes LTM on an older quarter", () => {
    const r = computeLtm(input(facts, "2026-06-30", "10-Q", "filing-missing"), [
      REV,
    ]);
    expect(r).toMatchObject({
      kind: "unsupported",
      reason: { code: "FILING_MISSING" },
    });
  });

  it("filing-parsed: carries W_FILING_PARSED when a component came from the filing", () => {
    const r = ok(
      computeLtm(input(facts, "2026-06-30", "10-Q", "filing-parsed"), [REV]),
    );
    expect(r.value).toBe(1035);
    expect(r.warnings).toContainEqual(
      expect.objectContaining({ code: "W_FILING_PARSED", severity: "info" }),
    );
  });

  it("current: no W_FILING_PARSED", () => {
    const r = ok(computeLtm(input(facts, "2026-06-30", "10-Q"), [REV]));
    expect(r.warnings).toEqual([]);
  });

  it("a component whose two sources disagree is a source conflict", () => {
    const r = computeLtm(
      input(
        [...facts, d(REV, "2026-01-01", "2026-06-30", 531, q, "companyfacts")],
        "2026-06-30",
        "10-Q",
      ),
      [REV],
    );
    expect(r).toMatchObject({
      kind: "unsupported",
      reason: { code: "SOURCE_CONFLICT" },
      warnings: [expect.objectContaining({ code: "W_SOURCE_CONFLICT" })],
    });
  });

  it("names the cause of a conflict: two filings on the same day are not 'companyfacts vs filing'", () => {
    const other = { ...q, accession: "0000000001-26-999999" };
    const r = computeLtm(
      input(
        [...facts, d(REV, "2026-01-01", "2026-06-30", 531, other, "filing")],
        "2026-06-30",
        "10-Q",
      ),
      [REV],
    );
    if (r.kind !== "unsupported") throw new Error("expected unsupported");
    expect(r.reason.message).toContain("filed the same day disagree");
    expect(r.reason.message).not.toContain("companyfacts and the filing");
  });
});
