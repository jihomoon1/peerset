import Link from "next/link";
import type { CompanyIdentity } from "@/domain/types";

// Blueprint §6 "Ticker changed or delisted" (M6). A shared link carries the CIK it was
// made for (urlState); when the ticker now resolves to another company, or to none,
// PeerSet says so and never applies the old analysis to a different company.

const edgarCompany = (cik: string) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`;

export function TickerRemapped({
  ticker,
  linkCik,
  now,
}: {
  ticker: string;
  linkCik: string;
  now: CompanyIdentity;
}) {
  return (
    <section
      role="alert"
      className="max-w-xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm"
    >
      <h1 className="text-base font-semibold">
        {ticker} now maps to a different company
      </h1>
      <p className="mt-1">
        This link was made for CIK {linkCik}. Today SEC lists {ticker} for{" "}
        {now.name} (CIK {now.cik}). PeerSet doesn&apos;t move a shared analysis
        to a different company.
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={`/c/${encodeURIComponent(ticker)}`}
          className="text-accent underline"
        >
          Analyze {now.name} instead
        </Link>
        <a href={edgarCompany(linkCik)} className="text-accent underline">
          Find CIK {linkCik} on SEC EDGAR
        </a>
      </p>
    </section>
  );
}

export function TickerDelisted({
  ticker,
  linkCik,
}: {
  ticker: string;
  linkCik: string;
}) {
  return (
    <section
      role="alert"
      className="max-w-xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm"
    >
      <h1 className="text-base font-semibold">{ticker} is no longer listed</h1>
      <p className="mt-1">
        This link was made for CIK {linkCik}, but SEC no longer lists {ticker}{" "}
        for any company. The company may have changed its ticker, merged or
        delisted.
      </p>
      <p className="mt-2">
        <a href={edgarCompany(linkCik)} className="text-accent underline">
          Find CIK {linkCik} on SEC EDGAR
        </a>
      </p>
    </section>
  );
}
