// The two cases on the Why PeerSet page. A test (tests/unit/lib/aboutEvidence.test.ts)
// ties every value to the CARR and WSO Q2 2026 balance golden files, whose values are
// read from the rendered filings. Full units (dollars), per invariant 2.
export const ABOUT_EVIDENCE = {
  carrier: {
    company: "Carrier Global (CARR)",
    date: "2026-06-30",
    form: "10-Q",
    accession: "0001783180-26-000032",
    statementUrl:
      "https://www.sec.gov/Archives/edgar/data/1783180/000178318026000032/R4.htm",
    lines: [
      {
        label: "Short-term borrowings and current portion of long-term debt",
        value: 1_638_000_000,
      },
      { label: "Long-term debt", value: 10_314_000_000 },
    ],
    faceTotal: 11_952_000_000,
    tagConcept: "us-gaap:DebtAndCapitalLeaseObligations",
    tagValue: 11_230_000_000,
    gap: 722_000_000,
  },
  watsco: {
    company: "Watsco (WSO)",
    date: "2026-06-30",
    form: "10-Q",
    accession: "0001193125-26-340204",
    statementUrl:
      "https://www.sec.gov/Archives/edgar/data/105016/000119312526340204/R4.htm",
    excluded: {
      label: "Current portion of lease liabilities",
      concept: "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent",
      value: 119_723_000,
    },
    counted: {
      label: "Finance lease liabilities, net of current portion",
      value: 9_068_000,
    },
    operatingNoncurrent: 406_478_000,
    total: 9_068_000,
    byTagAlone: 128_791_000,
  },
} as const;
