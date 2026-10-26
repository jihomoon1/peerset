import { describe, expect, it } from "vitest";
import { computeCash } from "@/domain/cash";
import { computeDebt } from "@/domain/debt";
import { computeNci, computePreferred } from "@/domain/evAdjustments";
import type {
  BalanceSheetFace,
  BalanceSheetInput,
} from "@/domain/balanceSheet";
import type {
  FaceLine,
  Metric,
  ReportedFinancialFact,
  ReportedTextFact,
} from "@/domain/types";
import { fact, filing } from "../../helpers/facts";

// Methodology 0.3.0 §7–§9. A synthetic balance sheet: assets rows, the total-assets
// row, then liabilities and equity. Values in full dollars.

const DATE = "2026-06-30";
const Q2 = filing("0000000001-26-000010", "10-Q", "2026-07-30", DATE);
const M = 1_000_000;

type Row = [concept: string, label: string, value?: number | null];

const ASSETS: Row = ["us-gaap:Assets", "Total assets", 5_000 * M];

// Builds the face (in table order) and the instance facts at the date. A value of
// undefined means "no fact, face shows —"; null means "no fact, face shows a number".
function sheet(
  assets: Row[],
  liabilities: Row[],
  extraFacts: ReportedFinancialFact[] = [],
): BalanceSheetInput {
  const rows = [...assets, ASSETS, ...liabilities];
  const lines: FaceLine[] = rows.map(([concept, label, value], i) => ({
    order: i + 1,
    concept,
    label,
    total: /^total\b/i.test(label),
    displayed:
      value === undefined ? "—" : value === null ? "12.3" : String(value / M),
  }));
  const facts = rows
    .filter(([, , v]) => typeof v === "number")
    .map(([concept, , value]) =>
      fact({
        concept,
        value: value as number,
        end: DATE,
        filing: Q2,
        source: "filing",
      }),
    );
  return {
    date: DATE,
    face: {
      kind: "face",
      url: "https://www.sec.gov/Archives/edgar/data/1/000000000126000010/R2.htm",
      statement: "Consolidated Balance Sheets",
      scale: "Millions",
      lines,
    },
    facts: [...facts, ...extraFacts],
    textFacts: [],
  };
}

const value = (m: Metric) => {
  if (m.status !== "reported" && m.status !== "derived")
    throw new Error(`expected a value, got ${JSON.stringify(m)}`);
  return m.value;
};
const codes = (m: Metric) => m.warnings.map((w) => w.code);

const CASH: Row = [
  "us-gaap:CashAndCashEquivalentsAtCarryingValue",
  "Cash and cash equivalents",
  51.5 * M,
];

