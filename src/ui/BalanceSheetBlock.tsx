"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import { formatDate } from "@/lib/format";
import {
  BALANCE_SHEET_LABELS,
  BalanceSheetDrawer,
  type BalanceSheetKey,
} from "./BalanceSheetDrawer";
import { displayMetric, STATUS_WORDS } from "./metricDisplay";

const ITEMS: BalanceSheetKey[] = ["debt", "cash"];

// Total debt and cash at the balance-sheet date (methodology §7–§8), the EV inputs
// that need no price. Market cap and EV are in the valuation block.
export function BalanceSheetBlock({ f }: { f: CompanyFundamentals }) {
  const [open, setOpen] = useState<BalanceSheetKey | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = () => setOpen(null);
  // Return focus once the drawer has unmounted: while its modal dialog is open the
  // rest of the page is inert and focus() is ignored.
  useEffect(() => {
    if (!open) opener.current?.focus();
  }, [open]);

  return (
    <section aria-labelledby="balance-heading" className="flex flex-col gap-2">
      <h2 id="balance-heading" className="text-base font-semibold">
        Balance sheet (for EV)
      </h2>
      <table className="w-full max-w-2xl border-collapse text-[13px] tabular-nums">
        <caption className="mb-1 text-left text-muted">
          At {formatDate(f.balanceSheet.date)}, from the balance sheet of the
          latest filing. USD millions.
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Item
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Value
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {ITEMS.map((key) => {
            const m = f[key].metric;
            const d = displayMetric(m);
            const cautions = m.warnings.filter((w) => w.severity === "caution");
            return (
              <tr key={key} className="h-8 border-b border-rule">
                <th scope="row" className="pr-3 text-left font-normal">
                  {BALANCE_SHEET_LABELS[key]}{" "}
                  <span className="text-muted">(USD m)</span>
                </th>
                <td className="pr-3 text-right">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${BALANCE_SHEET_LABELS[key]}: ${d.text}. Show balance-sheet lines`}
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
      {open && <BalanceSheetDrawer f={f} item={open} onClose={close} />}
    </section>
  );
}
