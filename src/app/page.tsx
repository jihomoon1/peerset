import Link from "next/link";
import { TickerSearch } from "@/ui/TickerSearch";
import { TracedExample } from "@/ui/TracedExample";

const EXAMPLES = ["LII", "WSO", "GGG", "AAON"];

const STEPS = [
  "Reads the company's latest 10-K or 10-Q from SEC EDGAR, and parses the filing itself when SEC's summary data lags.",
  "Builds last-twelve-month revenue, EBITDA, net income and EPS, plus debt and cash from the balance sheet as presented.",
  "You enter share prices or fill them with your own free Alpha Vantage key; PeerSet computes market cap, enterprise value and multiples, and shows the calculation behind every cell.",
];

// Blueprint §6 "No ticker yet": search box, examples, one-line explanation, under the
// one hero the visual system allows.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="home-heading"
        className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-12 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:py-24"
      >
        <div className="flex flex-col gap-6">
          <p className="text-xs font-bold tracking-wide uppercase">
            Trading comps from SEC filings
          </p>
          <h1
            id="home-heading"
            className="font-display text-5xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-7xl"
          >
            Every multiple, traced to the{" "}
            <span className="text-accent">filing.</span>
          </h1>
          <p className="max-w-xl text-lg leading-snug">
            Type a U.S. ticker and get first-pass trading comps built from SEC
            filings, with every number traced to its filing, period and XBRL
            concept.
          </p>
          <TickerSearch lookup />
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted">Examples</span>
            {EXAMPLES.map((t) => (
              <Link
                key={t}
                href={`/c/${t}`}
                className="border border-foreground px-3 py-1 font-semibold hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-accent"
              >
                {t}
              </Link>
            ))}
          </p>
        </div>

        <TracedExample />
      </section>

      <section aria-labelledby="how-heading" className="band">
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-8 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-16">
          <h2
            id="how-heading"
            className="font-display text-4xl font-medium tracking-[-0.01em] sm:text-5xl"
          >
            How it works
          </h2>
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className="flex gap-6 border-t border-foreground py-4 text-[15px] leading-snug"
              >
                <span aria-hidden="true" className="tabular-nums text-muted">
                  0{i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