describe("debt from face lines (§7)", () => {
  it("sums every classified debt line (LII shape)", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:AccountsPayableCurrent", "Accounts payable", 523.5 * M],
          ["us-gaap:CommercialPaper", "Commercial paper", 412 * M],
          [
            "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
            "Current maturities of long-term debt",
            20.1 * M,
          ],
          [
            "us-gaap:OperatingLeaseLiabilityCurrent",
            "Current operating lease liabilities",
            87.2 * M,
          ],
          [
            "us-gaap:LiabilitiesCurrent",
            "Total current liabilities",
            1_438.8 * M,
          ],
          [
            "us-gaap:LongTermDebtAndCapitalLeaseObligations",
            "Long-term debt",
            1_149.2 * M,
          ],
        ],
      ),
    );
    expect(r.method).toBe("face");
    expect(r.metric.status).toBe("derived");
    expect(value(r.metric)).toBe(412 * M + 20.1 * M + 1_149.2 * M);
    expect(r.lines.filter((l) => l.included).map((l) => l.concept)).toEqual([
      "us-gaap:CommercialPaper",
      "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
      "us-gaap:LongTermDebtAndCapitalLeaseObligations",
    ]);
    const lease = r.lines.find(
      (l) => l.concept === "us-gaap:OperatingLeaseLiabilityCurrent",
    );
    expect(lease).toMatchObject({
      included: false,
      reason: "operating lease liability: never debt",
    });
    // Lines that are neither debt nor debt-like are not listed.
    expect(r.lines.map((l) => l.concept)).not.toContain(
      "us-gaap:AccountsPayableCurrent",
    );
  });

  it("counts AAON's LineOfCredit and Graco's bank notes", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          [
            "us-gaap:ShortTermBankLoansAndNotesPayable",
            "Notes payable to banks",
            29.979 * M,
          ],
          [
            "us-gaap:UnsecuredDebtCurrent",
            "Current portion of long-term debt",
            0.677 * M,
          ],
          ["us-gaap:LineOfCredit", "Debt, long-term", 435 * M],
        ],
      ),
    );
    expect(value(r.metric)).toBe(29.979 * M + 0.677 * M + 435 * M);
  });

  it("never double counts: DebtCurrent is a face line, not a subtotal of other lines", () => {
    // Carrier presents one current line, DebtCurrent, which includes commercial paper.
    // Commercial paper exists as a fact (from a note) but is not a face line.
    const notes = fact({
      concept: "us-gaap:CommercialPaper",
      value: 708 * M,
      end: DATE,
      filing: Q2,
      source: "filing",
    });
    const r = computeDebt(
      sheet(
        [CASH],
        [
          [
            "us-gaap:DebtCurrent",
            "Short-term borrowings and current portion of long-term debt",
            1_638 * M,
          ],
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 10_314 * M],
        ],
        [notes],
      ),
    );
    expect(value(r.metric)).toBe(1_638 * M + 10_314 * M);
  });

  it("counts a concept presented twice only once", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
        ],
      ),
    );
    expect(value(r.metric)).toBe(100 * M);
    expect(r.lines[1]).toMatchObject({
      included: false,
      reason: "same concept already counted above",
    });
  });

  it("is Unsupported when a classified debt line is a total (face lines must be disjoint)", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:CommercialPaper", "Commercial paper", 10 * M],
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
          ["us-gaap:LongTermDebt", "Total debt", 110 * M],
        ],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: {
        code: "DEBT_SUBTOTAL_ON_FACE",
        message:
          "debt subtotal on the balance sheet: 'Total debt' (us-gaap:LongTermDebt)",
      },
    });
  });

  it("is Unsupported for an unrecognized debt-looking line, naming it (§7 rule 3)", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
          ["co:TermLoanNoncurrent", "Term loan, net", 50 * M],
        ],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: {
        code: "UNRECOGNIZED_DEBT_LINE",
        message:
          "unrecognized debt line: 'Term loan, net' (co:TermLoanNoncurrent)",
      },
    });
    expect(
      r.lines.find((l) => l.concept === "co:TermLoanNoncurrent"),
    ).toMatchObject({
      included: false,
      reason: "looks like debt but its concept is not classified",
    });
  });

  it("ignores debt-looking labels on the assets side", () => {
    const r = computeDebt(
      sheet(
        [CASH, ["co:LoansToAffiliates", "Loans to affiliates", 5 * M]],
        [["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M]],
      ),
    );
    expect(value(r.metric)).toBe(100 * M);
  });

  it("leaves out non-debt-looking company lines such as AAON's NMTC obligation", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          [
            "co:NewMarketTaxCreditObligationNoncurrent",
            "New market tax credit obligation",
            21.331 * M,
          ],
          ["us-gaap:LineOfCredit", "Debt, long-term", 435 * M],
        ],
      ),
    );
    expect(value(r.metric)).toBe(435 * M);
  });

  it("is Reported 0 with W_NO_DEBT_LINES when no line is debt (§7 rule 4)", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [["us-gaap:AccountsPayableCurrent", "Accounts payable", 10 * M]],
      ),
    );
    expect(r.metric).toMatchObject({ status: "reported", value: 0 });
    expect(r.metric.warnings).toEqual([
      {
        code: "W_NO_DEBT_LINES",
        message: "no debt lines on the balance sheet",
        severity: "info",
      },
    ]);
  });

  it("never classifies operating leases as debt, even with a debt-like label", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          [
            "us-gaap:OperatingLeaseLiabilityNoncurrent",
            "Lease obligations under operating leases (credit facility note 7)",
            5 * M,
          ],
        ],
      ),
    );
    expect(r.metric).toMatchObject({ status: "reported", value: 0 });
  });

  describe("lease-only labels (§7 rule 2, WSO)", () => {
    const wso = () =>
      computeDebt(
        sheet(
          [CASH],
          [
            [
              "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
              "Current portion of lease liabilities",
              119.723 * M,
            ],
            [
              "us-gaap:OperatingLeaseLiabilityNoncurrent",
              "Operating lease liabilities, net of current portion",
              406.478 * M,
            ],
            [
              "us-gaap:FinanceLeaseLiabilityNoncurrent",
              "Finance lease liabilities, net of current portion",
              9.068 * M,
            ],
          ],
        ),
      );

    it("excludes a debt-tagged generic lease line and warns, naming it", () => {
      const r = wso();
      expect(value(r.metric)).toBe(9.068 * M);
      expect(r.metric.warnings).toContainEqual({
        code: "W_LEASE_LINE_EXCLUDED",
        severity: "caution",
        message:
          "excluded 'Current portion of lease liabilities' (us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent, 119.7M): a lease line that may include operating leases",
      });
      expect(r.lines[0]).toMatchObject({ included: false, value: 119.723 * M });
    });

    it("includes a debt-tagged line labeled finance or capital lease", () => {
      for (const label of [
        "Current portion of finance lease liabilities",
        "Capital lease obligations, current",
      ]) {
        const r = computeDebt(
          sheet(
            [CASH],
            [
              [
                "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
                label,
                3 * M,
              ],
            ],
          ),
        );
        expect(value(r.metric), label).toBe(3 * M);
        expect(codes(r.metric), label).not.toContain("W_LEASE_LINE_EXCLUDED");
      }
    });

    it("does not apply to lines that also name debt", () => {
      const r = computeDebt(
        sheet(
          [CASH],
          [
            [
              "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
              "Current maturities of long-term debt and lease obligations",
              3 * M,
            ],
          ],
        ),
      );
      expect(value(r.metric)).toBe(3 * M);
    });
  });

  it("contributes nothing for a face line shown as — (§7 rule 5), noted", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:ShortTermBorrowings", "Short-term borrowings", undefined],
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
        ],
      ),
    );
    expect(value(r.metric)).toBe(100 * M);
    expect(r.lines[0]).toMatchObject({
      included: false,
      value: null,
      reason: "no value at the balance-sheet date (shown as —)",
    });
  });

  it("is Unsupported when the face shows a value but no consolidated fact exists", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [["us-gaap:ShortTermBorrowings", "Short-term borrowings", null]],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: { code: "FACE_VALUE_WITHOUT_FACT" },
    });
  });

  it("ignores dimensional and other-date facts for a face line", () => {
    const input = sheet(
      [CASH],
      [["us-gaap:ShortTermBorrowings", "Short-term borrowings", undefined]],
      [
        fact({
          concept: "us-gaap:ShortTermBorrowings",
          value: 7 * M,
          end: DATE,
          filing: Q2,
          source: "filing",
          dimensions: { "us-gaap:DebtInstrumentAxis": "co:TermLoanMember" },
        }),
        fact({
          concept: "us-gaap:ShortTermBorrowings",
          value: 8 * M,
          end: "2025-12-31",
          filing: Q2,
        }),
      ],
    );
    expect(computeDebt(input).metric).toMatchObject({
      status: "derived",
      value: 0,
    });
  });

  it("warns when a total-debt tag differs from the face sum by more than 0.1M (§7 rule 6)", () => {
    const total = (v: number) =>
      fact({
        concept: "us-gaap:DebtAndCapitalLeaseObligations",
        value: v,
        end: DATE,
        filing: Q2,
        source: "filing",
      });
    const lines: Row[] = [
      [
        "us-gaap:DebtCurrent",
        "Short-term borrowings and current maturities",
        1_736 * M,
      ],
      ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 10_422 * M],
    ];
    const off = computeDebt(sheet([CASH], lines, [total(11_427 * M)]));
    expect(value(off.metric)).toBe(12_158 * M);
    expect(off.metric.warnings).toContainEqual({
      code: "W_DEBT_TOTAL_TAG_DIFFERS",
      severity: "caution",
      message:
        "us-gaap:DebtAndCapitalLeaseObligations reports 11,427.0M; the balance-sheet lines sum to 12,158.0M (kept)",
    });
    const within = computeDebt(
      sheet([CASH], lines, [total(12_158 * M + 100_000)]),
    );
    expect(codes(within.metric)).not.toContain("W_DEBT_TOTAL_TAG_DIFFERS");
  });

  it("carries the included facts as inputs, with an instant period at the date", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M]],
      ),
    );
    expect(r.metric).toMatchObject({
      unit: "USD",
      period: { kind: "instant", end: DATE },
      formula:
        "Total debt = sum of the balance-sheet debt lines (methodology §7)",
      inputs: [{ concept: "us-gaap:LongTermDebtNoncurrent", value: 100 * M }],
    });
  });
});

