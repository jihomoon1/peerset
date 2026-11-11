// The worked example on the home page: Lennox's LTM operating income, as filed. A test
// (tests/unit/lib/homeExample.test.ts) ties every value to the LII Q3 2026 golden file,
// whose values come from the rendered filings.
export const HOME_EXAMPLE = {
  company: "Lennox International (LII)",
  metric: "Operating income",
  concept: "us-gaap:OperatingIncomeLoss",
  ltmEnd: "2026-09-30",
  form: "10-Q",
  accession: "0001069202-26-000096",
  filingUrl:
    "https://www.sec.gov/Archives/edgar/data/1069202/000106920226000096/lii-20260930.htm",
  fy: { value: 1_041_500_000, start: "2025-01-01", end: "2025-12-31" },
  ytdCurrent: { value: 830_600_000, start: "2026-01-01", end: "2026-09-30" },
  ytdPrior: { value: 845_800_000, start: "2025-01-01", end: "2025-09-30" },
  ltm: 1_026_300_000,
} as const;
