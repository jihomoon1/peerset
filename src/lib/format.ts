// Display formatting. The only place (with the workbook writer) where full units are
// turned into millions or rounded (CLAUDE.md invariant 2).

export function formatMillions(value: number, decimals = 1): string {
  const text = (Math.abs(value) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${text})` : text;
}
