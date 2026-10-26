import { describe, expect, it } from "vitest";
import {
  computeShareClasses,
  normalizeSymbol,
  type ShareClassInput,
} from "@/domain/capitalization";
import { fact, filing, textFact } from "../../helpers/facts";
import { fixtureFundamentals } from "../../helpers/fundamentals";

// Methodology §6: cover-page shares from the latest filing's instance, one entry per
// class, each mapped to SEC's listing through the cover's dei:TradingSymbol.

const q2 = filing("0000000001-26-000050", "10-Q", "2026-07-28", "2026-06-30");
const older = filing(
  "0000000001-26-000020",
  "10-Q",
  "2026-04-28",
  "2026-03-31",
);
const SHARES = "dei:EntityCommonStockSharesOutstanding";
const AXIS = "us-gaap:StatementClassOfStockAxis";
const COMMON = "us-gaap:CommonStockMember";
const CLASS_B = "us-gaap:CommonClassBMember";

const shares = (value: number, member?: string, end = "2026-08-04", f = q2) =>
  fact({
    concept: SHARES,
    value,
    end,
    filing: f,
    unit: "shares",
    source: "filing",
    dimensions: member ? { [AXIS]: member } : {},
  });

const symbol = (value: string, member?: string) =>
  textFact({
    concept: "dei:TradingSymbol",
    value,
    start: "2026-01-01",
    end: "2026-06-30",
    filing: q2,
    dimensions: member ? { [AXIS]: member } : {},
  });

function input(over: Partial<ShareClassInput>): ShareClassInput {
  return {
    facts: [],
    textFacts: [],
    latest: q2,
    listings: [{ ticker: "SYN", exchange: "NYSE" }],
    balanceSheetDate: "2026-06-30",
    ...over,
  };
}

describe("normalizeSymbol", () => {
  it.each(["WSOB", "WSO-B", "WSO.B", "wso/b", "WSOB ", " WSO B"])(
    "%s normalizes to WSOB",
    (s) => expect(normalizeSymbol(s)).toBe("WSOB"),
  );
});

