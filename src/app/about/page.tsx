import type { Metadata } from "next";
import Link from "next/link";
import { ABOUT_EVIDENCE as ev } from "@/lib/aboutEvidence";
import { formatDate, formatMillions } from "@/lib/format";
import { TracedExample } from "@/ui/TracedExample";
import { UseCaseCards } from "@/ui/UseCaseCards";

export const metadata: Metadata = {
  title: "Why PeerSet",
  description:
    "Why PeerSet exists and who it is for: first-pass trading comps you can check against the filing.",
};

// Jiho's own words, one paragraph per entry. The section stays hidden while empty, so
// the page never ships with placeholder or invented reasons.
const WHY_I_BUILT: string[] = [
  "I built this because when I was doing my comps table it was annoying and repetitive, and it should be outsourced.",
];

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

// Each use case as a before and after: where you start, what you do, what you keep.
const LIMITS = [
  "EBITDA is standardized and unadjusted, with no add-backs for one-time items.",
  "Multiples are historical. There are no consensus forward estimates.",
  "Market cap uses basic shares from the filing cover, not fully diluted shares.",
  "Peers are screened by industry code and size, so the list is a starting point. Choosing the right peers is still your judgment.",
  "U.S. SEC filers only, and prices are yours to enter or fill with your own key.",
];

const WRAP = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";
const H2 = "font-display text-4xl font-medium tracking-[-0.01em] sm:text-5xl";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-accent";

function Source({
  form,
  accession,
  url,
}: {
  form: string;
  accession: string;
  url: string;
}) {
  return (
    <p className="text-xs text-muted">
      Balance sheet, {form}{" "}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`text-foreground underline underline-offset-2 ${FOCUS}`}
      >
        {accession}
      </a>
    </p>
  );
}

const CASE = "flex flex-col gap-4 border-t-2 border-foreground pt-4";
const LEDGER = "w-full border-collapse text-[13px] tabular-nums";
const LINE = "border-b border-rule";
const CELL = "py-2 pr-3 text-left font-normal";
const NUM = "py-2 text-right whitespace-nowrap";

