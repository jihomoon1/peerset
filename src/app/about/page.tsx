import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why PeerSet",
  description:
    "Why PeerSet exists and who it is for: first-pass trading comps you can check against the filing.",
};

// Jiho's own words, one paragraph per entry. The section stays hidden while empty, so
// the page never ships with placeholder or invented reasons.
const WHY_I_BUILT: string[] = [];

const VALUE = [
  [
    "Every number traces to its source",
    "Click any cell to see the formula, the periods, the XBRL concept and a link to the filing it came from.",
  ],
  [
    "Gaps are shown, never filled",
    "If a value can't be built from the filings, it shows as missing or unsupported with the reason. PeerSet never estimates, and missing is never treated as zero.",
  ],
  [
    "The table and the workbook match",
    "The Excel export comes from the same calculation as the screen, with live formulas you can follow.",
  ],
  [
    "Free and open source",
    "It uses public SEC data, and the code and methodology are published for anyone to read.",
  ],
];

const USE_CASES = [
  [
    "Learning how comps are built",
    "Students and people recruiting for finance, often without a data terminal, can see how LTM figures, enterprise value and multiples come together, number by number.",
  ],
  [
    "Starting a first draft",
    "Go from a ticker to a peer set and a comps table, then refine the peers and carry on in Excel.",
  ],
  [
    "Checking a number",
    "Compare a figure from a screener or terminal with the filing line it should come from.",
  ],
  [
    "A quick look at valuation",
    "Individual investors and small firms can see how a U.S. company is valued next to its peers, using public data.",
  ],
];

const LIMITS = [
  "EBITDA is standardized and unadjusted, with no add-backs for one-time items.",
  "Multiples are historical. There are no consensus forward estimates.",
  "Market cap uses basic shares from the filing cover, not fully diluted shares.",
  "Peers are screened by industry code and size, so the list is a starting point. Choosing the right peers is still your judgment.",
  "U.S. SEC filers only, and prices are yours to enter or fill with your own key.",
];

function Rows({ items }: { items: string[][] }) {
  return (
    <ul className="flex flex-col">
      {items.map(([title, body]) => (
        <li
          key={title}
          className="grid grid-cols-1 gap-1 border-t border-foreground py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"
        >
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="text-[15px] leading-snug">{body}</p>
        </li>
      ))}
    </ul>
  );
}

const WRAP = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";
const SPLIT = `${WRAP} grid grid-cols-1 gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-16`;
const H2 = "font-display text-4xl font-medium tracking-[-0.01em] sm:text-5xl";

export default function About() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="about-heading"
        className={`${WRAP} py-12 lg:py-20`}
      >
        <p className="text-xs font-bold tracking-wide uppercase">Why PeerSet</p>
        <h1
          id="about-heading"
          className="font-display mt-6 max-w-4xl text-5xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-7xl"
        >
          Comps you can <span className="text-accent">check.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-snug">
          Building trading comps by hand means opening each peer&apos;s 10-K and
          10-Q, rebuilding last-twelve-month numbers, and pulling debt, cash and
          share counts from every filing. PeerSet does that first pass from SEC
          filings and shows the calculation behind every cell.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block bg-accent px-6 py-2.5 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try a ticker
        </Link>
      </section>

      {WHY_I_BUILT.length > 0 && (
        <section aria-labelledby="why-heading" className={SPLIT}>
          <h2 id="why-heading" className={H2}>
            Why I built this
          </h2>
          <div className="flex flex-col gap-4 text-lg leading-snug">
            {WHY_I_BUILT.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="value-heading" className="band">
        <div className={SPLIT}>
          <h2 id="value-heading" className={H2}>
            What makes it different
          </h2>
          <Rows items={VALUE} />
        </div>
      </section>

      <section aria-labelledby="uses-heading" className={SPLIT}>
        <h2 id="uses-heading" className={H2}>
          Who it&apos;s for
        </h2>
        <Rows items={USE_CASES} />
      </section>

      <section aria-labelledby="limits-heading" className="bg-surface">
        <div className={SPLIT}>
          <h2 id="limits-heading" className={H2}>
            What it doesn&apos;t do
          </h2>
          <ul className="flex flex-col">
            {LIMITS.map((l) => (
              <li
                key={l}
                className="border-t border-foreground py-4 text-[15px] leading-snug"
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
