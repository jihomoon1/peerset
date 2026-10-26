"use client";

import type { BridgeLine } from "@/domain/enterpriseValue";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import { mergeWarnings } from "@/domain/metrics/common";
import type { Valuation } from "@/domain/valuation";
import {
  formatDate,
  formatMillions,
  formatPrice,
  formatShares,
} from "@/lib/format";
import { Drawer, Section, WarningList } from "./Drawer";
import { displayValuationCell } from "./pricing";

const NOT_IN_EV_LABELS = {
  preferred: "Preferred stock",
  nci: "Noncontrolling interest",
} as const;

function Lines({ caption, lines }: { caption: string; lines: BridgeLine[] }) {
  if (lines.length === 0) return <p className="text-muted">None</p>;
  return (
    <table className="w-full border-collapse tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-rule text-left text-muted">
          <th scope="col" className="py-1 pr-2 font-normal">
            Line
          </th>
          <th scope="col" className="py-1 pr-2 text-right font-normal">
            USD m
          </th>
          <th scope="col" className="py-1 font-normal">
            In EV?
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-rule align-top">
            <th scope="row" className="py-1 pr-2 text-left font-normal">
              {l.label}
              <div className="font-mono text-xs text-muted">{l.concept}</div>
            </th>
            <td className="py-1 pr-2 text-right">
              {l.value === null ? "—" : formatMillions(l.value)}
            </td>
            <td className="py-1">
              <span className={l.included ? "font-medium" : "text-muted"}>
                {l.included ? "Included" : "Excluded"}
              </span>
              <div className="text-xs text-muted">{l.why}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The EV bridge (methodology §6, §9): market cap by class, every debt and cash line
// from the balance-sheet face, the items left out of EV, EV, and the three dates.
export function EvBridgeDrawer({
  f,
  v,
  onClose,
}: {
  f: CompanyFundamentals;
  v: Valuation;
  onClose: () => void;
}) {
  const { bridge } = v;
  const ev = displayValuationCell(bridge.enterpriseValue, "USD", v.needsPrice);
  const cap = displayValuationCell(bridge.marketCap, "USD", v.needsPrice);
  const cell = (m: Parameters<typeof displayValuationCell>[0]) =>
    displayValuationCell(m, "USD", v.needsPrice).text;
  const warnings = mergeWarnings(
    bridge.marketCap.warnings,
    bridge.totalDebt.warnings,
    bridge.cashAndInvestments.warnings,
    bridge.enterpriseValue.warnings,
  );

  return (
    <Drawer
      title="Enterprise value bridge"
      headline={ev.text}
      subtitle="USD m"
      methodologyVersion={f.methodologyVersion}
      onClose={onClose}
    >
      <Section title="Formula">
        <p>EV = market cap + total debt − cash and short-term investments</p>
        {ev.note && <p className="text-muted">{ev.note}</p>}
      </Section>

      <Section title="Dates">
        <table className="w-full border-collapse">
          <caption className="sr-only">Dates behind EV</caption>
          <tbody>
            {(
              [
                ["Prices as of", bridge.dates.price],
                ["Balance sheet at", bridge.dates.balanceSheet],
                ["Shares as of (cover page)", bridge.dates.sharesAsOf],
              ] as const
            ).map(([label, date]) => (
              <tr key={label} className="border-b border-rule">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {label}
                </th>
                <td className="py-1">{date ? formatDate(date) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Market cap: ${cap.text}`}>
        <table className="w-full border-collapse tabular-nums">
          <caption className="sr-only">Market cap by share class</caption>
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th scope="col" className="py-1 pr-2 font-normal">
                Class
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">
                Price
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">
                Shares
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                USD m
              </th>
            </tr>
          </thead>
          <tbody>
            {v.shareClasses.map((c) => (
              <tr
                key={c.classMember}
                className="border-b border-rule align-top"
              >
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {c.ticker ?? "Unlisted"}
                  <div className="font-mono text-xs text-muted">
                    {c.classMember}
                  </div>
                </th>
                <td className="py-1 pr-2 text-right">
                  {c.quote ? formatPrice(c.quote.close) : "—"}
                </td>
                <td className="py-1 pr-2 text-right">
                  {formatShares(c.shares)}
                </td>
                <td className="py-1 text-right">{cell(c.equityValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cap.note && <p className="mt-1 text-muted">{cap.note}</p>}
      </Section>

      <Section title={`Plus total debt: ${cell(bridge.totalDebt)}`}>
        <Lines caption="Debt lines" lines={bridge.debtLines} />
      </Section>

      <Section
        title={`Less cash and short-term investments: ${cell(bridge.cashAndInvestments)}`}
      >
        <Lines caption="Cash lines" lines={bridge.cashLines} />
      </Section>

      <Section title="Not in EV">
        <table className="w-full border-collapse tabular-nums">
          <caption className="sr-only">Items left out of EV</caption>
          <tbody>
            {bridge.notInEv.map((n) => (
              <tr key={n.item} className="border-b border-rule">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {NOT_IN_EV_LABELS[n.item]}
                </th>
                <td className="py-1 text-right">
                  {"value" in n
                    ? `${formatMillions(n.value)} USD m`
                    : n.status === "missing"
                      ? "— (no line on the balance sheet)"
                      : "Unsupported"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <WarningList warnings={warnings} />
    </Drawer>
  );
}