describe("cash from face lines (§8)", () => {
  it("sums cash and short-term investments (LII shape)", () => {
    const r = computeCash(
      sheet(
        [
          CASH,
          ["us-gaap:ShortTermInvestments", "Short-term investments", 0.6 * M],
          ["us-gaap:ReceivablesNetCurrent", "Receivables", 9 * M],
          [
            "us-gaap:RestrictedCashNoncurrent",
            "Restricted cash equivalents",
            18.8 * M,
          ],
        ],
        [],
      ),
    );
    expect(value(r.metric)).toBe(51.5 * M + 0.6 * M);
    expect(
      r.lines.find((l) => l.concept === "us-gaap:RestrictedCashNoncurrent"),
    ).toMatchObject({
      included: false,
      reason: "restricted cash presented separately: excluded",
    });
  });

  it("counts a restricted-cash-inclusive line with W_RESTRICTED_CASH_INCLUDED (Trane)", () => {
    const r = computeCash(
      sheet(
        [
          [
            "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
            "Cash, cash equivalents, restricted cash and restricted cash equivalents",
            1_318.3 * M,
          ],
        ],
        [],
      ),
    );
    expect(value(r.metric)).toBe(1_318.3 * M);
    expect(r.metric.warnings).toContainEqual(
      expect.objectContaining({
        code: "W_RESTRICTED_CASH_INCLUDED",
        severity: "caution",
      }),
    );
  });

  it("is Unsupported for an unrecognized cash-looking line", () => {
    const r = computeCash(
      sheet(
        [CASH, ["co:CashAndDeposits", "Cash and short-term deposits", 5 * M]],
        [],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: {
        code: "UNRECOGNIZED_CASH_LINE",
        message:
          "unrecognized cash line: 'Cash and short-term deposits' (co:CashAndDeposits)",
      },
    });
  });

  it("does not treat liabilities-side or long-term investment lines as cash", () => {
    const r = computeCash(
      sheet(
        [
          CASH,
          [
            "us-gaap:MarketableSecuritiesNoncurrent",
            "Long-term marketable securities",
            3 * M,
          ],
        ],
        [["co:CashOverdraftLiability", "Cash overdrafts", 2 * M]],
      ),
    );
    expect(value(r.metric)).toBe(51.5 * M);
  });

  it("is Missing when the face has no cash line", () => {
    const r = computeCash(
      sheet([["us-gaap:InventoryNet", "Inventories", 5 * M]], []),
    );
    expect(r.metric).toMatchObject({
      status: "missing",
      reason: "no cash line on the balance sheet",
    });
  });
});