function CarrierCase() {
  const c = ev.carrier;
  return (
    <article aria-labelledby="carrier-heading" className={CASE}>
      <h3 id="carrier-heading" className="font-display text-2xl font-medium">
        One company, two totals for debt
      </h3>
      <p className="max-w-xl text-[15px] leading-snug">
        {c.company}, {formatDate(c.date)}. The filing&apos;s own total-debt tag
        and the debt lines on its balance sheet disagree by{" "}
        {formatMillions(c.gap)} million.
      </p>
      <table className={LEDGER}>
        <caption className="sr-only">
          {c.company} debt at {formatDate(c.date)}, USD millions: balance sheet
          lines against the total-debt tag
        </caption>
        <tbody>
          {c.lines.map((l, i) => (
            <tr key={l.label} className={LINE}>
              <th scope="row" className={CELL}>
                {i > 0 && "+ "}
                {l.label}
              </th>
              <td className={NUM}>{formatMillions(l.value)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-foreground font-bold">
            <th scope="row" className="py-2 pr-3 text-left">
              = Balance sheet lines
            </th>
            <td className={NUM}>{formatMillions(c.faceTotal)}</td>
          </tr>
          <tr className={LINE}>
            <th scope="row" className={CELL}>
              − Total-debt tag{" "}
              <span className="font-mono text-xs break-all text-muted">
                {c.tagConcept}
              </span>
            </th>
            <td className={NUM}>{formatMillions(c.tagValue)}</td>
          </tr>
          <tr className="font-bold">
            <th scope="row" className="py-2 pr-3 text-left">
              = Difference
            </th>
            <td className={NUM}>{formatMillions(c.gap)}</td>
          </tr>
        </tbody>
      </table>
      <p className="max-w-xl text-[15px] leading-snug">
        PeerSet builds debt from the lines the company presents, warns that the
        tag differs, and shows both numbers.
      </p>
      <Source form={c.form} accession={c.accession} url={c.statementUrl} />
    </article>
  );
}

function WatscoCase() {
  const w = ev.watsco;
  return (
    <article aria-labelledby="watsco-heading" className={CASE}>
      <h3 id="watsco-heading" className="font-display text-2xl font-medium">
        A debt tag on a line that is mostly leases
      </h3>
      <p className="max-w-xl text-[15px] leading-snug">
        {w.company}, {formatDate(w.date)}. A line labeled &ldquo;
        {w.excluded.label}&rdquo; carries a debt tag. Watsco shows no separate
        current operating-lease line, and its long-term leases are{" "}
        {formatMillions(w.operatingNoncurrent)} million operating against{" "}
        {formatMillions(w.counted.value)} million finance.
      </p>
      <table className={LEDGER}>
        <caption className="sr-only">
          {w.company} debt at {formatDate(w.date)}, USD millions: read by tag
          alone against PeerSet&apos;s total
        </caption>
        <tbody>
          <tr className={LINE}>
            <th scope="row" className={CELL}>
              {w.excluded.label}{" "}
              <span className="font-mono text-xs break-all text-muted">
                {w.excluded.concept}
              </span>
            </th>
            <td className={NUM}>{formatMillions(w.excluded.value)}</td>
          </tr>
          <tr className={LINE}>
            <th scope="row" className={CELL}>
              + {w.counted.label}
            </th>
            <td className={NUM}>{formatMillions(w.counted.value)}</td>
          </tr>
          <tr className="border-t-2 border-foreground">
            <th scope="row" className={CELL}>
              = Debt read by tag alone
            </th>
            <td className={NUM}>{formatMillions(w.byTagAlone)}</td>
          </tr>
          <tr className="font-bold">
            <th scope="row" className="py-2 pr-3 text-left">
              Total debt in PeerSet (finance leases only)
            </th>
            <td className={NUM}>{formatMillions(w.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="max-w-xl text-[15px] leading-snug">
        PeerSet leaves the lease line out because it may contain operating
        leases, and names the excluded line in a warning so you can decide for
        yourself.
      </p>
      <Source form={w.form} accession={w.accession} url={w.statementUrl} />
    </article>
  );
}

export default function About() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="about-heading"
        className={`${WRAP} grid grid-cols-1 items-center gap-12 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:py-20`}
      >
        <div className="flex flex-col items-start gap-6">
          <h1
            id="about-heading"
            className="font-display text-5xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-7xl"
          >
            Comps you can <span className="text-accent">check.</span>
          </h1>
          <p className="max-w-2xl text-lg leading-snug">
            Building trading comps by hand means opening each peer&apos;s 10-K
            and 10-Q, rebuilding last-twelve-month numbers, and pulling debt,
            cash and share counts from every filing. PeerSet does that first
            pass from SEC filings and shows the calculation behind every cell.
          </p>
          <Link
            href="/"
            className="bg-accent px-6 py-2.5 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try a ticker
          </Link>
        </div>
        <TracedExample />
      </section>

      {WHY_I_BUILT.length > 0 && (
        <section
          aria-labelledby="why-heading"
          className={`${WRAP} grid grid-cols-1 gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-16`}
        >
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

      <section aria-labelledby="matters-heading" className="band">
        <div className={`${WRAP} flex flex-col gap-10 py-12 lg:py-16`}>
          <div className="flex flex-col gap-4">
            <h2 id="matters-heading" className={H2}>
              Why the trail matters
            </h2>
            <p className="max-w-2xl text-lg leading-snug">
              A number with no trail can be wrong without anyone noticing. Two
              cases from filings PeerSet reads, in USD millions.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <CarrierCase />
            <WatscoCase />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="uses-heading"
        className={`${WRAP} flex flex-col gap-8 py-12 lg:py-16`}
      >
        <h2 id="uses-heading" className={H2}>
          Who it&apos;s for
        </h2>
        <UseCaseCards />
      </section>

      <section
        aria-labelledby="value-heading"
        className={`${WRAP} flex flex-col gap-8 pb-12 lg:pb-16`}
      >
        <h2 id="value-heading" className={H2}>
          What makes it different
        </h2>
        <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE.map(([title, body]) => (
            <li
              key={title}
              className="flex flex-col gap-2 border-t-2 border-foreground py-4"
            >
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="text-[15px] leading-snug">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits-heading" className="bg-surface">
        <div
          className={`${WRAP} grid grid-cols-1 gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-16`}
        >
          <h2 id="limits-heading" className={H2}>
            What it doesn&apos;t do
          </h2>
          <ul className="flex flex-col">
            {LIMITS.map((l) => (
              <li
                key={l}
                className="border-t border-foreground py-3 text-[15px] leading-snug"
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
