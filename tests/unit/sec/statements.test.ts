import { describe, expect, it } from "vitest";
import { locateBalanceSheet, parseBalanceSheet } from "@/sec/statements";
import { fixtureText } from "../../helpers/fixtures";

const report = (
  file: string,
  shortName: string,
  category = "Statements",
  position = 2,
) => `<Report instance="x.htm">
  <IsDefault>false</IsDefault>
  <HtmlFileName>${file}</HtmlFileName>
  <LongName>0000002 - Statement - ${shortName}</LongName>
  <ShortName>${shortName}</ShortName>
  <MenuCategory>${category}</MenuCategory>
  <Position>${position}</Position>
</Report>`;

const summary = (...reports: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?>
<FilingSummary><MyReports>${reports.join("\n")}</MyReports></FilingSummary>`;

describe("locateBalanceSheet (methodology §7 rule 1)", () => {
  it("finds LII's balance sheet in its real FilingSummary.xml", () => {
    expect(
      locateBalanceSheet(fixtureText("LII/2026Q2", "FilingSummary.xml.gz")),
    ).toEqual({
      kind: "found",
      file: "R2.htm",
      shortName: "Consolidated Balance Sheets",
    });
  });

  it("finds WSO's (position 4, after the cover and income statements)", () => {
    const found = locateBalanceSheet(
      fixtureText("WSO/2026Q2", "FilingSummary.xml.gz"),
    );
    expect(found).toMatchObject({ kind: "found", file: "R4.htm" });
  });

  it("skips the Parenthetical report and non-statement categories", () => {
    const xml = summary(
      report(
        "R3.htm",
        "Consolidated Balance Sheets (Parenthetical)",
        "Statements",
        3,
      ),
      report("R40.htm", "Balance Sheet Details", "Details", 40),
      report("R2.htm", "Statements of Financial Position", "Statements", 2),
    );
    expect(locateBalanceSheet(xml)).toMatchObject({ file: "R2.htm" });
  });

  it("takes the lowest position when several statements match", () => {
    const xml = summary(
      report("R6.htm", "Condensed Balance Sheet - Segment", "Statements", 6),
      report("R4.htm", "Statement of Financial Condition", "Statements", 4),
    );
    expect(locateBalanceSheet(xml)).toMatchObject({ file: "R4.htm" });
  });

  it("is unavailable when no statement matches", () => {
    const xml = summary(report("R2.htm", "Statements of Operations"));
    expect(locateBalanceSheet(xml)).toEqual({
      kind: "unavailable",
      reason: "no balance sheet among the FilingSummary.xml statements",
    });
  });

  it("is unavailable for malformed XML, never throws", () => {
    expect(locateBalanceSheet("<FilingSummary><MyReports>").kind).toBe(
      "unavailable",
    );
    expect(locateBalanceSheet("not xml at all").kind).toBe("unavailable");
  });
});

const row = (
  cls: string,
  defref: string,
  label: string,
  ...cells: string[]
) => `<tr class="${cls}">
<td class="pl" valign="top"><a class="a" href="javascript:void(0);" onclick="Show.showAR( this, 'defref_${defref}', window );">${label}</a></td>
${cells.map((c) => `<td class="nump">${c}<span></span>\n</td>`).join("\n")}
</tr>`;

const rFile = (dates: string[], ...rows: string[]) => `<html><body>
<table class="report" border="0" cellspacing="2" id="id2">
<tr>
<th class="tl" colspan="1" rowspan="1"><div><strong>Balance Sheets - USD ($)<br> $ in Millions</strong></div></th>
${dates.map((d) => `<th class="th"><div>${d}</div></th>`).join("\n")}
</tr>
${rows.join("\n")}
</table>
<div style="display: none;"><table><tr><td>defref_us-gaap_Foo definition</td></tr></table></div>
</body></html>`;

describe("parseBalanceSheet", () => {
  it("reads LII's face lines from the real R2.htm", () => {
    const parsed = parseBalanceSheet(
      fixtureText("LII/2026Q2", "R2.htm.gz"),
      "2026-06-30",
    );
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);
    expect(parsed.scale).toBe("Millions");
    const byConcept = new Map(parsed.lines.map((l) => [l.concept, l]));
    expect(byConcept.get("us-gaap:CommercialPaper")).toEqual({
      order: 20,
      concept: "us-gaap:CommercialPaper",
      label: "Commercial paper",
      total: false,
      displayed: "412.0",
    });
    expect(
      byConcept.get("us-gaap:CashAndCashEquivalentsAtCarryingValue"),
    ).toMatchObject({
      label: "Cash and cash equivalents",
      displayed: "$ 51.5",
    });
    expect(byConcept.get("us-gaap:AssetsCurrent")?.total).toBe(true);
    // Abstract headings are not face lines.
    expect(byConcept.has("us-gaap:AssetsCurrentAbstract")).toBe(false);
    expect(
      byConcept.get("us-gaap:CommitmentsAndContingencies")?.displayed,
    ).toBe("");
  });

  it("stops at WSO's per-class sections (rows after an 'rh' heading)", () => {
    const parsed = parseBalanceSheet(
      fixtureText("WSO/2026Q2", "R4.htm.gz"),
      "2026-06-30",
    );
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);
    expect(parsed.scale).toBe("Thousands");
    expect(parsed.lines.map((l) => l.concept)).not.toContain(
      "us-gaap:CommonStockValue",
    );
    expect(parsed.lines.at(-1)?.concept).toBe(
      "us-gaap:LiabilitiesAndStockholdersEquity",
    );
    expect(
      parsed.lines.find(
        (l) =>
          l.concept ===
          "wso:LongTermLiabilitiesExcludingDeferredTaxAndOtherLiabilities",
      ),
    ).toMatchObject({ label: "Total long-term obligations", total: true });
  });

  it("picks the column dated at the balance-sheet date", () => {
    const html = rFile(
      ["Dec. 31, 2025", "Jun. 30, 2026"],
      row(
        "ro",
        "us-gaap_LongTermDebtNoncurrent",
        "Long-term debt",
        "900.0",
        "1,000.0",
      ),
    );
    const parsed = parseBalanceSheet(html, "2026-06-30");
    expect(parsed).toMatchObject({
      kind: "parsed",
      lines: [
        { concept: "us-gaap:LongTermDebtNoncurrent", displayed: "1,000.0" },
      ],
    });
  });

  it("reads long and short month names", () => {
    for (const header of [
      "Sep. 25, 2026",
      "Sept. 25, 2026",
      "September 25, 2026",
    ]) {
      const parsed = parseBalanceSheet(
        rFile([header], row("ro", "us-gaap_Cash", "Cash", "1.0")),
        "2026-09-25",
      );
      expect(parsed.kind, header).toBe("parsed");
    }
  });

  it("keeps a company-extension prefix and decodes entities in labels", () => {
    const parsed = parseBalanceSheet(
      rFile(
        ["Jun. 30, 2026"],
        row(
          "ro",
          "aaon_NewMarketTaxCreditObligationCurrent",
          "Short-term obligations of NMTC",
          "7,535",
        ),
        row(
          "re",
          "us-gaap_StockholdersEquity",
          "Total shareholders&#8217; equity",
          "&#8212;",
        ),
      ),
      "2026-06-30",
    );
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);
    expect(parsed.lines[0].concept).toBe(
      "aaon:NewMarketTaxCreditObligationCurrent",
    );
    expect(parsed.lines[1]).toMatchObject({
      label: "Total shareholders’ equity",
      total: true,
      displayed: "—",
    });
  });

  it("keeps an out-of-range numeric entity as text instead of throwing", () => {
    const parsed = parseBalanceSheet(
      rFile(
        ["Jun. 30, 2026"],
        row("ro", "us-gaap_Cash", "Cash&#99999999; &#x110000;", "1.0"),
      ),
      "2026-06-30",
    );
    if (parsed.kind !== "parsed") throw new Error(parsed.reason);
    expect(parsed.lines[0].label).toBe("Cash&#99999999; &#x110000;");
  });

  it("is unavailable when no column has the balance-sheet date", () => {
    const parsed = parseBalanceSheet(
      rFile(["Dec. 31, 2025"], row("ro", "us-gaap_Cash", "Cash", "1.0")),
      "2026-06-30",
    );
    expect(parsed).toEqual({
      kind: "unavailable",
      reason: "no column dated 2026-06-30 in the rendered balance sheet",
    });
  });

  it("is unavailable when there are no rows with concepts", () => {
    expect(parseBalanceSheet(rFile(["Jun. 30, 2026"]), "2026-06-30").kind).toBe(
      "unavailable",
    );
    expect(parseBalanceSheet("<html>garbage", "2026-06-30").kind).toBe(
      "unavailable",
    );
  });
});