describe("review fixes", () => {
  it("cash: a cash-plus-restricted label with an unclassified concept is Unsupported, not dropped", () => {
    const r = computeCash(
      sheet(
        [
          [
            "co:CashAndRestricted",
            "Cash, cash equivalents and restricted cash",
            9 * M,
          ],
        ],
        [],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: { code: "UNRECOGNIZED_CASH_LINE" },
    });
  });

  it("cash: a restricted-only label with an unclassified concept is excluded", () => {
    const r = computeCash(
      sheet(
        [
          CASH,
          ["co:EscrowCash", "Restricted cash and cash equivalents", 2 * M],
        ],
        [],
      ),
    );
    expect(value(r.metric)).toBe(51.5 * M);
  });

  it("cash: 'Short term investments' without a hyphen still looks like cash", () => {
    const r = computeCash(
      sheet([CASH, ["co:Sti", "Short term investments", 1 * M]], []),
    );
    expect(r.metric.status).toBe("unsupported");
  });

  it("debt: a total row repeating an earlier concept is still a subtotal", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          ["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 100 * M],
          ["us-gaap:LongTermDebtNoncurrent", "Total long-term debt", 100 * M],
        ],
      ),
    );
    expect(r.metric).toMatchObject({
      status: "unsupported",
      reason: { code: "DEBT_SUBTOTAL_ON_FACE" },
    });
  });

  it("debt: the lease warning survives a lease line whose value has no fact", () => {
    const r = computeDebt(
      sheet(
        [CASH],
        [
          [
            "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
            "Current portion of lease liabilities",
            null,
          ],
        ],
      ),
    );
    expect(codes(r.metric)).toContain("W_LEASE_LINE_EXCLUDED");
  });
});

