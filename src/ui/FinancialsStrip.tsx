import type { CompanyFundamentals } from "@/domain/fundamentals";
import { formatDate } from "@/lib/format";

// "Financials" item of the as-of strip (blueprint §6): LTM end and the filing behind it.
export function FinancialsStrip({ f }: { f: CompanyFundamentals }) {
  const filing = f.identity.latestPeriodic;
  return (
    <section
      aria-label="Financials"
      className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-rule bg-surface px-3 py-2 text-[13px]"
    >
      <span>
        <span className="text-muted">Financials: LTM through </span>
        <span className="font-medium">{formatDate(f.ltmEnd)}</span>
      </span>
      {filing && (
        <>
          <span>
            <span className="text-muted">Latest filing </span>
            {filing.form} filed {formatDate(filing.filedDate)}
          </span>
          <span>
            <span className="text-muted">Accession </span>
            <a
              href={filing.indexUrl}
              className="text-accent underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {filing.accession}
            </a>
          </span>
        </>
      )}
      {f.freshness.status === "filing-parsed" && (
        <span className="text-warn">
          <span aria-hidden="true">● </span>
          Parsed from the filing: SEC&apos;s companyfacts didn&apos;t include it
          yet
        </span>
      )}
    </section>
  );
}
