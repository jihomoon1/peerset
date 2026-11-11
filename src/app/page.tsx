import Link from "next/link";
import { TickerSearch } from "@/ui/TickerSearch";

const EXAMPLES = ["LII", "WSO", "GGG", "AAON"];

const STEPS: [string, string][] = [
  [
    "Type a ticker",
    "PeerSet reads the company's SEC filings and picks similar companies to compare it with.",
  ],
  [
    "Add share prices",
    "Type them in, or fill them with a free key. Filings don't include prices.",
  ],
  [
    "Check and export",
    "Click any number to see the filing it came from, then download the table to Excel.",
  ],
];

const WRAP = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";

// Blueprint §6 "No ticker yet": search box, examples, one-line explanation, under the
// one hero the visual system allows. Everything sits on one left edge.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="home-heading"
        className={`${WRAP} flex flex-col gap-6 py-16 lg:py-24`}
      >
        <h1
          id="home-heading"
          className="font-display max-w-4xl text-5xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-7xl"
        >
          Every multiple, <br className="hidden sm:block" />
          traced to the filing.
        </h1>
        <p className="max-w-xl text-lg leading-snug">
          Type a U.S. stock ticker. Get a comps table built from SEC filings.
        </p>
        <TickerSearch lookup />
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Or try one</span>
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
      </section>

      <section aria-labelledby="how-heading" className="band">
        <div className={`${WRAP} flex flex-col gap-8 py-12 lg:py-16`}>
          <h2
            id="how-heading"
            className="font-display text-3xl font-medium tracking-[-0.01em]"
          >
            How it works
          </h2>
          <ol className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li
                key={title}
                className="flex flex-col gap-2 border-t border-foreground pt-4"
              >
                <h3 className="text-[17px] font-semibold">
                  {i + 1}. {title}
                </h3>
                <p className="max-w-sm text-[15px] leading-snug text-muted">
                  {body}
                </p>
              </li>
            ))}
          </ol>
          <p className="text-[15px]">
            <Link
              href="/about"
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Why the filing trail matters
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
