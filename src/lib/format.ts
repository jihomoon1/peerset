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
