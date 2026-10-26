import { describe, expect, it } from "vitest";
import { locateInstance, parseInstance } from "@/sec/filingInstance";
import type { FilingReference, ReportedFinancialFact } from "@/domain/types";
import { SecSchemaChangedError } from "@/lib/errors";
import { fixtureJson, fixtureText } from "../../helpers/fixtures";

const LII_FILING: FilingReference = {
  accession: "0001069202-26-000087",
  form: "10-Q",
  filedDate: "2026-07-29",
  reportDate: "2026-06-30",
  indexUrl:
    "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000087/0001069202-26-000087-index.htm",
};
const WSO_FILING: FilingReference = {
  accession: "0001193125-26-340204",
  form: "10-Q",
  filedDate: "2026-08-07",
  reportDate: "2026-06-30",
  indexUrl:
    "https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/0001193125-26-340204-index.htm",
};

function consolidated(
  facts: ReportedFinancialFact[],
  concept: string,
  period: { start?: string; end: string },
) {
  const hits = facts.filter(
    (f) =>
      f.concept === concept &&
      Object.keys(f.dimensions).length === 0 &&
      f.period.end === period.end &&
      f.period.start === period.start,
  );
  expect(hits, `${concept} ${period.start ?? ""}..${period.end}`).toHaveLength(
    1,
  );
  return hits[0].value;
}

describe("locateInstance", () => {
  it("finds the *_htm.xml in LII's filing index", () => {
    expect(locateInstance(fixtureJson("LII/2026Q2", "index.json.gz"))).toEqual({
      kind: "found",
      name: "lii-20260630_htm.xml",
    });
  });

  it("returns a typed no-instance result when there is none", () => {
    expect(
      locateInstance({ directory: { item: [{ name: "doc.htm" }] } }),
    ).toMatchObject({ kind: "no-instance" });
  });
});

// ── Golden: LII 10-Q for the quarter ended June 30, 2026 ────────────────────
// Expected values are typed from the 10-Q document (lii-20260630.htm) as rendered,
// not read from this XML. All amounts are in millions in the filing.

describe("LII Q2 2026 instance (golden)", () => {
  const { facts, warnings } = parseInstance(
    fixtureText("LII/2026Q2", "lii-20260630_htm.xml.gz"),
    LII_FILING,
  );
  const at = { end: "2026-06-30" };

  it("matches the balance sheet (page 1, Consolidated Balance Sheets, June 30, 2026)", () => {
    expect(
      consolidated(facts, "us-gaap:CashAndCashEquivalentsAtCarryingValue", at),
    ).toBe(51_500_000); // Cash and cash equivalents 51.5
    expect(consolidated(facts, "us-gaap:ShortTermInvestments", at)).toBe(
      600_000,
    ); // Short-term investments 0.6
    expect(consolidated(facts, "us-gaap:CommercialPaper", at)).toBe(
      412_000_000,
    ); // Commercial paper 412.0
    expect(
      consolidated(
        facts,
        "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
        at,
      ),
    ).toBe(20_100_000); // Current maturities of long-term debt 20.1
    expect(
      consolidated(facts, "us-gaap:LongTermDebtAndCapitalLeaseObligations", at),
    ).toBe(1_149_200_000); // Long-term debt 1,149.2
  });

  it("matches Note 10, Lines of Credit and Financing Arrangements (page 17)", () => {
    expect(
      consolidated(facts, "us-gaap:FinanceLeaseLiabilityCurrent", at),
    ).toBe(20_100_000); // Finance lease obligations (current) 20.1
    expect(
      consolidated(facts, "us-gaap:FinanceLeaseLiabilityNoncurrent", at),
    ).toBe(54_600_000); // Finance lease obligations (long-term) 54.6
    expect(
      consolidated(facts, "us-gaap:DebtAndCapitalLeaseObligations", at),
    ).toBe(1_581_300_000); // Total debt 1,581.3
  });

  it("matches the income statement (page 2, Consolidated Statements of Operations, six months)", () => {
    const ytd2026 = { start: "2026-01-01", end: "2026-06-30" };
    const ytd2025 = { start: "2025-01-01", end: "2025-06-30" };
    expect(consolidated(facts, "us-gaap:Revenues", ytd2026)).toBe(
      2_680_400_000,
    ); // Net sales 2,680.4
    expect(consolidated(facts, "us-gaap:Revenues", ytd2025)).toBe(
      2_573_500_000,
    ); // Net sales 2,573.5
    expect(consolidated(facts, "us-gaap:OperatingIncomeLoss", ytd2026)).toBe(
      518_500_000,
    ); // Operating income 518.5
    expect(consolidated(facts, "us-gaap:OperatingIncomeLoss", ytd2025)).toBe(
      517_000_000,
    ); // Operating income 517.0
  });

  it("matches the cover page share count (single class, no dimensions)", () => {
    // Cover: "As of July 22, 2026, the number of shares outstanding ... was 34,560,675."
    expect(
      consolidated(facts, "dei:EntityCommonStockSharesOutstanding", {
        end: "2026-07-22",
      }),
    ).toBe(34_560_675);
  });

  it("tags every fact with the filing and source", () => {
    for (const f of facts) {
      expect(f.source).toBe("filing");
      expect(f.filing).toBe(LII_FILING);
    }
  });

  it("keeps decimals as filed", () => {
    const cp = facts.find(
      (f) =>
        f.concept === "us-gaap:CommercialPaper" &&
        f.period.end === "2026-06-30",
    );
    expect(cp?.decimals).toBe(-5);
  });

  it("collapses agreeing duplicates without warnings", () => {
    // LII reports six-month Revenues twice in one context (statement and segment note).
    expect(warnings).toEqual([]);
  });

  it("keeps dimensional facts with their dimensions", () => {
    expect(
      facts.some(
        (f) =>
          f.concept === "us-gaap:Revenues" &&
          Object.keys(f.dimensions).length > 0,
      ),
    ).toBe(true);
  });
});

