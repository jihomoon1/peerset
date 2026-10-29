"use client";

// A statistics cell's drawer (methodology §11): the statistic, the peer values it used
// and the peers left out with their reasons (NM, "—", Unsupported, failed to load).
// The target never enters a statistic.

import { METHODOLOGY_VERSION } from "@/domain/policy";
import type { MetricStats } from "@/domain/stats";
import {
  formatMillions,
  formatMultiple,
  formatPercent,
  formatPerShare,
} from "@/lib/format";
import { Drawer, Section } from "./Drawer";

export type StatKey = "mean" | "median" | "high" | "low" | "p25" | "p75" | "n";

export const STAT_ROWS: { key: StatKey; label: string }[] = [
  { key: "mean", label: "Mean" },
  { key: "median", label: "Median" },
  { key: "high", label: "High" },
  { key: "low", label: "Low" },
  { key: "p25", label: "25th percentile" },
  { key: "p75", label: "75th percentile" },
  { key: "n", label: "n" },
];

const HOW: Record<StatKey, string> = {
  mean: "Sum of the values used ÷ how many there are.",
  median:
    "The middle value; with an even count, the average of the middle two.",
  high: "The largest value used.",
  low: "The smallest value used.",
  p25: "Excel PERCENTILE.INC at 0.25: rank (n − 1) × 0.25 in the sorted values, interpolated linearly.",
  p75: "Excel PERCENTILE.INC at 0.75: rank (n − 1) × 0.75 in the sorted values, interpolated linearly.",
  n: "Peers with a usable value; peers left out are listed below with the reason.",
};

const STATUS_TEXT = {
  nm: "NM",
  missing: "—",
  unsupported: "Unsupported",
  failed: "Failed",
} as const;

function fmt(value: number, unit: string): string {
  if (unit === "multiple") return formatMultiple(value);
  if (unit === "ratio") return formatPercent(value);
  if (unit === "USD/shares") return formatPerShare(value);
  return formatMillions(value);
}

export function StatsDrawer({
  label,
  unit,
  stat,
  stats,
  onClose,
}: {
  label: string;
  unit: string;
  stat: StatKey;
  stats: MetricStats;
  onClose: () => void;
}) {
  const statLabel = STAT_ROWS.find((r) => r.key === stat)!.label;
  const value =
    stat === "n"
      ? String(stats.nValid)
      : stats[stat] === null
        ? "—"
        : fmt(stats[stat]!, unit);
  const money = unit === "USD" ? " (USD m)" : "";
  return (
    <Drawer
      title={`${statLabel}: ${label}`}
      headline={value}
      subtitle={`Peers only; the target is excluded. ${stats.nValid} used, ${stats.nExcluded} left out.`}
      methodologyVersion={METHODOLOGY_VERSION}
      onClose={onClose}
    >
      <Section title="How it is computed">
        <p>{HOW[stat]}</p>
        {stats.nValid === 0 && stat !== "n" && (
          <p className="text-muted">
            No peer has a usable value, so there is no statistic (never 0).
          </p>
        )}
      </Section>
      <Section title={`Values used${money}`}>
        {stats.used.length === 0 ? (
          <p className="text-muted">None</p>
        ) : (
          <table className="w-full text-[13px] tabular-nums">
            <caption className="sr-only">Peer values used</caption>
            <tbody>
              {[...stats.used]
                .sort((a, b) => a.value - b.value)
                .map((u) => (
                  <tr key={u.ticker} className="border-b border-rule">
                    <th scope="row" className="py-1 text-left font-normal">
                      {u.ticker}
                    </th>
                    <td className="py-1 text-right">{fmt(u.value, unit)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Left out">
        {stats.excluded.length === 0 ? (
          <p className="text-muted">None</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {stats.excluded.map((e) => (
              <li key={e.ticker}>
                <span className="font-medium">{e.ticker}</span>:{" "}
                {STATUS_TEXT[e.status]} ({e.reason})
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Drawer>
  );
}
