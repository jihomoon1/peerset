import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { METHODOLOGY_VERSION } from "@/domain/policy";
import { renderMethodology } from "@/lib/methodologyDoc";
import { METHODOLOGY_SOURCE_URL } from "@/lib/site";

// /methodology (M6 step 5): docs/methodology.md, rendered at build time so the page
// always matches the definitions the engine uses. The HTML comes from the repo's
// own file (ADR 0011), never from user input.

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Methodology",
  description: `How PeerSet calculates LTM financials, EBITDA, enterprise value, multiples and peers (methodology ${METHODOLOGY_VERSION}).`,
};

const SUMMARY = [
  "LTM (last twelve months) = the latest fiscal year + this year's year-to-date − last year's year-to-date, from the 10-K and the latest 10-Q. Quarters are never added up.",
  "EBITDA = operating income + depreciation and amortization from the cash-flow statement. It is standardized and unadjusted: no add-backs.",
  "Debt and cash come from the lines the company shows on its balance sheet. Operating leases are never debt. A line PeerSet can't classify makes the total Unsupported instead of guessed.",
  "Enterprise value = market cap (price × cover-page shares) + total debt − cash and short-term investments. Preferred stock and noncontrolling interests are left out, with a warning when material.",
  "A multiple is NM (not meaningful) when its denominator is ≤ 0, when EV ≤ 0, or above 100x. “—” means an input is missing; “Unsupported” means the method can't apply, with the reason.",
  "Peers share the target's SIC industry code (widening from 4 to 3 to 2 digits when fewer than 5 qualify), with latest-fiscal-year revenue between 0.2x and 5x the target's, closest in size first.",
  "Prices are end-of-day closes you enter. PeerSet never estimates a number: missing data stays missing.",
];

export default function MethodologyPage() {
  const doc = readFileSync(
    path.join(process.cwd(), "docs", "methodology.md"),
    "utf8",
  );
  const { html } = renderMethodology(doc);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <section
        aria-labelledby="summary-heading"
        className="flex flex-col gap-2 border-b border-rule pb-6"
      >
        <h1 id="summary-heading" className="text-xl font-semibold">
          How PeerSet calculates
        </h1>
        <ul className="flex max-w-3xl list-disc flex-col gap-1.5 pl-5 text-sm">
          {SUMMARY.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="text-[13px] text-muted">
          The full definitions follow (methodology {METHODOLOGY_VERSION}).
          Source:{" "}
          <a
            href={METHODOLOGY_SOURCE_URL}
            className="text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            docs/methodology.md on GitHub
          </a>
          .
        </p>
      </section>
      <article
        className="methodology-doc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
