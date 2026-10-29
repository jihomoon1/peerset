// The peer index (blueprint §10.1): one record per company listed on a major exchange,
// built monthly from SEC bulk files by scripts/build-peer-index.ts and committed as
// data/peer-index.json. Raw facts only: whether a company is eligible on a given date
// is decided when screening (src/peers/screen.ts), never baked in.

import type { Listing } from "@/domain/types";

// SEC's exchange labels in company_tickers_exchange.json for NYSE, Nasdaq, NYSE
// American and Cboe. SEC has no separate NYSE American label (those companies are
// "NYSE"); OTC, TXSE and blank are not major exchanges (M4a).
export const MAJOR_EXCHANGES: ReadonlySet<string> = new Set([
  "NYSE",
  "Nasdaq",
  "CBOE",
]);

export interface PeerIndexCompany {
  cik: string; // 10-digit, zero-padded
  name: string;
  ticker: string; // primary: SEC's first listed major-exchange ticker
  listings: Listing[]; // major-exchange listings, SEC's order
  sic: string; // "" when SEC has none
  sicDescription: string;
  fiscalYearEnd: string; // 'MMDD'
  incorporation: string; // state or country code from submissions
  latest: {
    form: string; // 10-K, 10-Q, their /A, 20-F, 40-F or a transition form
    filedDate: string;
    reportDate: string;
    accession: string;
  } | null;
  files20F: boolean; // latest report is a 20-F or 40-F (or /A)
  revenue: {
    value: number; // USD, full units: screening revenue (latest FY), never LTM
    periodEnd: string;
    concept: string;
    accession: string;
  } | null;
  revenueNote: string | null; // why revenue is null
}

export interface PeerIndexSource {
  url: string;
  lastModified: string; // the response's Last-Modified header, as sent
}

export interface PeerIndexMeta {
  generatedAt: string; // ISO timestamp
  methodologyVersion: string;
  sources: {
    tickers: PeerIndexSource;
    submissions: PeerIndexSource;
    companyfacts: PeerIndexSource;
  };
  counts: {
    total: number; // CIKs in SEC's ticker list
    listed: number; // with a major-exchange ticker: the companies below
    withRevenue: number;
    // Listed companies a screen on the generation date would exclude, by reason.
    byExclusionReason: Record<string, number>;
    // Bulk entries that failed SEC schema validation (kept, without that data).
    unreadable: { submissions: number; companyfacts: number };
  };
}

export interface PeerIndex {
  meta: PeerIndexMeta;
  companies: PeerIndexCompany[]; // sorted by CIK
  // Tickers SEC lists only off the major exchanges (OTC, TXSE, blank), so a lookup can
  // say "not listed on a major exchange" instead of "unknown ticker".
  unlisted: Listing[];
}
