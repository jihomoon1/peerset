// When a cached quote goes stale (blueprint §14): 6 p.m. ET on the next weekday, by
// which time that day's close is published. Market holidays are not modeled: on a
// holiday the cache refreshes once more and gets the same close back.

const ZONE = "America/New_York";
const REFRESH_HOUR_ET = 18;

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

function etParts(d: Date) {
  const p = Object.fromEntries(
    parts.formatToParts(d).map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    weekday: p.weekday as string,
  };
}

// The UTC instant of hh:00 ET on an ET calendar date (offset found by probing).
function etWallTime(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(guess + offsetHours * 3_600_000);
    const p = etParts(candidate);
    if (p.date === date && p.hour === hour) return candidate;
  }
  throw new RangeError(`no ${hour}:00 ET on ${date}`);
}

function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const WEEKEND = new Set(["Sat", "Sun"]);

export function nextQuoteRefresh(now: Date): {
  cutoff: Date;
  cutoffDate: string; // ET calendar date of the cutoff, used in cache keys
  seconds: number;
} {
  let date = etParts(now).date;
  for (let i = 0; i < 8; i++) {
    const cutoff = etWallTime(date, REFRESH_HOUR_ET);
    if (!WEEKEND.has(etParts(cutoff).weekday) && cutoff > now)
      return {
        cutoff,
        cutoffDate: date,
        seconds: Math.ceil((cutoff.getTime() - now.getTime()) / 1000),
      };
    date = nextDate(date);
  }
  throw new RangeError("no weekday cutoff within a week");
}
