"use client";

// The ratios PeerSet adds for digital-asset companies and banks (methodology §13C,
// §13D): market cap ÷ digital assets, P/BV, P/TBV and ROTCE. Shows the status, the
// formula, each input's value and the warnings, like the other drawers.

import type { CompanyFundamentals } from "@/domain/fundamentals";
import { NM_REASON_TEXT } from "@/domain/nm";
import type { Metric } from "@/domain/types";
import { formatMillions, formatMultiple, formatPercent } from "@/lib/format";
import { Drawer, Section, WarningList } from "./Drawer";

const INPUT_LABELS: Record<string, string> = {
  "market cap": "Market cap",
  "digital assets": "Digital assets",
  "common equity": "Common equity",
  "tangible common equity": "Tangible common equity",
  netIncomeToCommon: "LTM net income to common",
  tangibleCommonEquity: "Tangible common equity",
};

function headlineOf(m: Metric, unit: "multiple" | "ratio"): string {
  if (m.status === "reported" || m.status === "derived")
    return unit === "ratio" ? formatPercent(m.value) : formatMultiple(m.value);
  if (m.status === "nm") return `NM (${NM_REASON_TEXT[m.reason]})`;
  if (m.status === "missing") return "—";
  return "Unsupported";
}

export function KindRatioDrawer({
  f,
  title,
  metric: m,
  unit,
  onClose,
}: {
  f: CompanyFundamentals;
  title: string;
  metric: Metric;
  unit: "multiple" | "ratio";
  onClose: () => void;
}) {
  const inputs =
    m.status === "reported" || m.status === "derived" || m.status === "nm"
      ? m.inputs.flatMap((p) => ("metric" in p ? [p] : []))
      : [];
  return (
    <Drawer
      title={`${title}: ${f.identity.ticker}`}
      headline={headlineOf(m, unit)}
      subtitle={`balance sheet at ${f.balanceSheet.date}`}
      methodologyVersion={f.methodologyVersion}
      onClose={onClose}
    >
      <Section title="Status">
        <p>
          {m.status[0].toUpperCase() + m.status.slice(1)}
          {m.status === "missing" && <>: {m.reason}</>}
          {m.status === "unsupported" && <>: {m.reason.message}</>}
          {m.status === "nm" && <>: {NM_REASON_TEXT[m.reason]}</>}
        </p>
      </Section>
      {(m.status === "reported" || m.status === "derived") && (
        <Section title="Formula">
          <p>{m.formula}</p>
        </Section>
      )}
      {inputs.length > 0 && (
        <Section title="Inputs (USD m)">
          <ul className="flex flex-col gap-0.5 tabular-nums">
            {inputs.map((p) => (
              <li key={p.metric}>
                {INPUT_LABELS[p.metric] ?? p.metric}: {formatMillions(p.value)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <WarningList warnings={m.warnings} />
    </Drawer>
  );
}
