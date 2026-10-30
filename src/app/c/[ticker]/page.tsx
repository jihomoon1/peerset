// /c/[ticker]: the comps workbench (blueprint §5, §6). The target's identity, as-of
// strip, operating, balance-sheet and valuation blocks, then the peer panel and the
// comps table. The server loads the target and screens its peers from the committed
// index; the browser loads peer fundamentals and applies prices. The URL's query
// (add, remove, px, pxdate) restores a shared analysis. The header and the footer
// come from the root layout.

import { notFound } from "next/navigation";
import { PeerSetError } from "@/lib/errors";
import {
  defaultDeps,
  loadFundamentals,
  type LoadedFundamentals,
} from "@/lib/fundamentals";
import { log } from "@/lib/log";
import { defaultPeersDeps, selectPeers } from "@/lib/peers";
import { defaultQuoteDeps, loadQuotes, type QuotesResult } from "@/lib/quotes";
import { ErrorState } from "@/ui/ErrorState";
import { IdentityLine } from "@/ui/IdentityLine";
import type { PeerSelection } from "@/ui/PeerPanel";
import { parseUrlState } from "@/ui/urlState";
import { Workbench } from "@/ui/Workbench";
import { pageErrorOutcome } from "./pageError";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  return {
    title: decodeURIComponent(ticker).toUpperCase().slice(0, 12),
  };
}

// The query as URLSearchParams-like input for parseUrlState (first value of each).
function queryParams(
  sp: Record<string, string | string[] | undefined>,
): Pick<URLSearchParams, "get"> {
  return {
    get: (name) => {
      const v = sp[name];
      return (Array.isArray(v) ? v[0] : v) ?? null;
    },
  };
}

// Screening never fails the page: an unscreenable target still gets its workbench,
// with the reason in the peer panel and the add box.
function peerSelection(ticker: string): PeerSelection {
  try {
    return { ok: true, data: selectPeers(ticker, defaultPeersDeps()) };
  } catch (err) {
    log("page_peers_error", {
      code: err instanceof PeerSetError ? err.code : "INTERNAL",
    });
    return err instanceof PeerSetError
      ? { ok: false, code: err.code, message: err.userMessage }
      : { ok: false, code: "INTERNAL", message: "peer screening failed" };
  }
}

export default async function CompanyPage({
  params,
  searchParams,
}: PageProps<"/c/[ticker]">) {
  const { ticker } = await params;
  const initial = parseUrlState(queryParams(await searchParams));
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
    const outcome = pageErrorOutcome(err, requestId);
    if (outcome.notFound) notFound();
    error = outcome.body;
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
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-4">
      <main className="flex flex-1 flex-col gap-5">
        {f ? (
          <>
            <IdentityLine identity={f.identity} />
            <Workbench
              f={f}
              pulledAt={f.pulledAt}
              analysisDate={deps.asOf}
              providerQuotes={quotes.quotes}
              providerErrors={quotes.errors}
              providerOn={quoteDeps.provider !== null}
              selection={peerSelection(f.identity.ticker)}
              initial={initial}
            />
          </>
        ) : (
          error && <ErrorState error={error} />
        )}
      </main>
    </div>
  );
}
