// Builds the synthetic copies of SEC's bulk files in this folder: a ticker list and
// tiny submissions.zip / companyfacts.zip. All companies are invented. Regenerate with
//   npx tsx tests/fixtures/peer-index/generate.ts
//
// Coverage: listed (NYSE, Nasdaq, CBOE) vs off-exchange (OTC, TXSE, blank), a
// two-class listing, 10-K/10-Q vs 20-F filers, missing revenue, a 53-week fiscal year,
// a revenue concept switch, a listed company with no submissions entry, and a
// submissions overflow page that must be skipped.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { makeZip } from "../../helpers/zip";

const DIR = path.join("tests", "fixtures", "peer-index");
const cikFile = (cik: number) => `CIK${String(cik).padStart(10, "0")}.json`;

const tickers = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [1, "Alpha HVAC Inc", "ALFA", "NYSE"],
    [2, "Otc Only Corp", "OTCO", "OTC"],
    [3, "Foreign Co Plc", "FRGN", "NYSE"],
    [4, "No Revenue Inc", "NORV", "Nasdaq"],
    [5, "Week 53 Corp", "WK53", "Nasdaq"],
    [6, "Switch Co", "SWCH", "CBOE"],
    [1, "Alpha HVAC Inc", "ALFA-B", "NYSE"],
    [7, "Texas Co", "TXCO", "TXSE"],
    [8, "Blank Exchange Co", "BLNK", null],
    [9, "No Submissions Inc", "NOSB", "NYSE"],
  ],
};

interface Filing {
  accession: string;
  form: string;
  filed: string;
  report: string;
}

function submissions(
  cik: number,
  name: string,
  sic: string,
  fye: string,
  inc: string,
  listed: [string, string | null][],
  filings: Filing[],
) {
  return {
    cik: String(cik),
    name,
    sic,
    sicDescription: sic ? `Industry ${sic}` : null,
    tickers: listed.map(([t]) => t),
    exchanges: listed.map(([, e]) => e),
    fiscalYearEnd: fye,
    stateOfIncorporation: inc,
    filings: {
      recent: {
        accessionNumber: filings.map((f) => f.accession),
        filingDate: filings.map((f) => f.filed),
        reportDate: filings.map((f) => f.report),
        form: filings.map((f) => f.form),
        primaryDocument: filings.map(() => "doc.htm"),
      },
    },
  };
}

const usd = (
  facts: { start: string; end: string; val: number; accn: string; form: string; filed: string }[],
) => ({ units: { USD: facts } });

function companyfacts(cik: number, name: string, usGaap: Record<string, unknown>, extra = {}) {
  return { cik, entityName: name, facts: { "us-gaap": usGaap, ...extra } };
}

const subs = [
  submissions(1, "Alpha HVAC Inc", "3585", "1231", "DE", [["ALFA", "NYSE"], ["ALFA-B", "NYSE"]], [
    { accession: "0000000001-26-000002", form: "10-Q", filed: "2026-07-29", report: "2026-06-30" },
    { accession: "0000000001-26-000001", form: "10-K", filed: "2026-02-15", report: "2025-12-31" },
    { accession: "0000000001-26-000003", form: "8-K", filed: "2026-08-01", report: "" },
  ]),
  submissions(2, "Otc Only Corp", "3585", "1231", "NV", [["OTCO", "OTC"]], [
    { accession: "0000000002-26-000001", form: "10-K", filed: "2026-03-01", report: "2025-12-31" },
  ]),
  submissions(3, "Foreign Co Plc", "3585", "1231", "X0", [["FRGN", "NYSE"]], [
    { accession: "0000000003-26-000001", form: "20-F", filed: "2026-04-20", report: "2025-12-31" },
  ]),
  submissions(4, "No Revenue Inc", "3580", "0630", "DE", [["NORV", "Nasdaq"]], [
    { accession: "0000000004-26-000001", form: "10-Q", filed: "2026-08-10", report: "2026-06-30" },
  ]),
  submissions(5, "Week 53 Corp", "3585", "0103", "OH", [["WK53", "Nasdaq"]], [
    { accession: "0000000005-26-000001", form: "10-K", filed: "2026-02-25", report: "2026-01-03" },
  ]),
  submissions(6, "Switch Co", "3561", "1231", "MN", [["SWCH", "CBOE"]], [
    { accession: "0000000006-26-000001", form: "10-K", filed: "2026-02-20", report: "2025-12-31" },
  ]),
  submissions(7, "Texas Co", "3585", "1231", "TX", [["TXCO", "TXSE"]], []),
];

const ASC606 = "RevenueFromContractWithCustomerExcludingAssessedTax";
const facts = [
  companyfacts(1, "Alpha HVAC Inc", {
    [ASC606]: usd([
      { start: "2024-01-01", end: "2024-12-31", val: 900_000_000, accn: "0000000001-25-000001", form: "10-K", filed: "2025-02-15" },
      { start: "2024-01-01", end: "2024-12-31", val: 900_000_000, accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15" },
      { start: "2025-01-01", end: "2025-12-31", val: 1_000_000_000, accn: "0000000001-26-000001", form: "10-K", filed: "2026-02-15" },
      { start: "2026-01-01", end: "2026-06-30", val: 550_000_000, accn: "0000000001-26-000002", form: "10-Q", filed: "2026-07-29" },
    ]),
  }),
  companyfacts(2, "Otc Only Corp", {
    [ASC606]: usd([
      { start: "2025-01-01", end: "2025-12-31", val: 5_000_000, accn: "0000000002-26-000001", form: "10-K", filed: "2026-03-01" },
    ]),
  }),
  companyfacts(3, "Foreign Co Plc", {}, {
    "ifrs-full": { Revenue: usd([{ start: "2025-01-01", end: "2025-12-31", val: 3_000_000_000, accn: "0000000003-26-000001", form: "20-F", filed: "2026-04-20" }]) },
  }),
  companyfacts(4, "No Revenue Inc", {
    NetIncomeLoss: usd([
      { start: "2024-07-01", end: "2025-06-30", val: -4_000_000, accn: "0000000004-25-000001", form: "10-K", filed: "2025-09-01" },
    ]),
  }),
  companyfacts(5, "Week 53 Corp", {
    Revenues: usd([
      { start: "2024-12-29", end: "2026-01-03", val: 2_000_000_000, accn: "0000000005-26-000001", form: "10-K", filed: "2026-02-25" },
    ]),
  }),
  companyfacts(6, "Switch Co", {
    SalesRevenueNet: usd([
      { start: "2017-01-01", end: "2017-12-31", val: 300_000_000, accn: "0000000006-18-000001", form: "10-K", filed: "2018-02-20" },
    ]),
    [ASC606]: usd([
      { start: "2025-01-01", end: "2025-12-31", val: 450_000_000, accn: "0000000006-26-000001", form: "10-K", filed: "2026-02-20" },
    ]),
  }),
];

writeFileSync(path.join(DIR, "company_tickers_exchange.json"), JSON.stringify(tickers));
writeFileSync(
  path.join(DIR, "submissions.zip"),
  makeZip([
    ...subs.map((s) => ({ name: cikFile(Number(s.cik)), data: JSON.stringify(s) })),
    // An overflow page: older filings only, a different shape. Must be skipped.
    { name: "CIK0000000001-submissions-001.json", data: JSON.stringify({ accessionNumber: [] }) },
  ]),
);
writeFileSync(
  path.join(DIR, "companyfacts.zip"),
  makeZip(facts.map((f) => ({ name: cikFile(f.cik), data: JSON.stringify(f) }))),
);
console.log("wrote", DIR);
