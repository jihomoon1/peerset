import Link from "next/link";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import { defaultQuoteDeps } from "@/lib/quotes";
import { METHODOLOGY_PATH } from "@/lib/methodologyLinks";
import { APP_VERSION, DISCLAIMER, REPO_URL } from "@/lib/site";

// Blueprint §6 footer: disclaimer, data attributions, GitHub link, versions.
export function SiteFooter() {
  const alphaVantage = defaultQuoteDeps().provider !== null;
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-3 text-xs text-muted">
        <p>{DISCLAIMER}</p>
        <p>
          Financial data: SEC EDGAR filings.{" "}
          {alphaVantage
            ? "Price data provided by Alpha Vantage."
            : "Prices: entered by you."}
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
          {" · "}App {APP_VERSION} · Methodology {METHODOLOGY_VERSION}
        </p>
      </div>
    </footer>
  );
}