// ── Golden: WSO cover page ──────────────────────────────────────────────────
// 10-Q cover (wso-20260630.htm): "The registrant's common stock outstanding as of
// August 4, 2026 comprised (i) 35,588,756 shares of Common stock ... and
// (ii) 5,663,438 shares of Class B common stock".

describe("WSO Q2 2026 instance cover page (golden)", () => {
  const { facts, textFacts } = parseInstance(
    fixtureText("WSO/2026Q2", "wso-20260630_htm.xml.gz"),
    WSO_FILING,
  );

  it("has shares outstanding by class, as of the cover date", () => {
    const shares = facts.filter(
      (f) => f.concept === "dei:EntityCommonStockSharesOutstanding",
    );
    const byClass = Object.fromEntries(
      shares.map((f) => [f.dimensions["us-gaap:StatementClassOfStockAxis"], f]),
    );
    expect(byClass["us-gaap:CommonStockMember"]).toMatchObject({
      value: 35_588_756,
      unit: "shares",
      period: { kind: "instant", end: "2026-08-04" },
    });
    expect(byClass["us-gaap:CommonClassBMember"]).toMatchObject({
      value: 5_663_438,
      unit: "shares",
      period: { kind: "instant", end: "2026-08-04" },
    });
    expect(shares).toHaveLength(2);
  });

  it("returns cover-page text facts such as the period focus", () => {
    const fp = textFacts.find(
      (f) => f.concept === "dei:DocumentFiscalPeriodFocus",
    );
    expect(fp?.value).toBe("Q2");
  });
});

// ── Synthetic edge cases ────────────────────────────────────────────────────

const FILING = LII_FILING;

function instance(body: string, { prefixed = false, gaapYear = "2024" } = {}) {
  const x = prefixed ? "xbrli:" : "";
  const ns = prefixed
    ? 'xmlns:xbrli="http://www.xbrl.org/2003/instance"'
    : 'xmlns="http://www.xbrl.org/2003/instance"';
  return `<?xml version="1.0" encoding="utf-8"?>
<${x}xbrl ${ns}
  xmlns:gaap="http://fasb.org/us-gaap/${gaapYear}"
  xmlns:dei="http://xbrl.sec.gov/dei/2024"
  xmlns:cur="http://www.xbrl.org/2003/iso4217"
  xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
  xmlns:co="http://example.com/20260630"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <${x}context id="i">
    <${x}entity><${x}identifier scheme="http://www.sec.gov/CIK">0000000001</${x}identifier></${x}entity>
    <${x}period><${x}instant>2026-06-30</${x}instant></${x}period>
  </${x}context>
  <${x}context id="d">
    <${x}entity><${x}identifier scheme="http://www.sec.gov/CIK">0000000001</${x}identifier></${x}entity>
    <${x}period><${x}startDate>2026-01-01</${x}startDate><${x}endDate>2026-06-30</${x}endDate></${x}period>
  </${x}context>
  <${x}context id="typed">
    <${x}entity><${x}identifier scheme="http://www.sec.gov/CIK">0000000001</${x}identifier>
      <${x}segment><xbrldi:typedMember dimension="co:LoanAxis"><co:id>7</co:id></xbrldi:typedMember></${x}segment>
    </${x}entity>
    <${x}period><${x}instant>2026-06-30</${x}instant></${x}period>
  </${x}context>
  <${x}unit id="u1"><${x}measure>cur:USD</${x}measure></${x}unit>
  <${x}unit id="sh"><${x}measure>${x}shares</${x}measure></${x}unit>
  <${x}unit id="eps"><${x}divide><${x}unitNumerator><${x}measure>cur:USD</${x}measure></${x}unitNumerator><${x}unitDenominator><${x}measure>${x}shares</${x}measure></${x}unitDenominator></${x}divide></${x}unit>
  <${x}unit id="pure"><${x}measure>${x}pure</${x}measure></${x}unit>
  ${body}
</${x}xbrl>`;
}

