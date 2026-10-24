// SEC URL builders (blueprint §8.1). data.sec.gov uses the 10-digit CIK; archive
// paths use the unpadded CIK and the accession without dashes.

const ARCHIVES = "https://www.sec.gov/Archives/edgar/data";

export function padCik(cik: string | number): string {
  return String(cik).replace(/^0+/, "").padStart(10, "0");
}

function archiveBase(cik: string, accession: string): string {
  return `${ARCHIVES}/${Number(cik)}/${accession.replaceAll("-", "")}`;
}

export const submissionsUrl = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;

export const companyFactsUrl = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;

// Human-readable filing index, used for provenance links.
export const filingIndexPageUrl = (cik: string, accession: string) =>
  `${archiveBase(cik, accession)}/${accession}-index.htm`;

// Machine-readable directory listing, used to locate the XBRL instance.
export const filingIndexJsonUrl = (cik: string, accession: string) =>
  `${archiveBase(cik, accession)}/index.json`;

export const filingDocumentUrl = (
  cik: string,
  accession: string,
  name: string,
) => `${archiveBase(cik, accession)}/${name}`;
