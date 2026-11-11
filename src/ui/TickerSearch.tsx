"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { CompanyIdentity } from "@/domain/types";
import { parseTickerInput } from "@/lib/ticker";
import { IdentityCard } from "./IdentityCard";

type Lookup =
  | { kind: "idle" }
  | { kind: "checking"; ticker: string }
  | { kind: "found"; ticker: string; identity: CompanyIdentity };

// Ticker box: checks the shape in the browser. In the header, Enter goes straight to
// /c/<TICKER>. On the home page (lookup), it first asks /api/identity and shows who
// the ticker belongs to, or "No SEC-registered company uses XYZ" inline (blueprint §6).
export function TickerSearch({
  compact = false,
  label = "Ticker",
  lookup = false,
}: {
  compact?: boolean;
  label?: string;
  lookup?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Lookup>({ kind: "idle" });

  // Only the latest lookup may set the card: a new one aborts the one before, and a
  // response that arrives late is ignored (v1.1: two quick lookups never show the
  // first ticker's card for the second).
  const latest = useRef<AbortController | null>(null);
  useEffect(() => () => latest.current?.abort(), []);

  async function check(ticker: string) {
    latest.current?.abort();
    const ctrl = new AbortController();
    latest.current = ctrl;
    const current = () => latest.current === ctrl && !ctrl.signal.aborted;
    setResult({ kind: "checking", ticker });
    try {
      const res = await fetch(
        `/api/identity?ticker=${encodeURIComponent(ticker)}`,
        { signal: ctrl.signal },
      );
      const body = await res.json();
      if (!current()) return;
      if (res.ok) setResult({ kind: "found", ticker, identity: body });
      else {
        setResult({ kind: "idle" });
        setError(
          typeof body?.message === "string"
            ? body.message
            : `Couldn't check ${ticker}; try again`,
        );
      }
    } catch {
      if (!current()) return;
      setResult({ kind: "idle" });
      setError(`Couldn't check ${ticker}; try again`);
    }
  }

  return (
    <form
      role="search"
      aria-label={label}
      className="flex flex-wrap items-start gap-2 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        const r = parseTickerInput(value);
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setError(null);
        if (lookup) void check(r.ticker);
        else router.push(`/c/${encodeURIComponent(r.ticker)}`);
      }}
    >
      <label
        htmlFor={id}
        className={compact ? "sr-only" : "w-full font-medium"}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="e.g. LII"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${compact ? "w-28 border-rule px-2 py-1" : "w-64 border-foreground px-3 py-2.5 text-base"} rounded-sm border bg-background uppercase placeholder:normal-case focus-visible:outline-2 focus-visible:outline-accent`}
      />
      <button
        type="submit"
        className={`${compact ? "px-3 py-1" : "px-6 py-2.5 text-base"} rounded-sm bg-accent font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      >
        {lookup ? "Look up" : "Analyze"}
      </button>
      {error && (
        <p id={`${id}-error`} className="w-full text-error">
          {error}
        </p>
      )}
      {lookup && (
        <div aria-live="polite" className="w-full">
          {result.kind === "checking" && (
            <p className="text-muted">Checking {result.ticker} with SEC…</p>
          )}
          {result.kind === "found" && (
            <IdentityCard identity={result.identity} ticker={result.ticker} />
          )}
        </div>
      )}
    </form>
  );
}