describe("computeShareClasses", () => {
  it("one consolidated class takes the matching SEC listing", () => {
    const r = computeShareClasses(
      input({ facts: [shares(1_000_000)], textFacts: [symbol("SYN")] }),
    );
    expect(r.blocker).toBeUndefined();
    expect(r.classes).toHaveLength(1);
    expect(r.classes[0]).toMatchObject({
      classMember: "single",
      ticker: "SYN",
      exchange: "NYSE",
      shares: 1_000_000,
      sharesAsOf: "2026-08-04",
    });
    expect(r.classes[0].coverFiling.accession).toBe(q2.accession);
  });

  it("two classes map to SEC's spelling of each ticker", () => {
    const r = computeShareClasses(
      input({
        facts: [shares(35_588_756, COMMON), shares(5_663_438, CLASS_B)],
        textFacts: [symbol("WSO", COMMON), symbol("WSOB ", CLASS_B)],
        listings: [
          { ticker: "WSO", exchange: "NYSE" },
          { ticker: "WSO-B", exchange: "NYSE" },
        ],
      }),
    );
    expect(r.blocker).toBeUndefined();
    expect(r.classes.map((c) => [c.classMember, c.ticker, c.shares])).toEqual([
      [CLASS_B, "WSO-B", 5_663_438],
      [COMMON, "WSO", 35_588_756],
    ]);
  });

  it("consolidated shares ignore cover symbols for notes that SEC doesn't list", () => {
    // Carrier and Trane tag their listed senior notes as classes on the cover.
    const r = computeShareClasses(
      input({
        facts: [shares(824_325_057)],
        textFacts: [
          symbol("SYN", COMMON),
          symbol("SYN28", "syn:SeniorNotesDue2028Member"),
        ],
      }),
    );
    expect(r.blocker).toBeUndefined();
    expect(r.classes[0]).toMatchObject({
      classMember: "single",
      ticker: "SYN",
    });
  });

  it("a class with no cover symbol is unlisted, so market cap is Unsupported", () => {
    const r = computeShareClasses(
      input({
        facts: [shares(100, COMMON), shares(20, CLASS_B)],
        textFacts: [symbol("SYN", COMMON)],
      }),
    );
    expect(r.classes.find((c) => c.classMember === CLASS_B)?.ticker).toBe(
      undefined,
    );
    expect(r.blocker).toEqual({
      status: "unsupported",
      reason: {
        code: "UNLISTED_SHARE_CLASS",
        message: `unlisted share class: ${CLASS_B}`,
      },
    });
  });

  it("a single class with no symbol on the cover is unlisted", () => {
    const r = computeShareClasses(input({ facts: [shares(1_000)] }));
    expect(r.blocker).toMatchObject({
      status: "unsupported",
      reason: { code: "UNLISTED_SHARE_CLASS" },
    });
    expect(
      r.blocker?.status === "unsupported" && r.blocker.reason.message,
    ).toBe(
      "unlisted share class: single (no dei:TradingSymbol on the cover page)",
    );
  });

  it("a cover symbol SEC doesn't list is kept, with a caution", () => {
    const r = computeShareClasses(
      input({ facts: [shares(1_000)], textFacts: [symbol("NEWT")] }),
    );
    expect(r.blocker).toBeUndefined();
    expect(r.classes[0].ticker).toBe("NEWT");
    expect(r.warnings.map((w) => [w.code, w.severity])).toContainEqual([
      "W_TICKER_NOT_IN_SEC_LIST",
      "caution",
    ]);
  });

  it("one share count for two listed classes is Unsupported, never split", () => {
    const r = computeShareClasses(
      input({
        facts: [shares(1_000)],
        textFacts: [symbol("SYN", COMMON), symbol("SYNB", CLASS_B)],
        listings: [
          { ticker: "SYN", exchange: "NYSE" },
          { ticker: "SYN-B", exchange: "NYSE" },
        ],
      }),
    );
    expect(r.blocker).toMatchObject({
      status: "unsupported",
      reason: { code: "SHARE_CLASS_MISMATCH" },
    });
  });

  it("no cover share count is Missing", () => {
    const r = computeShareClasses(input({ textFacts: [symbol("SYN")] }));
    expect(r.classes).toEqual([]);
    expect(r.blocker).toEqual({
      status: "missing",
      reason: "no cover-page share count in the latest filing",
    });
  });

  it("reads only the latest filing's cover, not an older one", () => {
    const r = computeShareClasses(
      input({
        facts: [shares(900, undefined, "2026-05-01", older), shares(1_000)],
        textFacts: [symbol("SYN")],
      }),
    );
    expect(r.classes.map((c) => c.shares)).toEqual([1_000]);
  });

  it("notes a cover date after the balance sheet (informational)", () => {
    const r = computeShareClasses(
      input({ facts: [shares(1_000)], textFacts: [symbol("SYN")] }),
    );
    expect(r.warnings).toContainEqual({
      code: "W_SHARES_AFTER_BALANCE_SHEET",
      message:
        "shares are as of 2026-08-04 (cover page), after the 2026-06-30 balance sheet",
      severity: "info",
    });
  });

  it("a class whose count conflicts within the filing is Unsupported", () => {
    const r = computeShareClasses(
      input({
        facts: [shares(100, COMMON), shares(101, COMMON)],
        textFacts: [symbol("SYN", COMMON)],
      }),
    );
    expect(r.blocker).toMatchObject({
      status: "unsupported",
      reason: { code: "SOURCE_CONFLICT" },
    });
  });
});

