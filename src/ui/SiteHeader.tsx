import Link from "next/link";
import { HEADER_ACTIONS_ID } from "./headerSlot";
import { TickerSearch } from "./TickerSearch";

// Blueprint §6 header: wordmark, ticker search and, on a company page, the Export
// button (the workbench portals it into the actions slot, M5).
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
        <div className="flex items-center gap-4">
          <div id={HEADER_ACTIONS_ID} />
          <TickerSearch compact label="Go to ticker" />
        </div>
      </div>
    </header>
  );
}
