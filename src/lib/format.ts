// Display formatting. The only place (with the workbook writer) where full units are
// turned into millions or rounded (CLAUDE.md invariant 2).

export function formatMillions(value: number, decimals = 1): string {
  const text = (Math.abs(value) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${text})` : text;
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
export function formatMultiple(value: number): string {
  return withParens(value, `${fixed(value, 1)}x`);
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