describe("share classes from the frozen fixtures", () => {
  it("LII: one class, 34,560,675 shares as of 2026-07-22", async () => {
    const f = await fixtureFundamentals("LII");
    expect(f.shareClasses.blocker).toBeUndefined();
    expect(
      f.shareClasses.classes.map((c) => [
        c.classMember,
        c.ticker,
        c.shares,
        c.sharesAsOf,
      ]),
    ).toEqual([["single", "LII", 34_560_675, "2026-07-22"]]);
    expect(f.shareClasses.classes[0].coverFiling.accession).toBe(
      "0001069202-26-000087",
    );
  });

  it("WSO: Common → WSO, Class B → WSO-B, as of 2026-08-04", async () => {
    const f = await fixtureFundamentals("WSO");
    expect(f.shareClasses.blocker).toBeUndefined();
    expect(
      f.shareClasses.classes.map((c) => [
        c.classMember,
        c.ticker,
        c.coverSymbol,
        c.shares,
        c.sharesAsOf,
      ]),
    ).toEqual([
      [CLASS_B, "WSO-B", "WSOB", 5_663_438, "2026-08-04"],
      [COMMON, "WSO", "WSO", 35_588_756, "2026-08-04"],
    ]);
    expect(f.shareClasses.warnings.map((w) => w.code)).toEqual([
      "W_SHARES_AFTER_BALANCE_SHEET",
    ]);
  });
});

// The other balance-sheet fixtures: one consolidated count each. Carrier and Trane
// also list senior notes on the cover; those symbols must not become share classes.
describe.each([
  ["AAON", 82_453_639, "2026-08-06"],
  ["CARR", 824_325_057, "2026-07-15"],
  ["GGG", 160_375_132, "2026-10-07"],
  ["TT", 220_023_177, "2026-07-24"],
] as const)("%s cover page", (ticker, count, asOf) => {
  it("is one listed class", async () => {
    const f = await fixtureFundamentals(ticker);
    expect(f.shareClasses.blocker).toBeUndefined();
    expect(
      f.shareClasses.classes.map((c) => [c.ticker, c.shares, c.sharesAsOf]),
    ).toEqual([[ticker, count, asOf]]);
  });
});

describe("no class silently drops out (methodology-reviewer, M2b)", () => {
  it("classes with different cover dates make market cap Unsupported", () => {
    const r = computeShareClasses(
      input({
        facts: [
          shares(100, COMMON, "2026-08-04"),
          shares(20, CLASS_B, "2026-07-31"),
        ],
        textFacts: [symbol("SYN", COMMON), symbol("SYNB", CLASS_B)],
        listings: [
          { ticker: "SYN", exchange: "NYSE" },
          { ticker: "SYN-B", exchange: "NYSE" },
        ],
      }),
    );
    expect(r.blocker).toMatchObject({
      status: "unsupported",
      reason: {
        code: "SHARE_CLASS_MISMATCH",
        message:
          "cover share counts have different dates (2026-07-31, 2026-08-04)",
      },
    });
  });

  it("a cover count on another axis that no class picks up is Unsupported", () => {
    const r = computeShareClasses(
      input({
        facts: [
          fact({
            concept: SHARES,
            value: 100,
            end: "2026-08-04",
            filing: q2,
            unit: "shares",
            source: "filing",
            dimensions: {
              [AXIS]: COMMON,
              "dei:LegalEntityAxis": "syn:SubMember",
            },
          }),
        ],
        textFacts: [symbol("SYN")],
      }),
    );
    expect(r.classes).toEqual([]);
    expect(r.blocker).toMatchObject({
      status: "unsupported",
      reason: { code: "SHARE_CLASS_MISMATCH" },
    });
  });

  it("counts the cover's classes, even ones that couldn't be used", () => {
    const conflicted = computeShareClasses(
      input({
        facts: [shares(100, COMMON), shares(101, COMMON), shares(20, CLASS_B)],
        textFacts: [symbol("SYN", COMMON), symbol("SYNB", CLASS_B)],
      }),
    );
    expect(conflicted.classes).toHaveLength(1);
    expect(conflicted.coverClassCount).toBe(2);
    const oneCountTwoListed = computeShareClasses(
      input({
        facts: [shares(1_000)],
        textFacts: [symbol("SYN", COMMON), symbol("SYNB", CLASS_B)],
        listings: [
          { ticker: "SYN", exchange: "NYSE" },
          { ticker: "SYN-B", exchange: "NYSE" },
        ],
      }),
    );
    expect(oneCountTwoListed.coverClassCount).toBe(2);
    expect(
      computeShareClasses(
        input({ facts: [shares(1_000)], textFacts: [symbol("SYN")] }),
      ).coverClassCount,
    ).toBe(1);
  });
});