describe("preferred stock and NCI from the face (§9)", () => {
  const equity: Row[] = [
    ["us-gaap:PreferredStockValue", "Preferred stock, $0.50 par value", 0],
    [
      "us-gaap:StockholdersEquity",
      "Total Watsco, Inc. shareholders' equity",
      2_994.413 * M,
    ],
    ["us-gaap:MinorityInterest", "Non-controlling interest", 478.797 * M],
    [
      "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      "Total shareholders' equity including noncontrolling interest",
      3_473.21 * M,
    ],
  ];

  it("reads preferred stock and NCI lines (WSO shape)", () => {
    const input = sheet([CASH], equity);
    expect(value(computePreferred(input).metric)).toBe(0);
    expect(value(computeNci(input).metric)).toBe(478.797 * M);
  });

  it("is Missing when the face has no such line", () => {
    const input = sheet(
      [CASH],
      [["us-gaap:LongTermDebtNoncurrent", "Long-term debt", 1]],
    );
    expect(computePreferred(input).metric).toMatchObject({
      status: "missing",
      reason: "no preferred stock line on the balance sheet",
    });
    expect(computeNci(input).metric).toMatchObject({
      status: "missing",
      reason: "no noncontrolling interest line on the balance sheet",
    });
  });

  it("is Unsupported for an unclassified NCI-looking line", () => {
    const input = sheet(
      [CASH],
      [
        [
          "co:RedeemableNciFairValue",
          "Redeemable noncontrolling interests",
          4 * M,
        ],
      ],
    );
    expect(computeNci(input).metric).toMatchObject({
      status: "unsupported",
      reason: { code: "UNRECOGNIZED_EQUITY_LINE" },
    });
  });
});

