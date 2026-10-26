// /c/[ticker]: the minimal M1 analysis page (blueprint §5 step 4, §6). Identity,
// financials strip, the operating block with its provenance drawer, and the
// disclaimer. Not the M4 workbench.

import Link from "next/link";
import type { CompanyFundamentals } from "@/domain/fundamentals";
import { errorResponseBody, PeerSetError } from "@/lib/errors";
import { defaultDeps, loadFundamentals } from "@/lib/fundamentals";
import { log } from "@/lib/log";
import { ErrorState } from "@/ui/ErrorState";
import { FinancialsStrip } from "@/ui/FinancialsStrip";
import { IdentityLine } from "@/ui/IdentityLine";
import { OperatingBlock } from "@/ui/OperatingBlock";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  return {
    title: `${decodeURIComponent(ticker).toUpperCase().slice(0, 12)} · PeerSet`,
  };
}

export default async function CompanyPage({
  params,
}: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  let f: CompanyFundamentals | null = null;
  let error = null;
  try {
    f = await loadFundamentals(decodeURIComponent(ticker), defaultDeps());
  } catch (err) {
    const requestId = crypto.randomUUID();
    log("page_error", {
      requestId,
      code: err instanceof PeerSetError ? err.code : "INTERNAL",
      detail:
        err instanceof PeerSetError
          ? err.detail
          : String(err instanceof Error ? err.name : typeof err),
    });
    error = errorResponseBody(err, requestId);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-4">
      <nav className="border-b border-rule pb-2">
        <Link href="/" className="font-semibold text-accent">
          PeerSet
        </Link>
      </nav>
      <main className="flex flex-1 flex-col gap-5">
        {f ? (
          <>
            <IdentityLine identity={f.identity} />
            <FinancialsStrip f={f} />
            <OperatingBlock f={f} />
          </>
        ) : (
          error && <ErrorState error={error} />
        )}
      </main>
      <footer className="border-t border-rule pt-2 text-xs text-muted">
        Automated first-pass comps from SEC filings. Unadjusted. Not a
        substitute for analyst review.
        {f && <> · Methodology {f.methodologyVersion}</>}
      </footer>
    </div>
  );
}
