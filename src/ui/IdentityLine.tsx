import type { CompanyIdentity } from "@/domain/types";
import { formatFiscalYearEnd } from "./metricDisplay";

// Name, ticker, CIK, SIC, fiscal year end and exchange (blueprint §6, target summary).
export function IdentityLine({ identity }: { identity: CompanyIdentity }) {
  const items: [string, string][] = [
    ["Ticker", identity.tickers.map((t) => t.ticker).join(", ")],
    ["CIK", identity.cik],
    [
      "SIC",
      `${identity.sic}${identity.sicDescription ? ` (${identity.sicDescription})` : ""}`,
    ],
    ["Fiscal year end", formatFiscalYearEnd(identity.fiscalYearEnd)],
    ["Exchange", identity.exchange || "—"],
  ];
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-bold tracking-[-0.01em] sm:text-5xl">
        {identity.name}
      </h1>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {items.map(([term, value]) => (
          <div key={term} className="flex gap-1.5">
            <dt className="text-muted">{term}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