describe("fallback when the face is unavailable (§7 rule 7: 0.2.1 tag rules)", () => {
  const unavailable: BalanceSheetFace = {
    kind: "unavailable",
    reason: "FilingSummary.xml returned 404",
  };
  const at = (concept: string, v: number) =>
    fact({ concept, value: v, end: DATE, filing: Q2, source: "filing" });
  const input = (
    facts: ReportedFinancialFact[],
    textFacts: ReportedTextFact[] = [],
  ): BalanceSheetInput => ({
    date: DATE,
    face: unavailable,
    facts,
    textFacts,
  });
  const faceWarning = {
    code: "W_FACE_UNAVAILABLE",
    severity: "caution",
    message:
      "balance-sheet face unavailable (FilingSummary.xml returned 404); tag rules used",
  };

  it("reproduces LII's 0.2.1 build: 412.0 + 20.1 + 1,149.2 = 1,581.3", () => {
    const r = computeDebt(
      input([
        at("us-gaap:CommercialPaper", 412 * M),
        at("us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent", 20.1 * M),
        at("us-gaap:LongTermDebtAndCapitalLeaseObligations", 1_149.2 * M),
        at("us-gaap:FinanceLeaseLiabilityNoncurrent", 9 * M), // inside the AndCapitalLease tags
        at("us-gaap:DebtAndCapitalLeaseObligations", 1_581.3 * M),
      ]),
    );
    expect(r.method).toBe("tags");
    expect(value(r.metric)).toBeCloseTo(1_581.3 * M, 0);
    expect(r.metric.warnings).toEqual([faceWarning]);
  });

  it("reproduces Carrier's 0.2.1 build: DebtCurrent is a subtotal; total tag warns", () => {
    const r = computeDebt(
      input([
        at("us-gaap:DebtCurrent", 1_736 * M),
        at("us-gaap:CommercialPaper", 708 * M),
        at("us-gaap:LongTermDebtCurrent", 1_005 * M),
        at("us-gaap:LongTermDebtAndCapitalLeaseObligations", 10_422 * M),
        at("us-gaap:DebtAndCapitalLeaseObligations", 11_427 * M),
      ]),
    );
    expect(value(r.metric)).toBe(12_158 * M);
    expect(codes(r.metric)).toEqual([
      "W_FACE_UNAVAILABLE",
      "W_DEBT_TOTAL_TAG_DIFFERS",
    ]);
  });

  it("adds finance leases only when the debt tags exclude them", () => {
    const facts = [
      at("us-gaap:LongTermDebtCurrent", 10 * M),
      at("us-gaap:LongTermDebtNoncurrent", 100 * M),
      at("us-gaap:FinanceLeaseLiabilityNoncurrent", 9 * M),
    ];
    expect(value(computeDebt(input(facts)).metric)).toBe(119 * M);
    const pointsIntoDebt: ReportedTextFact = {
      concept:
        "us-gaap:FinanceLeaseLiabilityNoncurrentStatementOfFinancialPositionExtensibleList",
      value: "http://fasb.org/us-gaap/2025#LongTermDebtNoncurrent",
      period: { kind: "instant", end: DATE },
      dimensions: {},
      filing: Q2,
      source: "filing",
    };
    expect(value(computeDebt(input(facts, [pointsIntoDebt])).metric)).toBe(
      110 * M,
    );
  });

  it("is Missing when a current or noncurrent component has no tag", () => {
    const r = computeDebt(
      input([
        at("us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent", 119.7 * M),
      ]),
    );
    expect(r.metric).toMatchObject({ status: "missing" });
    expect(codes(r.metric)).toContain("W_FACE_UNAVAILABLE");
  });

  it("cash: unrestricted tags first, restricted fallback with a warning", () => {
    expect(
      value(
        computeCash(
          input([
            at("us-gaap:CashAndCashEquivalentsAtCarryingValue", 51.5 * M),
            at("us-gaap:ShortTermInvestments", 0.6 * M),
          ]),
        ).metric,
      ),
    ).toBe(52.1 * M);
    const tt = computeCash(
      input([
        at(
          "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
          1_318.3 * M,
        ),
      ]),
    );
    expect(value(tt.metric)).toBe(1_318.3 * M);
    expect(codes(tt.metric)).toEqual([
      "W_FACE_UNAVAILABLE",
      "W_RESTRICTED_CASH_INCLUDED",
    ]);
  });

  it("fallback preferred uses only PreferredStockValue (no double count)", () => {
    const i = input([
      at("us-gaap:PreferredStockValue", 50 * M),
      at("us-gaap:PreferredStockValueOutstanding", 50 * M),
    ]);
    expect(value(computePreferred(i).metric)).toBe(50 * M);
  });

  it("fallback cash adds the first short-term investment tag only", () => {
    const r = computeCash(
      input([
        at("us-gaap:CashAndCashEquivalentsAtCarryingValue", 10 * M),
        at("us-gaap:ShortTermInvestments", 5 * M),
        at("us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent", 5 * M),
      ]),
    );
    expect(value(r.metric)).toBe(15 * M);
  });

  it("NCI and preferred from their tags", () => {
    const i = input([at("us-gaap:MinorityInterest", 478.797 * M)]);
    expect(value(computeNci(i).metric)).toBe(478.797 * M);
    expect(computePreferred(i).metric.status).toBe("missing");
  });
});
