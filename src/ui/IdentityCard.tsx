"use client";

import Link, { useLinkStatus } from "next/link";
import type { CompanyIdentity } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { formatFiscalYearEnd } from "./metricDisplay";

// Blueprint §6 "Valid, not analyzed" (M6): who the ticker belongs to and its latest
// filing, from the ticker list and submissions only, with "Analyze" when PeerSet
// supports the company and the one-sentence reason when it doesn't.

// Blueprint §6 "Loading" (M6): while /c/<TICKER> is read on the server, the link names
// the filing being read. (A loading.tsx boundary would stream a 200 before the page
// could answer 404, so the wait is shown here instead.)
function AnalyzeLabel({
  ticker,
  latest,
}: {
  ticker: string;
  latest: CompanyIdentity["latestPeriodic"];
}) {
  const { pending } = useLinkStatus();
  if (!pending) return <>Analyze {ticker}</>;
  return (
    <>
      Reading {ticker}&apos;s{" "}
      {latest
        ? `${latest.form} filed ${formatDate(latest.filedDate)}`
        : "latest filing"}
      …
    </>
  );
}

export function IdentityCard({
  identity,
  ticker,
}: {
  identity: CompanyIdentity;
  ticker: string;
}) {
  const latest = identity.latestPeriodic;
  const items: [string, string][] = [
    ["Ticker", identity.tickers.map((t) => t.ticker).join(", ") || ticker],
    ["Exchange", identity.exchange || "—"],
    ["CIK", identity.cik],
    [
      "SIC",
      `${identity.sic}${identity.sicDescription ? ` (${identity.sicDescription})` : ""}`,
    ],
    ["Fiscal year end", formatFiscalYearEnd(identity.fiscalYearEnd)],
    [
      "Latest 10-K/10-Q",
      latest
        ? `${latest.form} for the period ended ${formatDate(latest.reportDate)}, filed ${formatDate(latest.filedDate)}`
        : "none",
    ],
  ];
  return (
    <section
      aria-labelledby="identity-card-heading"
      className="flex max-w-xl flex-col gap-2 border border-rule bg-surface px-4 py-3"
    >
      <h2 id="identity-card-heading" className="text-base font-semibold">
        {identity.name}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
        {items.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted">{term}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {identity.support.supported ? (
        <Link
          href={`/c/${encodeURIComponent(ticker)}`}
          className="self-start rounded-sm bg-accent px-3 py-1 text-[13px] font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <AnalyzeLabel ticker={ticker} latest={latest} />
        </Link>
      ) : (
        <p role="status" className="text-sm">
          <span className="font-semibold">Not supported: </span>
          {identity.support.reason.message}.
        </p>
      )}
    </section>
  );
}
