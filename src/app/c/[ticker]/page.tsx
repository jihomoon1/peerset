// /c/[ticker]: the single-company analysis page (blueprint §5 step 4, §6). Identity,
// the as-of strip, the operating block, the balance-sheet block (debt and cash), the
// valuation block (prices, market cap, EV, multiples) with their drawers. The header
// and the footer (disclaimer, versions) come from the root layout. Not the M4 workbench.

import { errorResponseBody, PeerSetError } from "@/lib/errors";
import {
  defaultDeps,
  loadFundamentals,
  type LoadedFundamentals,
} from "@/lib/fundamentals";
import { log } from "@/lib/log";
import { defaultQuoteDeps, loadQuotes, type QuotesResult } from "@/lib/quotes";
import { CompanyWorkspace } from "@/ui/CompanyWorkspace";
import { ErrorState } from "@/ui/ErrorState";
import { IdentityLine } from "@/ui/IdentityLine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  return {
    title: decodeURIComponent(ticker).toUpperCase().slice(0, 12),
  };
}

export default async function CompanyPage({
  params,
}: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  const deps = defaultDeps();
  let f: LoadedFundamentals | null = null;
  let error = null;
  try {
    f = await loadFundamentals(decodeURIComponent(ticker), deps);
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

  // Alpha Vantage mode only (never production until approval is filed): pre-fill
  // the price inputs. A provider failure leaves them empty with a note.
  const quoteDeps = defaultQuoteDeps();
  let quotes: QuotesResult = { quotes: [], errors: [] };
  if (f && quoteDeps.provider) {
    const tickers = f.shareClasses.classes.flatMap((c) =>
      c.ticker ? [c.ticker] : [],
    );
    if (tickers.length > 0) quotes = await loadQuotes(tickers, quoteDeps);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-4">
      <main className="flex flex-1 flex-col gap-5">
        {f ? (
          <>
            <IdentityLine identity={f.identity} />
            <CompanyWorkspace
              f={f}
              pulledAt={f.pulledAt}
              analysisDate={deps.asOf}
              providerQuotes={quotes.quotes}
              providerErrors={quotes.errors}
              providerOn={quoteDeps.provider !== null}
            />
          </>
        ) : (
          error && <ErrorState error={error} />
        )}
      </main>
    </div>
  );
}
