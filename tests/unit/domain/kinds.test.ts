import { describe, expect, it } from "vitest";
import type { BalanceSheetInput } from "@/domain/balanceSheet";
import {
  computeCommonEquity,
  computeRotce,
  computeTangibleCommonEquity,
} from "@/domain/bankEquity";
import { computeDigitalAssets } from "@/domain/digitalAssets";
import { computePreferred } from "@/domain/evAdjustments";
import { classifyIssuer, screeningProfile } from "@/domain/issuerKind";
import {
  computeBookMultiples,
  computeMcapToDigitalAssets,
} from "@/domain/multiples";
import type { FaceLine, Metric, ReportedFinancialFact } from "@/domain/types";
import { fact, filing } from "../../helpers/facts";

// Methodology 0.5.0 §13B–§13D: issuer kinds, digital assets, bank equity and the
// ratios built on them. Synthetic balance sheets in full dollars; M = 1 million.

const DATE = "2026-09-30";
const Q3 = filing("0000000001-26-000030", "10-Q", "2026-11-05", DATE);
const M = 1_000_000;

const at = (concept: string, value: number, end = DATE) =>
  fact({ concept, value, end, filing: Q3 });

type Row = [concept: string, label: string, value?: number];

// Asset rows, the total-assets row, then liabilities and equity (as in a filing).
function sheet(assets: Row[], rest: Row[]): BalanceSheetInput {
  const rows: Row[] = [
    ...assets,
    ["us-gaap:Assets", "Total assets", 10_000 * M],
    ...rest,
  ];
  const lines: FaceLine[] = rows.map(([concept, label, value], i) => ({
    order: i + 1,
    concept,
    label,
    total: /^total\b/i.test(label),
    displayed: value === undefined ? "—" : String(value / M),
  }));
  return {
    date: DATE,
    face: {
      kind: "face",
      url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000030/R2.htm",
      statement: "Consolidated Balance Sheets",
      scale: "Millions",
      lines,
    },
    facts: rows
      .filter(([, , v]) => v !== undefined)
      .map(([concept, , value]) =>
        fact({
          concept,
          value: value!,
          end: DATE,
          filing: Q3,
          source: "filing",
        }),
      ),
    textFacts: [],
  };
}

const value = (m: Metric) => {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
};
const codes = (m: Metric) => m.warnings.map((w) => w.code);
const usd = (v: number): Metric => ({
  status: "derived",
  value: v,
  unit: "USD",
  period: { kind: "instant", end: DATE },
  formula: "test",
  inputs: [],
  warnings: [],
});

describe("issuer kind (§13B)", () => {
  const facts: ReportedFinancialFact[] = [];
  it("is operating outside SIC 6000–6799 without reading any fact", () => {
    expect(
      classifyIssuer({ sic: "3585", facts, balanceSheetDate: DATE }).kind,
    ).toBe("operating");
  });

  it("is a bank with deposits above 0 at the balance-sheet date", () => {
    const r = classifyIssuer({
      sic: "6022",
      facts: [at("us-gaap:Deposits", 80_000 * M)],
      balanceSheetDate: DATE,
    });
    expect(r.kind).toBe("bank");
  });

  it("is a bank, not a digital-asset company, when it has both", () => {
    const r = classifyIssuer({
      sic: "6199",
      facts: [
        at("us-gaap:CryptoAssetFairValue", 500 * M),
        at("us-gaap:InterestBearingDepositLiabilities", 3_000 * M),
      ],
      balanceSheetDate: DATE,
    });
    expect(r.kind).toBe("bank");
  });

  it("is a digital-asset company with crypto fair value above 0", () => {
    const r = classifyIssuer({
      sic: "6199",
      facts: [at("us-gaap:CryptoAssetFairValueNoncurrent", 60_000 * M)],
      balanceSheetDate: DATE,
    });
    expect(r.kind).toBe("digitalAsset");
  });

  it("is unsupported with zero deposits, or facts only at another date", () => {
    const r = classifyIssuer({
      sic: "6199",
      facts: [
        at("us-gaap:Deposits", 0),
        at("us-gaap:CryptoAssetFairValue", 10 * M, "2025-12-31"),
      ],
      balanceSheetDate: DATE,
    });
    expect(r.kind).toBeNull();
    if (r.kind === null) {
      expect(r.reason.code).toBe("FINANCIAL_SIC");
      expect(r.reason.message).toContain("SIC 6199");
    }
  });
});

