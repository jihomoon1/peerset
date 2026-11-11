// The price-key guide page and the links to it. Kept apart from site.ts (which imports
// package.json) so client components can use these without bundling it.

export const PRICE_KEY_GUIDE_PATH = "/price-key";

// Alpha Vantage's own pages (checked November 10, 2026).
export const ALPHA_VANTAGE_KEY_URL =
  "https://www.alphavantage.co/support/#api-key";
export const ALPHA_VANTAGE_PREMIUM_URL = "https://www.alphavantage.co/premium/";

// Alpha Vantage's support page: a free key allows this many requests a day.
export const FREE_KEY_REQUESTS_PER_DAY = 25;
