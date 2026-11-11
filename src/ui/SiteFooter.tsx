import Link from "next/link";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import { defaultQuoteDeps } from "@/lib/quotes";
import { METHODOLOGY_PATH } from "@/lib/methodologyLinks";
import { PRICE_KEY_GUIDE_PATH } from "@/lib/priceKeyGuide";
import { APP_VERSION, DISCLAIMER, REPO_URL } from "@/lib/site";

// Blueprint §6 footer: disclaimer, data attributions, GitHub link, versions.
export function SiteFooter() {
  const alphaVantage = defaultQuoteDeps().provider !== null;
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 px-4 py-4 sm:px-8 text-xs text-muted">
        <p>{DISCLAIMER}</p>
        <p>
          Financial data: SEC EDGAR filings.{" "}
          {alphaVantage
            ? "Price data provided by Alpha Vantage."
            : // v1.1: the browser may fill prices with the visitor's own key, which
              // the server never sees, so the footer names both sources.
              "Prices: entered by you, or fetched in your browser with your own Alpha Vantage key."}
        </p>
        <p>
          <a href={REPO_URL} className="underline hover:text-foreground">
            GitHub
          </a>
          {" · "}
          <Link
            href={METHODOLOGY_PATH}
            className="underline hover:text-foreground"
          >
            Methodology
          </Link>
          {" · "}
          <Link
            href={PRICE_KEY_GUIDE_PATH}
            className="underline hover:text-foreground"
          >
            Get a price key
          </Link>
          {" · "}App {APP_VERSION} · Methodology {METHODOLOGY_VERSION}
        </p>
      </div>
    </footer>
  );
}
