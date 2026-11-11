// Export options (blueprint §17, "Slide table"). Shared by the Export panel in the
// browser and the export route, so it imports nothing heavy (no ExcelJS, no zod).
//
// "full" is the three-sheet workbook. "slide" is one clean sheet with the comps table
// and a sources footer, for pasting into a slide; its columns and summary rows are the
// user's choice. Options choose what is shown; they never carry a number.

import { ALL_COMPS_COLUMNS, type CompsColumn } from "@/domain/comps";
import type { IssuerKind } from "@/domain/types";

export const SLIDE_STATS = [
  "mean",
  "median",
  "high",
  "low",
  "p25",
  "p75",
] as const;
export type SlideStat = (typeof SLIDE_STATS)[number];

export const SLIDE_STAT_LABEL: Record<SlideStat, string> = {
  mean: "Mean",
  median: "Median",
  high: "High",
  low: "Low",
  p25: "25th percentile",
  p75: "75th percentile",
};

// Headers as on the Trading Comps sheet.
export const SLIDE_COLUMN_LABEL: Record<CompsColumn, string> = {
  price: "Price",
  marketCap: "Equity value",
  ev: "EV",
  revenue: "LTM revenue",
  ebitda: "LTM EBITDA",
  ebitdaMargin: "EBITDA margin",
  evRevenue: "EV/Revenue",
  evEbitda: "EV/EBITDA",
  pe: "P/E",
  digitalAssets: "Digital assets",
  mcapToDigitalAssets: "Mkt cap ÷ digital assets",
  commonEquity: "Common equity",
  tangibleCommonEquity: "Tangible common equity",
  rotce: "ROTCE (LTM)",
  priceToBook: "P/BV",
  priceToTangibleBook: "P/TBV",
};

export interface SlideOptions {
  columns: CompsColumn[];
  stats: SlideStat[];
}

export type ExportOptions =
  { layout: "full" } | ({ layout: "slide" } & SlideOptions);

// What a pitch slide usually shows: size, the two operating lines, and the multiples.
export const DEFAULT_SLIDE_OPTIONS: SlideOptions = {
  columns: ["ev", "revenue", "ebitda", "ebitdaMargin", "evRevenue", "evEbitda"],
  stats: ["mean", "median"],
};

// §13B: banks and digital-asset companies start from their own columns.
export function defaultSlideOptions(kind: IssuerKind): SlideOptions {
  if (kind === "bank")
    return {
      columns: [
        "marketCap",
        "rotce",
        "pe",
        "priceToBook",
        "priceToTangibleBook",
      ],
      stats: ["mean", "median"],
    };
  if (kind === "digitalAsset")
    return {
      columns: [...DEFAULT_SLIDE_OPTIONS.columns, "mcapToDigitalAssets"],
      stats: ["mean", "median"],
    };
  return DEFAULT_SLIDE_OPTIONS;
}

// The chosen keys in the table's own order, each once.
export function normalizeSlideOptions(o: SlideOptions): SlideOptions {
  return {
    columns: ALL_COMPS_COLUMNS.filter((c) => o.columns.includes(c)),
    stats: SLIDE_STATS.filter((s) => o.stats.includes(s)),
  };
}
