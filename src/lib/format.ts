// Display formatting. The only place (with the workbook writer) where full units are
// turned into millions or rounded (CLAUDE.md invariant 2).

import { PEER_REVENUE_SCREEN } from "@/domain/policy";

// A nonzero value too small to show at this precision reads "<0.1", never "0.0",
// which would look like zero (AAON's $13,000 cash, M4a). Exact zero stays "0.0".
export function formatMillions(value: number, decimals = 1): string {
  const millions = Math.abs(value) / 1_000_000;
  const text =
    value !== 0 && millions < 0.5 / 10 ** decimals
      ? `<${(1 / 10 ** decimals).toFixed(decimals)}`
      : millions.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  return value < 0 ? `(${text})` : text;
}

// True when formatMillions would show "<0.1": the exact amount should be shown too.
export function isBelowDisplayPrecision(value: number, decimals = 1): boolean {
  return formatMillions(value, decimals).includes("<");
}

// Full units, for the drawer and tooltip next to a "<0.1": "$13,000", "42,000 shares".
export function formatExactAmount(
  value: number,
  unit: "USD" | "shares",
): string {
  const digits = Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  const text = unit === "USD" ? `$${digits}` : `${digits} shares`;
  return value < 0 ? `(${text})` : text;
}

// A size ratio for peer reasons, "0.6x" (blueprint §10.2). A nonzero ratio too small
// for one decimal reads "<0.1x", never "0.0x".
export function formatRatioX(ratio: number): string {
  if (ratio !== 0 && Math.abs(ratio) < 0.05) return "<0.1x";
  return `${ratio.toFixed(1)}x`;
}

// A size ratio in screening text (methodology §13A). One decimal, except where one
// decimal would land on a band edge (0.2x, 5.0x) for a ratio that isn't exactly the
// edge: then two decimals, and "<0.20x" / ">5.00x" when even two land on the edge.
// So an excluded company never reads "0.2x … allowed 0.2x–5x".
export function formatBandRatio(
  ratio: number,
  band: { min: number; max: number } = PEER_REVENUE_SCREEN,
): string {
  const one = formatRatioX(ratio);
  const edges = [band.min, band.max];
  if (!edges.some((e) => one === `${e.toFixed(1)}x`) || edges.includes(ratio))
    return one;
  const two = ratio.toFixed(2);
  if (ratio < band.min && two === band.min.toFixed(2)) return `<${two}x`;
  if (ratio > band.max && two === band.max.toFixed(2)) return `>${two}x`;
  return `${two}x`;
}

function withParens(value: number, text: string): string {
  return value < 0 ? `(${text})` : text;
}

const fixed = (value: number, decimals: number) =>
  Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// Dollars per share, two decimals.
export function formatPerShare(value: number): string {
  return withParens(value, fixed(value, 2));
}

// A ratio (0.2197) as a percentage with one decimal ("22.0%").
export function formatPercent(ratio: number): string {
  return withParens(ratio, `${fixed(ratio * 100, 1)}%`);
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// 'YYYY-MM-DD' → 'Month D, YYYY'. No Date object, so no time-zone shifts.
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

// A multiple to one decimal ("16.1x", blueprint §6). NM and negatives never reach
// here: the NM policy withholds them.
// The implied-valuation math shows four decimals so the arithmetic can be redone.
export function formatMultiple(value: number, decimals = 1): string {
  return withParens(value, `${fixed(value, decimals)}x`);
}

// A share price in dollars, two decimals ("1,234.50").
export function formatPrice(value: number): string {
  return withParens(value, fixed(value, 2));
}

// A whole share count ("34,560,675").
export function formatShares(value: number): string {
  return withParens(value, fixed(value, 0));
}

// ISO timestamp → 'Month D, YYYY, HH:MM UTC'. UTC, so server and browser agree.
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d.toISOString().slice(0, 10))}, ${hh}:${mm} UTC`;
}
