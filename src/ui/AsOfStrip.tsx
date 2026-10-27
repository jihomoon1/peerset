import type { CompanyFundamentals } from "@/domain/fundamentals";
import type { QuoteSnapshot } from "@/domain/types";
import { formatDate, formatTimestamp } from "@/lib/format";

const SOURCE_WORDS: Record<QuoteSnapshot["source"], string> = {
  user_entered: "entered by you",
  alpha_vantage: "Alpha Vantage close",
};

// The as-of strip (blueprint §6, methodology §12): prices as of and their source,
// financials LTM through, shares as of, and when the SEC data was pulled. Sticky
// under the header, so every number on the page reads against these dates.
export function AsOfStrip({
  f,
  pulledAt,
  quotes,
  priceDate,
  providerOn,
}: {
  f: CompanyFundamentals;
  pulledAt: string;
  quotes: readonly QuoteSnapshot[];
  priceDate?: string; // the earliest price date in use
  providerOn: boolean;
}) {
  const filing = f.identity.latestPeriodic;
  const sharesAsOf = f.shareClasses.classes[0]?.sharesAsOf;
  const sources = [...new Set(quotes.map((q) => SOURCE_WORDS[q.source]))];
  return (
    <section
      aria-label="As of"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-rule bg-surface px-3 py-2 text-[13px]"
    >
      <span>
        <span className="text-muted">Prices as of </span>
        {priceDate ? (
          <span className="font-medium">
            {formatDate(priceDate)}{" "}
            <span className="font-normal text-muted">
              ({sources.join(", ")})
            </span>
          </span>
        ) : (
          <span className="font-medium">needs a price</span>
        )}
      </span>
      <span>
        <span className="text-muted">Financials: LTM through </span>
        <span className="font-medium">{formatDate(f.ltmEnd)}</span>
        {filing && (
          <>
            {" "}
            <span className="text-muted">
              ({filing.form} filed {formatDate(filing.filedDate)},{" "}
              <a
                href={filing.indexUrl}
                className="text-accent underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {filing.accession}
              </a>
              )
            </span>
          </>
        )}
      </span>
      <span>
        <span className="text-muted">Shares as of </span>
        <span className="font-medium">
          {sharesAsOf ? formatDate(sharesAsOf) : "—"}
        </span>{" "}
        <span className="text-muted">(cover page)</span>
      </span>
      <span>
        <span className="text-muted">Data pulled at </span>
        <span className="font-medium">{formatTimestamp(pulledAt)}</span>
      </span>
      {f.freshness.status === "filing-parsed" && (
        <span className="text-warn">
          <span aria-hidden="true">● </span>
          Parsed from the filing: SEC&apos;s companyfacts didn&apos;t include it
          yet
        </span>
      )}
      {providerOn && (
        <span className="text-muted">
          Price data provided by{" "}
          <a
            href="https://www.alphavantage.co"
            className="text-accent underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Alpha Vantage
          </a>
        </span>
      )}
    </section>
  );
}
