// Links to the /methodology page (M6). Kept apart from site.ts, which imports
// package.json, so client components can use these without bundling it.

export const METHODOLOGY_PATH = "/methodology";

// The methodology section each comps column links to from its "?" (CompsTable).
// tests/unit/lib/methodologyDoc.test.ts checks every anchor exists.
export const METHODOLOGY_ANCHORS = {
  price: "12-dates-and-comparability",
  marketCap: "6-shares-and-market-capitalization",
  ev: "9-enterprise-value",
  revenue: "3-metric-definitions",
  ebitda: "4-ebitda-standardized-unadjusted",
  ebitdaMargin: "3-metric-definitions",
  evRevenue: "10-multiples-and-the-nm-policy",
  evEbitda: "10-multiples-and-the-nm-policy",
  pe: "5-diluted-eps-and-pe",
} as const;
