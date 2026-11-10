import Link from "next/link";
import { formatDate, formatMillions } from "@/lib/format";
import { HOME_EXAMPLE as ex } from "@/lib/homeExample";
import { TickerSearch } from "@/ui/TickerSearch";

const EXAMPLES = ["LII", "WSO", "GGG", "AAON"];

const STEPS = [
  "Reads the company's latest 10-K or 10-Q from SEC EDGAR, and parses the filing itself when SEC's summary data lags.",
  "Builds last-twelve-month revenue, EBITDA, net income and EPS, plus debt and cash from the balance sheet as presented.",
  "You enter share prices or fill them with your own free Alpha Vantage key; PeerSet computes market cap, enterprise value and multiples, and shows the calculation behind every cell.",
];

const shortPeriod = (start: string, end: string) =>
  `${formatDate(start)} – ${formatDate(end)}`;

// Blueprint §6 "No ticker yet": search box, examples, one-line explanation, under the
// one hero the visual system allows.
export default function Home() {
  const rows = [
    ["Fiscal year", ex.fy],
    ["+ Current YTD", ex.ytdCurrent],
    ["− Prior-year YTD", ex.ytdPrior],
  ] as const;
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

        <figure className="border border-foreground text-[13px] tabular-nums">
          <figcaption className="band flex items-center justify-between gap-4 px-4 py-2 text-xs font-bold tracking-wide uppercase">
            <span>One number, traced</span>
            <span className="font-normal text-muted normal-case">
              Worked example
            </span>
          </figcaption>
          <div className="flex flex-col gap-3 p-4">
            <p>
              <span className="font-semibold">{ex.company}</span>{" "}
              <span className="text-muted">
                · {ex.metric}, USD millions, LTM through {formatDate(ex.ltmEnd)}
              </span>
            </p>
            <table className="w-full border-collapse">
              <caption className="sr-only">
                How {ex.company}&apos;s last-twelve-month {ex.metric} is built
                from its filings
              </caption>
              <tbody>
                {rows.map(([label, c]) => (
                  <tr key={label} className="h-9 border-b border-rule">
                    <th scope="row" className="pr-3 text-left font-normal">
                      {label}
                    </th>
                    <td className="hidden pr-3 text-muted sm:table-cell">
                      {shortPeriod(c.start, c.end)}
                    </td>
                    <td className="text-right">{formatMillions(c.value)}</td>
                  </tr>
                ))}
                <tr className="h-11 border-t-2 border-foreground text-base font-bold">
                  <th scope="row" className="pr-3 text-left">
                    = LTM
                  </th>
                  <td className="hidden sm:table-cell" />
                  <td className="text-right text-accent">
                    {formatMillions(ex.ltm)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted">
              <span className="font-mono">{ex.concept}</span> · {ex.form}{" "}
              <a
                href={ex.filingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {ex.accession}
              </a>
            </p>
          </div>
        </figure>
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
