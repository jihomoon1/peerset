"use client";

import { useRef, useState } from "react";
import {
  METRIC_KEYS,
  type CompanyFundamentals,
  type MetricKey,
} from "@/domain/fundamentals";
import { formatDate } from "@/lib/format";
import {
  displayMetric,
  METRIC_LABELS,
  METRIC_UNITS,
  STATUS_WORDS,
} from "./metricDisplay";
import { ProvenanceDrawer } from "./ProvenanceDrawer";

// The seven LTM operating metrics (blueprint §6 target summary). Every value is a
// button that opens its provenance drawer.
export function OperatingBlock({ f }: { f: CompanyFundamentals }) {
  const [open, setOpen] = useState<MetricKey | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };

  return (
    <section
      aria-labelledby="operating-heading"
      className="flex flex-col gap-2"
    >
      <h2 id="operating-heading" className="text-base font-semibold">
        Operating
      </h2>
      <table className="w-full max-w-2xl border-collapse text-[13px] tabular-nums">
        <caption className="mb-1 text-left text-muted">
          Last twelve months through {formatDate(f.ltmEnd)}. USD millions except
          EPS (USD per share) and margin.
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Metric
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              LTM
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {METRIC_KEYS.map((key) => {
            const m = f.metrics[key];
            const d = displayMetric(m);
            const cautions = m.warnings.filter((w) => w.severity === "caution");
            return (
              <tr key={key} className="h-8 border-b border-rule">
                <th scope="row" className="pr-3 text-left font-normal">
                  {METRIC_LABELS[key]}{" "}
                  <span className="text-muted">({METRIC_UNITS[key]})</span>
                </th>
                <td className="pr-3 text-right">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${METRIC_LABELS[key]}: ${d.text}. Show calculation`}
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setOpen(key);
                    }}
                    className={`rounded-sm px-1 underline decoration-dotted underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent ${
                      d.kind === "value" ? "" : "text-muted"
                    }`}
                  >
                    {d.text}
                  </button>
                </td>
                <td>
                  {STATUS_WORDS[m.status]}
                  {d.note && <span className="text-muted">: {d.note}</span>}
                  {cautions.length > 0 && (
                    <span className="ml-2 text-warn">
                      {cautions.length} warning{cautions.length > 1 ? "s" : ""}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && <ProvenanceDrawer f={f} metricKey={open} onClose={close} />}
    </section>
  );
}
