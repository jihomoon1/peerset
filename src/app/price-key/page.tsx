import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ALPHA_VANTAGE_KEY_URL,
  ALPHA_VANTAGE_PREMIUM_URL,
  FREE_KEY_REQUESTS_PER_DAY,
} from "@/lib/priceKeyGuide";
import { MAX_FILL_SYMBOLS } from "@/prices/browserAlphaVantage";

export const metadata: Metadata = {
  title: "Get a price key",
  description:
    "How to get a free Alpha Vantage key and use it to fill share prices in PeerSet.",
};

const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent";

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK}>
      {children}
    </a>
  );
}

// The steps are a real sequence, so they are numbered. Form fields and limits are as
// Alpha Vantage's support page states them (docs/licensing.md).
const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Open Alpha Vantage's key page",
    body: (
      <>
        Go to{" "}
        <Out href={ALPHA_VANTAGE_KEY_URL}>alphavantage.co/support/#api-key</Out>{" "}
        (opens in a new tab) and find the section called &ldquo;Claim your Free
        API Key&rdquo;. Alpha Vantage is a separate company that provides market
        data; PeerSet is not affiliated with it.
      </>
    ),
  },
  {
    title: "Fill in the short form",
    body: (
      <>
        It asks three things: which description fits you best (for example
        Student or Investor), your organization (your school or company), and
        your email. Alpha Vantage recommends a real email address, because that
        is how they help you if you lose your key.
      </>
    ),
  },
  {
    title: "Submit the form and copy your key",
    body: (
      <>
        Your key is a short code of letters and numbers. Save it somewhere safe
        and treat it like a password: anyone who has it can use up your daily
        requests.
      </>
    ),
  },
  {
    title: "Open a company in PeerSet",
    body: (
      <>
        Look up a ticker, for example{" "}
        <Link href="/c/LII" className={LINK}>
          LII
        </Link>
        , and wait until the page says every peer has loaded. Fill prices is
        switched off until then.
      </>
    ),
  },
  {
    title: "Paste the key and press Fill prices",
    body: (
      <>
        Under &ldquo;Prices for the table&rdquo;, find the Price autofill box.
        Paste your key into &ldquo;Alpha Vantage key&rdquo; and press Fill
        prices. Each company&apos;s latest closing price is filled in one at a
        time, and the page shows the date of the close it used.
      </>
    ),
  },
];

const FACTS: [string, ReactNode][] = [
  [
    "Your key stays in your browser",
    "Your browser asks Alpha Vantage for the prices directly. The key is never sent to PeerSet, and it is not in the page address or the Excel export.",
  ],
  [
    "Remembering and forgetting",
    "Tick “Remember on this device” to keep the key in this browser for next time. “Forget key” removes the key and any saved prices from this browser.",
  ],
  [
    `${FREE_KEY_REQUESTS_PER_DAY} requests a day`,
    <>
      Alpha Vantage&apos;s free key allows {FREE_KEY_REQUESTS_PER_DAY} requests
      a day, and each ticker is one request. A company with 8 peers is 1 + 8 = 9
      tickers, so a free key covers two full fills a day (2 × 9 = 18) but not a
      third (3 × 9 = 27). Prices this browser already fetched today are reused
      without a new request.{" "}
      <Out href={ALPHA_VANTAGE_PREMIUM_URL}>
        Alpha Vantage&apos;s paid plans
      </Out>{" "}
      have no daily limit.
    </>,
  ],
  [
    "If the limit runs out",
    "PeerSet stops, tells you how many prices it filled, and keeps them. Type the rest yourself or try again tomorrow.",
  ],
  [
    `At most ${MAX_FILL_SYMBOLS} tickers per click`,
    "With more companies than that, the rest stay for you to enter.",
  ],
  [
    "Closing prices, not live quotes",
    "Fill prices uses the latest end-of-day close. Prices you already typed are kept unless you tick “Overwrite existing prices”.",
  ],
];

const WRAP = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";
const H2 = "font-display text-4xl font-medium tracking-[-0.01em] sm:text-5xl";
const SPLIT = `${WRAP} grid grid-cols-1 gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-16`;

export default function PriceKeyGuide() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="guide-heading"
        className={`${WRAP} flex flex-col items-start gap-6 py-12 lg:py-20`}
      >
        <h1
          id="guide-heading"
          className="font-display max-w-4xl text-5xl leading-[1.05] font-bold tracking-[-0.02em] sm:text-7xl"
        >
          Get a free key to fill prices
        </h1>
        <p className="max-w-2xl text-lg leading-snug">
          PeerSet reads financials from SEC filings, but filings don&apos;t
          carry share prices. You can type prices yourself, or get a free key
          from Alpha Vantage and let your browser fill them in.
        </p>
        <a
          href={ALPHA_VANTAGE_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className="bg-accent px-6 py-2.5 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Get a key from Alpha Vantage
        </a>
      </section>

      <section aria-labelledby="steps-heading" className="band">
        <div className={SPLIT}>
          <h2 id="steps-heading" className={H2}>
            Five steps
          </h2>
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-6 border-t border-foreground py-4"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-2xl leading-none font-medium tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[17px] leading-snug font-semibold">
                    {step.title}
                  </h3>
                  <p className="max-w-2xl text-[15px] leading-snug">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="facts-heading" className={SPLIT}>
        <h2 id="facts-heading" className={H2}>
          Good to know
        </h2>
        <ul className="flex flex-col">
          {FACTS.map(([title, body]) => (
            <li
              key={title}
              className="grid grid-cols-1 gap-1 border-t border-foreground py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"
            >
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="text-[15px] leading-snug">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="nokey-heading" className="bg-surface">
        <div className={SPLIT}>
          <h2 id="nokey-heading" className={H2}>
            Without a key
          </h2>
          <div className="flex flex-col items-start gap-4 text-[15px] leading-snug">
            <p className="max-w-2xl">
              A key is optional. Type each closing price into the table, or
              paste several at once as one &ldquo;ticker, price&rdquo; per line,
              and set the price date. Everything else works the same.
            </p>
            <Link href="/" className={LINK}>
              Look up a ticker
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
