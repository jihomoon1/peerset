"use client";

// Implied valuation (methodology §13, blueprint §6 stretch): the target's LTM metric at
// the peers' 25th percentile, median and 75th percentile multiple, bridged to an
// implied share price. A row whose inputs aren't all valid shows its reason, never a
// number. The arithmetic for each value is in the "Show math" disclosure.

import type { CompsTable } from "@/domain/comps";
import {
  IMPLIED_MULTIPLES,
  IMPLIED_POINTS,
  impliedValuation,
} from "@/domain/impliedValuation";
import { formatMillions, formatMultiple, formatPrice } from "@/lib/format";

const POINT_LABEL = {
  p25: "25th percentile",
  median: "Median",
  p75: "75th percentile",
} as const;

export function ImpliedValuationBlock({ table }: { table: CompsTable }) {
  const { target } = table;
  const v = target.valuation!;
  const results = impliedValuation({
    revenue: target.cells!.revenue,
    ebitda: target.cells!.ebitda,
    totalDebt: v.bridge.totalDebt,
    cash: v.bridge.cashAndInvestments,
    shares: v.shareClasses.map((c) => c.shares),
    stats: table.stats,
  });

  return (
    <section
      aria-labelledby="implied-heading"
      className="flex flex-col gap-2 text-[13px]"
    >
      <h3 id="implied-heading" className="text-sm font-semibold">
        Implied valuation of {target.ticker}
      </h3>
      <p className="text-muted">
        {target.ticker}&apos;s LTM metric × the peers&apos; multiple = implied
        EV; − total debt + cash = implied equity; ÷ shares = implied price (USD
        per share). Peers only; arithmetic, not a price target.
      </p>
      <table className="w-full max-w-2xl border-collapse tabular-nums">
        <caption className="sr-only">
          Implied price per share of {target.ticker} at peer multiples
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Peer multiple
            </th>
            {IMPLIED_POINTS.map((p) => (
              <th
                key={p}
                scope="col"
                className="py-1.5 pr-3 text-right font-medium"
              >
                {POINT_LABEL[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {IMPLIED_MULTIPLES.map((spec) => {
            const r = results[spec.key];
            return (
              <tr key={spec.key} className="h-8 border-b border-rule">
                <th scope="row" className="pr-3 text-left font-normal">
                  {spec.label}
                </th>
                {r.status === "ok" ? (
                  IMPLIED_POINTS.map((p) => (
                    <td key={p} className="pr-3 text-right">
                      {formatPrice(r.points[p].impliedPrice)}
                    </td>
                  ))
                ) : (
                  <td colSpan={3} className="text-muted">
                    Unsupported: {r.reason}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <details>
        <summary className="cursor-pointer text-muted">Show math</summary>
        <ul className="mt-1 flex flex-col gap-1 tabular-nums">
          {IMPLIED_MULTIPLES.flatMap((spec) => {
            const r = results[spec.key];
            if (r.status !== "ok") return [];
            return IMPLIED_POINTS.map((p) => {
              const x = r.points[p];
              return (
                <li key={`${spec.key}-${p}`}>
                  {spec.label}, {POINT_LABEL[p].toLowerCase()} of {r.nPeers}{" "}
                  peers: {formatMillions(r.metricValue)} ×{" "}
                  {formatMultiple(x.multiple, 4)} ={" "}
                  {formatMillions(x.impliedEv)} EV; −{" "}
                  {formatMillions(r.totalDebt)} debt + {formatMillions(r.cash)}{" "}
                  cash = {formatMillions(x.impliedEquity)} equity; ÷{" "}
                  {r.shares.toLocaleString("en-US")} shares ={" "}
                  {formatPrice(x.impliedPrice)} (USD m except shares and price)
                </li>
              );
            });
          })}
        </ul>
      </details>
    </section>
  );
}
