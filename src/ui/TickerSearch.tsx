"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { parseTickerInput } from "@/lib/ticker";

// Ticker box: checks the shape in the browser, then Enter goes to /c/<TICKER>.
// Whether SEC lists the ticker is checked on the company page.
export function TickerSearch({
  compact = false,
  label = "Ticker",
}: {
  compact?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        router.push(`/c/${encodeURIComponent(r.ticker)}`);
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
        className={`${compact ? "w-28" : "w-48"} rounded-sm border border-rule bg-background px-2 py-1 uppercase placeholder:normal-case focus-visible:outline-2 focus-visible:outline-accent`}
      />
      <button
        type="submit"
        className="rounded-sm bg-accent px-3 py-1 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Analyze
      </button>
      {error && (
        <p id={`${id}-error`} className="w-full text-error">
          {error}
        </p>
      )}
    </form>
  );
}