describe("screening profile for the peer index (§13E)", () => {
  it("records a bank's total assets at the latest report date", () => {
    expect(
      screeningProfile({
        sic: "6021",
        facts: [
          at("us-gaap:Deposits", 80_000 * M),
          at("us-gaap:Assets", 100_000 * M),
        ],
        reportDate: DATE,
      }),
    ).toEqual({
      kind: "bank",
      totalAssets: { value: 100_000 * M, accession: Q3.accession },
    });
  });

  it("leaves total assets out for other kinds, and a kind out without a report", () => {
    expect(
      screeningProfile({ sic: "3585", facts: [], reportDate: DATE }),
    ).toEqual({ kind: "operating", totalAssets: null });
    expect(
      screeningProfile({
        sic: "6199",
        facts: [at("us-gaap:CryptoAssetFairValue", 1 * M)],
        reportDate: DATE,
      }),
    ).toEqual({ kind: "digitalAsset", totalAssets: null });
    expect(
      screeningProfile({ sic: "6021", facts: [], reportDate: undefined }),
    ).toEqual({ kind: null, totalAssets: null });
  });
});

describe("digital assets (§13C)", () => {
  it("sums the crypto fair-value lines and lists company-concept look-alikes uncounted", () => {
    const item = computeDigitalAssets(
      sheet(
        [
          ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "Cash", 900 * M],
          [
            "us-gaap:CryptoAssetFairValueCurrent",
            "Crypto assets held",
            1_200 * M,
          ],
          [
            "us-gaap:CryptoAssetFairValueNoncurrent",
            "Crypto assets held for investment",
            800 * M,
          ],
          ["coin:CryptoAssetsBorrowed", "Crypto assets borrowed", 300 * M],
        ],
        [
          [
            "us-gaap:StockholdersEquity",
            "Total stockholders' equity",
            5_000 * M,
          ],
        ],
      ),
    );
    // 1,200 + 800 = 2,000; the 300 company-concept line is not counted.
    expect(value(item.metric)).toBe(2_000 * M);
    expect(codes(item.metric)).toEqual(["W_DIGITAL_ASSET_LINE_NOT_COUNTED"]);
    expect(item.lines.map((l) => [l.concept, l.included])).toEqual([
      ["us-gaap:CryptoAssetFairValueCurrent", true],
      ["us-gaap:CryptoAssetFairValueNoncurrent", true],
      ["coin:CryptoAssetsBorrowed", false],
    ]);
  });

  it("is Missing without a crypto fair-value line, never 0", () => {
    const item = computeDigitalAssets(
      sheet(
        [["us-gaap:CashAndCashEquivalentsAtCarryingValue", "Cash", 900 * M]],
        [],
      ),
    );
    expect(item.metric.status).toBe("missing");
  });

  it("is Missing with a caution when the face is unavailable", () => {
    const item = computeDigitalAssets({
      date: DATE,
      face: { kind: "unavailable", reason: "no R file" },
      facts: [at("us-gaap:CryptoAssetFairValue", 5 * M)],
      textFacts: [],
    });
    expect(item.metric.status).toBe("missing");
    expect(codes(item.metric)).toEqual(["W_FACE_UNAVAILABLE"]);
  });
});

