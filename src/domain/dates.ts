// Pure date helpers on ISO 'YYYY-MM-DD' strings. No clock access.

const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`not an ISO date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

// The ISO date n days after (or before, when negative) the given one.
export function addDays(iso: string, n: number): string {
  return new Date(toUtcMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

// A real calendar date written YYYY-MM-DD ('2026-02-30' is not).
export function isIsoDate(s: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(ms).toISOString().slice(0, 10) === s;
}
