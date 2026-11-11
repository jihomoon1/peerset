"use client";

import { useState, type ReactNode } from "react";

// Price tools that apply to every company in the comps table: the shared price date,
// the paste box and (as children) the Alpha Vantage autofill. Each company's own price
// box stays with its row and, for the target, in the valuation block.
export function PricesBlock({
  priceDate,
  dateError,
  analysisDate,
  note,
  onDate,
  onPaste,
  children,
}: {
  priceDate: string;
  dateError?: string;
  analysisDate: string;
  note?: string; // e.g. how many saved prices were put back
  onDate: (date: string) => void;
  onPaste: (text: string) => string[]; // returns the lines it couldn't use
  children: ReactNode;
}) {
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);

  return (
    <section
      aria-labelledby="prices-heading"
      className="flex flex-col gap-3 text-[13px]"
    >
      <h2 id="prices-heading" className="section-bar">
        Prices for the table
      </h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <p className="text-muted">
            One date covers every price you type. Enter prices in the table
            below, or paste several at once. Prices are remembered in this
            browser.
          </p>
          {note && (
            <p role="status" className="font-medium">
              {note}
            </p>
          )}
          <div className="flex flex-col items-start gap-1">
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
        </form>
        <form
          className="flex flex-col items-start gap-1"
          onSubmit={(e) => e.preventDefault()}
        >
          <label htmlFor="price-paste" className="font-medium">
            Paste prices{" "}
            <span className="font-normal text-muted">
              (one &quot;ticker, price&quot; per line)
            </span>
          </label>
          <textarea
            id="price-paste"
            rows={4}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            className="w-full max-w-xs rounded-sm border border-rule bg-background px-2 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:outline-accent"
          />
          <button
            type="button"
            onClick={() => {
              setUnmatched(onPaste(paste));
              setPaste("");
            }}
            className="rounded-sm border border-rule px-2 py-1 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            Apply
          </button>
          {unmatched.length > 0 && (
            <span role="status" className="text-warn">
              Not used: {unmatched.join("; ")}
            </span>
          )}
        </form>
        {children}
      </div>
    </section>
  );
}