describe("bank equity (§13D)", () => {
  const ASSETS: Row[] = [
    ["us-gaap:CashAndDueFromBanks", "Cash and due from banks", 2_000 * M],
    ["us-gaap:Goodwill", "Goodwill", 400 * M],
    [
      "us-gaap:IntangibleAssetsNetExcludingGoodwill",
      "Other intangible assets",
      100 * M,
    ],
  ];
  const EQUITY: Row[] = [
    ["us-gaap:Deposits", "Total deposits", 8_000 * M],
    ["us-gaap:PreferredStockValue", "Preferred stock", 250 * M],
    ["us-gaap:StockholdersEquity", "Total shareholders' equity", 1_250 * M],
  ];

  it("common equity = equity − preferred; TCE = common equity − goodwill and intangibles", () => {
    const input = sheet(ASSETS, EQUITY);
    const ce = computeCommonEquity(input, computePreferred(input));
    expect(value(ce.metric)).toBe(1_000 * M); // 1,250 − 250
    const tce = computeTangibleCommonEquity(input, ce);
    expect(value(tce.metric)).toBe(500 * M); // 1,000 − 400 − 100
  });

  it("notes when there is no preferred line and subtracts nothing", () => {
    const input = sheet(ASSETS, [EQUITY[0], EQUITY[2]]);
    const ce = computeCommonEquity(input, computePreferred(input));
    expect(value(ce.metric)).toBe(1_250 * M);
    expect(codes(ce.metric)).toEqual(["W_NO_PREFERRED_LINE"]);
  });

  it("deducts a servicing-rights intangible line whole, with a caution", () => {
    const input = sheet(
      [
        ...ASSETS.slice(0, 2),
        [
          "us-gaap:IntangibleAssetsNetExcludingGoodwill",
          "Intangible assets, including mortgage servicing rights",
          100 * M,
        ],
      ],
      EQUITY,
    );
    const ce = computeCommonEquity(input, computePreferred(input));
    const tce = computeTangibleCommonEquity(input, ce);
    expect(value(tce.metric)).toBe(500 * M);
    expect(codes(tce.metric)).toContain("W_INTANGIBLES_INCLUDE_SERVICING");
  });

  it("is Unsupported when an intangible-looking line has a company concept", () => {
    const input = sheet(
      [
        ...ASSETS,
        ["bank:CoreDepositIntangibles", "Core deposit intangibles", 50 * M],
      ],
      EQUITY,
    );
    const ce = computeCommonEquity(input, computePreferred(input));
    const tce = computeTangibleCommonEquity(input, ce);
    expect(tce.metric.status).toBe("unsupported");
    if (tce.metric.status === "unsupported")
      expect(tce.metric.reason.code).toBe("UNRECOGNIZED_INTANGIBLE_LINE");
  });

  it("is Unsupported without a stockholders' equity line", () => {
    const input = sheet(ASSETS, [EQUITY[0]]);
    const ce = computeCommonEquity(input, computePreferred(input));
    expect(ce.metric.status).toBe("unsupported");
  });

  it("ROTCE = LTM net income to common ÷ TCE; NM when TCE ≤ 0", () => {
    expect(value(computeRotce(usd(75 * M), usd(500 * M)))).toBeCloseTo(
      0.15,
      12,
    ); // 75 ÷ 500
    expect(value(computeRotce(usd(-20 * M), usd(500 * M)))).toBeCloseTo(
      -0.04,
      12,
    );
    const nm = computeRotce(usd(75 * M), usd(-10 * M));
    expect(nm.status).toBe("nm");
    if (nm.status === "nm") expect(nm.reason).toBe("TCE_NOT_POSITIVE");
  });
});

describe("kind multiples", () => {
  it("market cap ÷ digital assets, with the balance-sheet-date caution", () => {
    const m = computeMcapToDigitalAssets(usd(3_000 * M), usd(2_000 * M), DATE);
    expect(value(m)).toBe(1.5); // 3,000 ÷ 2,000
    expect(codes(m)).toContain("W_DIGITAL_ASSETS_AT_BALANCE_SHEET_DATE");
    const nm = computeMcapToDigitalAssets(usd(3_000 * M), usd(0), DATE);
    expect(nm.status).toBe("nm");
  });

  it("P/BV and P/TBV over common equity and TCE", () => {
    const { priceToBook, priceToTangibleBook } = computeBookMultiples(
      usd(1_500 * M),
      usd(1_000 * M),
      usd(500 * M),
    );
    expect(value(priceToBook)).toBe(1.5); // 1,500 ÷ 1,000
    expect(value(priceToTangibleBook)).toBe(3); // 1,500 ÷ 500
    const nm = computeBookMultiples(
      usd(1_500 * M),
      usd(1_000 * M),
      usd(-5 * M),
    );
    expect(nm.priceToTangibleBook.status).toBe("nm");
  });
});
