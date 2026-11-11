"use client";

import Link from "next/link";
import { useRef, useState } from "react";

// "Who it's for" on Why PeerSet: the visitor picks who they are and sees that one card.
// Built as tabs, so it works with the arrow keys and screen readers.
const CARDS = [
  {
    who: "Student",
    title: "Learning how comps are built",
    situation:
      "You're studying or recruiting for finance and don't have a data terminal.",
    action:
      "Look up a company, then click any cell to open its calculation: the LTM bridge, the EBITDA build, the enterprise value bridge.",
    result:
      "You can explain how each multiple on the page was built, and point to the filing lines behind it.",
  },
  {
    who: "Analyst",
    title: "Starting a first draft",
    situation:
      "You need comps for a company and you're starting from a blank spreadsheet.",
    action:
      "Enter the ticker, review the suggested peers, remove or add companies, and enter prices.",
    result:
      "An Excel workbook with live formulas, ready to refine with your own judgment.",
  },
  {
    who: "Reviewer",
    title: "Checking a number",
    situation:
      "A screener or terminal shows a figure and you can't tell where it comes from.",
    action:
      "Open the same metric in PeerSet and follow it to its filing, period and XBRL concept.",
    result: "The filing line that figure should match.",
  },
  {
    who: "Investor",
    title: "A quick look at valuation",
    situation:
      "You want to see how a U.S. company is valued next to similar companies, using public data.",
    action:
      "Look up the ticker, then enter closing prices or fill them with your own free Alpha Vantage key.",
    result:
      "EV/Revenue, EV/EBITDA and P/E for the company and its peers, with the peer median and range.",
  },
];

const STAGES = [
  ["situation", "Where you start"],
  ["action", "What you do"],
  ["result", "What you leave with"],
] as const;

export function UseCaseCards() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const card = CARDS[active];

  function move(to: number) {
    const next = (to + CARDS.length) % CARDS.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span id="who-label" className="mr-2 text-lg">
          Pick who you are
        </span>
        <div
          role="tablist"
          aria-labelledby="who-label"
          className="flex flex-wrap gap-2"
        >
          {CARDS.map((c, i) => (
            <button
              key={c.who}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`who-tab-${i}`}
              aria-selected={i === active}
              aria-controls="who-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") move(i + 1);
                else if (e.key === "ArrowLeft") move(i - 1);
                else if (e.key === "Home") move(0);
                else if (e.key === "End") move(CARDS.length - 1);
                else return;
                e.preventDefault();
              }}
              className={`border border-foreground px-5 py-2 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                i === active
                  ? "bg-foreground text-background"
                  : "hover:bg-surface"
              }`}
            >
              {c.who}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id="who-panel"
        aria-labelledby={`who-tab-${active}`}
        className="flex flex-col gap-6 border border-foreground p-6 sm:p-8"
      >
        <h3 className="font-display text-2xl font-medium sm:text-3xl">
          {card.title}
        </h3>
        <dl className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-10">
          {STAGES.map(([key, label]) => (
            <div
              key={key}
              className="flex flex-col gap-1 border-t border-foreground pt-3"
            >
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="text-[15px] leading-snug">{card[key]}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/"
          className="self-start bg-accent px-6 py-2.5 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try a ticker
        </Link>
      </div>
    </div>
  );
}
