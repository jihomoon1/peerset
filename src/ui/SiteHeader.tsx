import Link from "next/link";
import { HEADER_ACTIONS_ID } from "./headerSlot";
import { TickerSearch } from "./TickerSearch";

// Blueprint §6 header: wordmark, ticker search and, on a company page, the Export
// button (the workbench portals it into the actions slot, M5).
export function SiteHeader() {
  return (
    <header className="band">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
        <Link
          href="/"
          className="font-display text-xl font-bold focus-visible:outline-2 focus-visible:outline-accent"
        >
          PeerSet
        </Link>
        <div className="flex items-center gap-4">
          <div id={HEADER_ACTIONS_ID} />
          <TickerSearch compact label="Go to ticker" />
        </div>
      </div>
    </header>
  );
}
