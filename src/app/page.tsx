import Link from "next/link";
import { DISCLAIMER } from "@/lib/site";
import { TickerSearch } from "@/ui/TickerSearch";

const EXAMPLES = ["LII", "WSO", "GGG", "AAON"];

// Blueprint §6 "No ticker yet": search box, examples, one-line explanation.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <section aria-labelledby="home-heading" className="flex flex-col gap-3">
        <h1 id="home-heading" className="text-xl font-semibold">
          PeerSet
        </h1>
        <p className="max-w-2xl text-sm">
          Type a U.S. ticker and get first-pass trading comps built from SEC
          filings, with every number traced to its filing, period and XBRL
          concept.
        </p>
        <TickerSearch />
        <p className="text-[13px]">
          <span className="text-muted">Examples: </span>
          {EXAMPLES.map((t, i) => (
            <span key={t}>
              {i > 0 && " · "}
              <Link
                href={`/c/${t}`}
                className="text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {t}
              </Link>
            </span>
          ))}
        </p>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-2">
        <h2 id="how-heading" className="text-sm font-semibold">
          How it works
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-[13px]">
          <li>
            Reads the company&apos;s latest 10-K or 10-Q from SEC EDGAR, and
            parses the filing itself when SEC&apos;s summary data lags.
          </li>
          <li>
            Builds last-twelve-month revenue, EBITDA, net income and EPS, plus
            debt and cash from the balance sheet as presented.
          </li>
          <li>
            You enter the share price; PeerSet computes market cap, enterprise
            value and multiples, and shows the calculation behind every cell.
          </li>
        </ul>
      </section>

      <p className="border-l-2 border-rule pl-3 text-xs text-muted">
        {DISCLAIMER}
      </p>
    </main>
  );
}
