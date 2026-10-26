"use client";

import type { CompanyFundamentals } from "@/domain/fundamentals";
import { formatDate, formatMillions } from "@/lib/format";
import { Drawer, Section, WarningList } from "./Drawer";
import { displayMetric } from "./metricDisplay";

export type BalanceSheetKey = "debt" | "cash";

export const BALANCE_SHEET_LABELS: Record<BalanceSheetKey, string> = {
  debt: "Total debt",
  cash: "Cash and short-term investments",
};

// Provenance for a balance-sheet item (methodology §7–§8): every face line the rule
// looked at, with its label, concept, value and why it is in or out of the total.
export function BalanceSheetDrawer({
  f,
  item,
  onClose,
}: {
  f: CompanyFundamentals;
  item: BalanceSheetKey;
  onClose: () => void;
}) {
  const { metric: m, lines, method } = f[item];
  const d = displayMetric(m);
  const { statement, date } = f.balanceSheet;

  return (
    <Drawer
      title={BALANCE_SHEET_LABELS[item]}
      headline={d.text}
      subtitle={`USD m · at ${formatDate(date)}`}
      methodologyVersion={f.methodologyVersion}
      onClose={onClose}
    >
      <Section title="Status">
        <p>
          {m.status[0].toUpperCase() + m.status.slice(1)}
          {d.note && <>: {d.note}</>}
        </p>
      </Section>

      {(m.status === "reported" || m.status === "derived") && (
        <Section title="Formula">
          <p>{m.formula}</p>
        </Section>
      )}

      <Section title="Source">
        {statement ? (
          <p>
            Balance-sheet lines from{" "}
            <a
              href={statement.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {statement.name}
            </a>
            ; values from the filing&apos;s XBRL at full precision.
          </p>
        ) : (
          <p>
            The rendered balance sheet could not be read, so the{" "}
            {method === "tags" ? "0.2.1 tag rules" : "face rules"} were used.
          </p>
        )}
      </Section>

      <Section title={method === "face" ? "Balance-sheet lines" : "Tags used"}>
        {lines.length === 0 ? (
          <p className="text-muted">None</p>
        ) : (
          <table className="w-full border-collapse tabular-nums">
            <caption className="sr-only">
              {BALANCE_SHEET_LABELS[item]}: lines considered
            </caption>
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                <th scope="col" className="py-1 pr-2 font-normal">
                  Line
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-normal">
                  USD m
                </th>
                <th scope="col" className="py-1 font-normal">
                  In total?
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-rule align-top">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {l.label}
                    <div className="font-mono text-xs text-muted">
                      {l.concept}
                    </div>
                  </th>
                  <td className="py-1 pr-2 text-right">
                    {l.value === null ? "—" : formatMillions(l.value)}
                  </td>
                  <td className="py-1">
                    <span className={l.included ? "font-medium" : "text-muted"}>
                      {l.included ? "Included" : "Excluded"}
                    </span>
                    <div className="text-xs text-muted">{l.reason}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <WarningList warnings={m.warnings} />
    </Drawer>
  );
}
