import Link from "next/link";
import { LAG_FLAG_DAYS, NM_MULTIPLE_CAP } from "@/domain/policy";
import { METHODOLOGY_PATH } from "@/lib/methodologyLinks";

// A small key for the words the comps table uses in place of a number
// (methodology §1, §10, §12). Closed by default; a native <details>, so it needs no
// script and works with the keyboard.
const TERMS: [string, string][] = [
  [
    "Unsupported",
    "PeerSet's rules can't build this number from the filings, so it is left out rather than guessed. Hover over the cell to see the reason.",
  ],
  [
    "NM",
    `Not meaningful. The multiple can be computed but would mislead: revenue, EBITDA or earnings per share is zero or negative, enterprise value is zero or negative, or the multiple is above ${NM_MULTIPLE_CAP}x.`,
  ],
  [
    "—",
    "Missing. A number this cell needs was not reported in the filing. It is never treated as zero.",
  ],
  [
    "lag",
    `This company's latest twelve months end more than ${LAG_FLAG_DAYS} days away from the typical peer's, so its numbers cover a different stretch of time. Compare with care.`,
  ],
];

export function TableKey() {
  return (
    <details className="border border-rule text-[13px]">
      <summary className="cursor-pointer px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-accent">
        What do Unsupported, NM, — and lag mean?
      </summary>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-rule px-3 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        {TERMS.map(([term, meaning]) => (
          <div key={term} className="contents">
            <dt className="font-semibold">{term}</dt>
            <dd className="max-w-3xl text-muted">{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-rule px-3 py-2 text-muted">
        The exact rules are in the{" "}
        <Link
          href={METHODOLOGY_PATH}
          className="text-accent underline underline-offset-2"
        >
          methodology
        </Link>
        .
      </p>
    </details>
  );
}
