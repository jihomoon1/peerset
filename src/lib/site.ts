// Fixed text and links shared by the app shell (M3).

import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
export const REPO_URL = "https://github.com/jihomoon1/peerset";
export const METHODOLOGY_URL = `${REPO_URL}/blob/main/docs/methodology.md`;

// Blueprint §1 positioning, shown on screen.
export const DISCLAIMER =
  "Automated first-pass comps from SEC filings. Unadjusted. Not a substitute for analyst review.";

export const SITE_DESCRIPTION =
  "First-pass trading comps from SEC filings, with every number traceable to its filing, period and XBRL concept.";