describe("parser edge cases (synthetic)", () => {
  it("reads xbrli:-prefixed contexts and units, and any filer prefix for us-gaap", () => {
    const { facts } = parseInstance(
      instance(
        '<gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">412000000</gaap:CommercialPaper>',
        { prefixed: true },
      ),
      FILING,
    );
    expect(facts).toEqual([
      {
        concept: "us-gaap:CommercialPaper",
        value: 412_000_000,
        unit: "USD",
        period: { kind: "instant", end: "2026-06-30" },
        decimals: -5,
        dimensions: {},
        filing: FILING,
        source: "filing",
      },
    ]);
  });

  it("matches us-gaap namespaces of any year", () => {
    const { facts } = parseInstance(
      instance(
        '<gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">1</gaap:CommercialPaper>',
        { gaapYear: "2011-01-31" },
      ),
      FILING,
    );
    expect(facts[0]?.concept).toBe("us-gaap:CommercialPaper");
  });

  it("ignores a prefix that merely looks like us-gaap but points elsewhere", () => {
    const xml = instance("").replace(
      'xmlns:co="http://example.com/20260630"',
      'xmlns:co="http://example.com/20260630" xmlns:us-gaap="http://example.com/fake"',
    );
    const { facts } = parseInstance(
      xml.replace(
        "</xbrl>",
        '<us-gaap:CommercialPaper contextRef="i" unitRef="u1">5</us-gaap:CommercialPaper></xbrl>',
      ),
      FILING,
    );
    expect(facts).toEqual([]);
  });

  it("accepts decimal-formatted and negative values at full precision", () => {
    const { facts } = parseInstance(
      instance(`
        <gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">209000000.0</gaap:CommercialPaper>
        <gaap:OperatingIncomeLoss contextRef="d" unitRef="u1" decimals="0">-1234567.89</gaap:OperatingIncomeLoss>
        <gaap:EarningsPerShareDiluted contextRef="d" unitRef="eps" decimals="2">11.06</gaap:EarningsPerShareDiluted>
        <gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="d" unitRef="sh" decimals="INF">34912345</gaap:WeightedAverageNumberOfDilutedSharesOutstanding>`),
      FILING,
    );
    const by = Object.fromEntries(facts.map((f) => [f.concept, f]));
    expect(by["us-gaap:CommercialPaper"].value).toBe(209_000_000);
    expect(by["us-gaap:OperatingIncomeLoss"]).toMatchObject({
      value: -1234567.89,
      period: { kind: "duration", start: "2026-01-01", end: "2026-06-30" },
    });
    expect(by["us-gaap:EarningsPerShareDiluted"]).toMatchObject({
      value: 11.06,
      unit: "USD/shares",
    });
    expect(
      by["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding"],
    ).toMatchObject({
      value: 34_912_345,
      unit: "shares",
    });
    expect(
      by["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding"].decimals,
    ).toBeUndefined(); // INF
  });

  it("keeps the split-ratio fact in unit pure, and no other pure fact (§1.2)", () => {
    const { facts } = parseInstance(
      instance(`
        <gaap:StockholdersEquityNoteStockSplitConversionRatio1 contextRef="d" unitRef="pure" decimals="INF">2</gaap:StockholdersEquityNoteStockSplitConversionRatio1>
        <gaap:CommercialPaper contextRef="i" unitRef="pure">3</gaap:CommercialPaper>`),
      FILING,
    );
    expect(facts).toEqual([
      expect.objectContaining({
        concept: "us-gaap:StockholdersEquityNoteStockSplitConversionRatio1",
        value: 2,
        unit: "pure",
      }),
    ]);
  });

  it("skips nil facts", () => {
    const { facts, warnings } = parseInstance(
      instance(
        '<gaap:CommercialPaper contextRef="i" unitRef="u1" xsi:nil="true"/>',
      ),
      FILING,
    );
    expect(facts).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("drops disagreeing duplicates and records a warning", () => {
    const { facts, warnings } = parseInstance(
      instance(`
        <gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">412000000</gaap:CommercialPaper>
        <gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">413000000</gaap:CommercialPaper>`),
      FILING,
    );
    expect(facts).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "W_DUPLICATE_FACT_CONFLICT" });
    expect(warnings[0].message).toContain("us-gaap:CommercialPaper");
  });

  it("collapses agreeing duplicates, even when written differently", () => {
    const { facts, warnings } = parseInstance(
      instance(`
        <gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">412000000</gaap:CommercialPaper>
        <gaap:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">412000000.0</gaap:CommercialPaper>`),
      FILING,
    );
    expect(facts).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("skips facts whose context has a typed dimension", () => {
    const { facts } = parseInstance(
      instance(
        '<gaap:CommercialPaper contextRef="typed" unitRef="u1" decimals="0">5</gaap:CommercialPaper>',
      ),
      FILING,
    );
    expect(facts).toEqual([]);
  });

  it("ignores non-whitelisted and extension concepts", () => {
    const { facts, textFacts } = parseInstance(
      instance(`
        <gaap:AccountsPayableCurrent contextRef="i" unitRef="u1" decimals="-5">1</gaap:AccountsPayableCurrent>
        <co:CommercialPaper contextRef="i" unitRef="u1" decimals="-5">2</co:CommercialPaper>
        <dei:EntityRegistrantName contextRef="d">Synthetic Co</dei:EntityRegistrantName>`),
      FILING,
    );
    expect(facts).toEqual([]);
    expect(textFacts).toEqual([]);
  });

  it("also keeps the extra concepts asked for (balance-sheet face lines)", () => {
    const { facts } = parseInstance(
      instance(`
        <gaap:AccountsPayableCurrent contextRef="i" unitRef="u1" decimals="-5">1</gaap:AccountsPayableCurrent>
        <co:NewMarketTaxCreditObligationCurrent contextRef="i" unitRef="u1" decimals="-3">7535000</co:NewMarketTaxCreditObligationCurrent>
        <co:Unrequested contextRef="i" unitRef="u1" decimals="-3">9</co:Unrequested>`),
      FILING,
      {
        extraConcepts: new Set([
          "us-gaap:AccountsPayableCurrent",
          "co:NewMarketTaxCreditObligationCurrent",
        ]),
      },
    );
    expect(facts.map((f) => [f.concept, f.value, f.unit])).toEqual([
      ["us-gaap:AccountsPayableCurrent", 1, "USD"],
      ["co:NewMarketTaxCreditObligationCurrent", 7535000, "USD"],
    ]);
  });

  it("drops units outside USD, shares and USD/shares (pure only for the split ratio)", () => {
    const { facts } = parseInstance(
      instance(
        '<gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="d" unitRef="pure" decimals="INF">2</gaap:WeightedAverageNumberOfDilutedSharesOutstanding>',
      ),
      FILING,
    );
    expect(facts).toEqual([]);
  });

  it("keeps explicit dimension members, normalized to standard prefixes", () => {
    const xml = instance(
      '<dei:EntityCommonStockSharesOutstanding contextRef="cls" unitRef="sh" decimals="INF">100</dei:EntityCommonStockSharesOutstanding>',
    ).replace(
      '<context id="i">',
      `<context id="cls">
    <entity><identifier scheme="http://www.sec.gov/CIK">0000000001</identifier>
      <segment><xbrldi:explicitMember dimension="gaap:StatementClassOfStockAxis">gaap:CommonClassBMember</xbrldi:explicitMember></segment>
    </entity>
    <period><instant>2026-08-04</instant></period>
  </context>
  <context id="i">`,
    );
    const { facts } = parseInstance(xml, FILING);
    expect(facts[0].dimensions).toEqual({
      "us-gaap:StatementClassOfStockAxis": "us-gaap:CommonClassBMember",
    });
  });

  it("reads the finance-lease ExtensibleList as a text fact", () => {
    const { textFacts } = parseInstance(
      instance(
        '<gaap:FinanceLeaseLiabilityCurrentStatementOfFinancialPositionExtensibleList contextRef="i">http://fasb.org/us-gaap/2024#LongTermDebtCurrent</gaap:FinanceLeaseLiabilityCurrentStatementOfFinancialPositionExtensibleList>',
      ),
      FILING,
    );
    expect(textFacts).toEqual([
      {
        concept:
          "us-gaap:FinanceLeaseLiabilityCurrentStatementOfFinancialPositionExtensibleList",
        value: "http://fasb.org/us-gaap/2024#LongTermDebtCurrent",
        period: { kind: "instant", end: "2026-06-30" },
        dimensions: {},
        filing: FILING,
        source: "filing",
      },
    ]);
  });

  it("throws SEC_SCHEMA_CHANGED when the root is not an XBRL instance", () => {
    expect(() => parseInstance("<html><body>hi</body></html>", FILING)).toThrow(
      SecSchemaChangedError,
    );
  });
});
