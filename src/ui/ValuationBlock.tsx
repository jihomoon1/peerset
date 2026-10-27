"use client";

import { useRef, useState } from "react";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { Metric } from "@/domain/types";
import type { Valuation } from "@/domain/valuation";
import type { QuoteError } from "@/lib/quotes";
import { EvBridgeDrawer } from "./EvBridgeDrawer";
import { displayValuationCell } from "./pricing";

type RowKey = "marketCap" | "ev" | "evRevenue" | "evEbitda" | "pe";

const ROWS: {
  key: RowKey;
  label: string;
  unit: "USD" | "multiple";
  pick: (v: Valuation) => Metric;
}[] = [
  {
    key: "marketCap",
    label: "Market cap",
    unit: "USD",
    pick: (v) => v.bridge.marketCap,
  },
  {
    key: "ev",
    label: "Enterprise value",
    unit: "USD",
    pick: (v) => v.bridge.enterpriseValue,
  },
  {
    key: "evRevenue",
    label: "EV / Revenue (LTM)",
    unit: "multiple",
    pick: (v) => v.multiples.evRevenue,
  },
  {
    key: "evEbitda",
    label: "EV / EBITDA (LTM)",
    unit: "multiple",
    pick: (v) => v.multiples.evEbitda,
  },
  {
    key: "pe",
    label: "P / E (LTM diluted)",
    unit: "multiple",
    pick: (v) => v.multiples.pe,
  },
];

const inputId = (ticker: string) => `price-${ticker}`;

// The valuation block (blueprint §6): one price per listed class and one price date,
// then market cap, EV and the three multiples, recomputed in the browser on every
// keystroke with the same priceCompany the server uses (blueprint §13).
export function ValuationBlock({
  f,
  v,
  tickers,
  inputs,
  errors,
  priceDate,
  dateError,
  analysisDate,
  providerErrors,
  onInput,
  onDate,
  onPaste,
}: {
  f: CompanyFundamentals;
  v: Valuation;
  tickers: string[];
  inputs: Record<string, string>;
  errors: Record<string, string>;
  priceDate: string;
  dateError?: string;
  analysisDate: string;
  providerErrors: QuoteError[];
  onInput: (ticker: string, text: string) => void;
  onDate: (date: string) => void;
  onPaste: (text: string) => string[]; // returns the lines it couldn't use
}) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const opener = useRef<HTMLButtonElement | null>(null);
  const blocker = f.shareClasses.blocker;

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <section
      aria-labelledby="valuation-heading"
      className="flex flex-col gap-3"
    >
      <h2 id="valuation-heading" className="text-base font-semibold">
        Valuation
      </h2>

      <form
        className="flex flex-wrap items-start gap-x-6 gap-y-3 text-[13px]"
        onSubmit={(e) => e.preventDefault()}
        aria-describedby="price-help"
      >
        <p id="price-help" className="w-full text-muted">
          End-of-day closing prices in USD. Every listed share class needs a
          price. Prices are inputs, not real-time quotes.
        </p>
        {tickers.map((t) => (
          <div key={t} className="flex flex-col gap-1">
            <label htmlFor={inputId(t)} className="font-medium">
              {t} price (USD)
            </label>
            <input
              id={inputId(t)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={inputs[t] ?? ""}
              onChange={(e) => onInput(t, e.target.value)}
              aria-invalid={errors[t] ? true : undefined}
              aria-describedby={errors[t] ? `${inputId(t)}-error` : undefined}
              placeholder="Needs price"
              className={`w-32 rounded-sm border px-2 py-1 tabular-nums focus-visible:outline-2 focus-visible:outline-accent ${
                !inputs[t]?.trim()
                  ? "border-warn bg-warn-bg"
                  : "border-rule bg-background"
              }`}
            />
            {errors[t] && (
              <span id={`${inputId(t)}-error`} className="text-error">
                {errors[t]}
              </span>
            )}
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="price-date" className="font-medium">
            Price date
          </label>
          <input
            id="price-date"
            type="date"
            value={priceDate}
            max={analysisDate}
            onChange={(e) => onDate(e.target.value)}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? "price-date-error" : undefined}
            className="rounded-sm border border-rule bg-background px-2 py-1 focus-visible:outline-2 focus-visible:outline-accent"
          />
          {dateError && (
            <span id="price-date-error" className="text-error">
              {dateError}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="price-paste" className="font-medium">
            Paste prices{" "}
            <span className="font-normal text-muted">
              (one &quot;ticker, price&quot; per line)
            </span>
          </label>
          <div className="flex items-start gap-2">
            <textarea
              id="price-paste"
              rows={2}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              className="w-48 rounded-sm border border-rule bg-background px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-accent"
            />
            <button
              type="button"
              onClick={() => {
                setUnmatched(onPaste(paste));
                setPaste("");
              }}
              className="rounded-sm border border-rule px-2 py-1 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Apply
            </button>
          </div>
          {unmatched.length > 0 && (
            <span role="status" className="text-warn">
              Not used: {unmatched.join("; ")}
            </span>
          )}
        </div>
        {providerErrors.length > 0 && (
          <p role="status" className="w-full text-warn">
            {providerErrors.map((e) => `${e.symbol}: ${e.message}`).join(" · ")}
          </p>
        )}
        {blocker && (
          <p className="w-full text-warn">
            Market cap can&apos;t be built:{" "}
            {blocker.status === "missing"
              ? blocker.reason
              : blocker.reason.message}
          </p>
        )}
      </form>

      <table className="w-full max-w-2xl border-collapse text-[13px] tabular-nums">
        <caption className="mb-1 text-left text-muted">
          Market cap and EV in USD millions; multiples on LTM financials.
        </caption>
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Metric
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Value
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const m = row.pick(v);
            const d = displayValuationCell(m, row.unit, v.needsPrice);
            const cautions = m.warnings.filter((w) => w.severity === "caution");
            const valueClass =
              d.kind === "value"
                ? ""
                : d.kind === "needs-price"
                  ? "text-warn"
                  : "text-muted";
            return (
              <tr key={row.key} className="h-8 border-b border-rule">
                <th scope="row" className="pr-3 text-left font-normal">
                  {row.label}
                </th>
                <td className="pr-3 text-right">
                  {row.key === "marketCap" || row.key === "ev" ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`${row.label}: ${d.text}. Show EV bridge`}
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setOpen(true);
                      }}
                      className={`rounded-sm px-1 underline decoration-dotted underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent ${valueClass}`}
                    >
                      {d.text}
                    </button>
                  ) : (
                    <span
                      className={valueClass}
                      title={d.kind === "nm" ? d.note : undefined}
                    >
                      {d.text}
                      {d.kind === "nm" && (
                        <span className="sr-only"> ({d.note})</span>
                      )}
                    </span>
                  )}
                </td>
                <td>
                  {d.note && <span className="text-muted">{d.note}</span>}
                  {cautions.length > 0 && (
                    <span className="ml-2 text-warn">
                      {cautions.map((w) => w.message).join("; ")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && <EvBridgeDrawer f={f} v={v} onClose={close} />}
    </section>
  );
}
