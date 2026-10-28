// 404 for /c/[ticker]: an unknown ticker or an unsupported company. not-found files
// get no props, so the reason is fetched on the client (Next 16 docs, not-found.js).

import Link from "next/link";
import { CompanyNotFoundReason } from "@/ui/CompanyNotFoundReason";

export default function CompanyNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-4">
      <main className="flex flex-1 flex-col gap-3">
        <CompanyNotFoundReason />
        <p className="text-sm">
          <Link href="/" className="text-accent underline">
            Search for another ticker
          </Link>
        </p>
      </main>
    </div>
  );
}
