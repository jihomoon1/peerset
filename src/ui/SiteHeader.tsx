import Link from "next/link";
import { TickerSearch } from "./TickerSearch";

// Blueprint §6 header: wordmark and ticker search. Export comes in M5.
export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2">
        <Link
          href="/"
          className="font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          PeerSet
        </Link>
        <TickerSearch compact label="Go to ticker" />
      </div>
    </header>
  );
}
