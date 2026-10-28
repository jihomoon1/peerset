"use client";

// The specific reason on /c/[ticker]'s 404 page: "Unknown ticker" or "Company not
// supported" with its one-sentence reason, as /api/fundamentals reports it. That
// call stops at the ticker lookup or the support check, before any filing is read.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ErrorResponseBody } from "@/lib/errors";
import { ErrorState } from "./ErrorState";

export function CompanyNotFoundReason() {
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker ?? "").toUpperCase();
  const [error, setError] = useState<ErrorResponseBody | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => res.json() as Promise<Partial<ErrorResponseBody>>)
      .then((body) => {
        if (!live) return;
        if (
          body.code === "TICKER_NOT_FOUND" ||
          body.code === "UNSUPPORTED_ISSUER"
        )
          setError(body as ErrorResponseBody);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ticker]);

  if (error) return <ErrorState error={error} />;
  return (
    <h1 className="text-base font-semibold">
      {failed
        ? `Can't show ${ticker.slice(0, 12)}`
        : `Checking ${ticker.slice(0, 12)}…`}
    </h1>
  );
}
