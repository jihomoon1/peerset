"use client";

// "Price autofill" (v1.1, docs/licensing.md): the visitor's own free Alpha Vantage key
// fills the price inputs straight from their browser. The key lives in this
// component's state, and in localStorage only when "Remember on this device" is
// checked. It never enters the URL, the export request or any PeerSet route.

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { QuoteSnapshot } from "@/domain/types";
import { formatDate } from "@/lib/format";
import {
  browserStorage,
  clearQuoteCache,
  fillQuotes,
  fillSummary,
  forgetRememberedKey,
  MAX_FILL_SYMBOLS,
  readRememberedKey,
  rememberKey,
  type FillRow,
} from "@/prices/browserAlphaVantage";

const noSubscribe = () => () => {};

type RowState =
  | { status: "waiting" | "filling" }
  | FillRow
  | { status: "kept"; symbol: string };

function rowText(r: RowState): string {
  switch (r.status) {
    case "waiting":
      return "waiting";
    case "filling":
      return "filling…";
    case "filled":
      return `filled, close of ${formatDate(r.quote.asOfDate)}`;
    case "cached":
      return `filled from today's saved close of ${formatDate(r.quote.asOfDate)}`;
    case "kept":
      return "kept your price";
    default:
      return r.reason;
  }
}

export function PriceAutofill({
  tickers,
  inputs,
  disabledReason,
  onQuote,
  onDone,
}: {
  tickers: readonly string[]; // every listed class of the target and loaded peers
  inputs: Record<string, string>;
  disabledReason: string | null; // e.g. while peers are still loading
  onQuote: (q: QuoteSnapshot) => void; // one filled price, as it arrives
  onDone: (quotes: QuoteSnapshot[]) => void;
}) {
  const id = useId();
  // A remembered key is read from storage on the client only (the server snapshot is
  // ""), so the server render and hydration agree. Edits then live in state.
  const remembered = useSyncExternalStore(
    noSubscribe,
    () => readRememberedKey(browserStorage()),
    () => "",
  );
  const [typedKey, setApiKey] = useState<string | null>(null);
  const [rememberChoice, setRemember] = useState<boolean | null>(null);
  const apiKey = typedKey ?? remembered;
  const remember = rememberChoice ?? remembered !== "";
  const [overwrite, setOverwrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [summary, setSummary] = useState("");
  const [progress, setProgress] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const unique = [...new Set(tickers)];
  const targets = unique.filter((t) => overwrite || !inputs[t]?.trim());
  const key = apiKey.trim();
  const blocked =
    disabledReason ??
    (key === ""
      ? "Enter your Alpha Vantage key first"
      : targets.length === 0
        ? "Every price is already entered"
        : null);

  const fill = async () => {
    if (blocked || running) return;
    const storage = browserStorage();
    if (remember) rememberKey(storage, key);
    const symbols = targets.slice(0, MAX_FILL_SYMBOLS);
    setRows(
      Object.fromEntries([
        ...unique
          .filter((t) => !symbols.includes(t))
          .map((t) => [t, { status: "kept", symbol: t } as RowState]),
        ...symbols.map((t, i) => [
          t,
          { status: i === 0 ? "filling" : "waiting" } as RowState,
        ]),
      ]),
    );
    setSummary("");
    setRunning(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const done: QuoteSnapshot[] = [];
    const result = await fillQuotes({
      symbols,
      apiKey: key,
      storage,
      signal: ctrl.signal,
      onProgress: (row, n, total) => {
        if (row.status === "filled" || row.status === "cached") {
          done.push(row.quote);
          onQuote(row.quote);
        }
        setRows((cur) => ({
          ...cur,
          [row.symbol]: row,
          ...(symbols[n] ? { [symbols[n]]: { status: "filling" } } : {}),
        }));
        setProgress(`Filled ${done.length} of ${total}`);
      },
    });
    abort.current = null;
    setRunning(false);
    const text = fillSummary(result);
    setSummary(text);
    setProgress(text);
    onDone(done);
  };

  const forget = () => {
    abort.current?.abort();
    const storage = browserStorage();
    forgetRememberedKey(storage);
    clearQuoteCache(storage);
    setApiKey("");
    setRemember(false);
    setRows({});
    setSummary("Key and saved prices removed from this browser.");
  };

  const rowEntries = unique.filter((t) => rows[t]);

  return (
    <section
      aria-labelledby={`${id}-h`}
      className="flex flex-col gap-2 rounded-sm border border-rule px-3 py-3 text-[13px]"
    >
      <h3 id={`${id}-h`} className="text-[13px] font-semibold">
        Price autofill
      </h3>
      <p className="text-muted">
        Your free key from{" "}
        <a
          href="https://www.alphavantage.co/support/#api-key"
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          alphavantage.co
        </a>
        . It stays in your browser; PeerSet never sees it.
      </p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-1">
          <span>Alpha Vantage key</span>
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (remember)
                rememberKey(browserStorage(), e.target.value.trim());
            }}
            className="w-56 rounded-sm border border-rule bg-background px-2 py-1 font-mono"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              const storage = browserStorage();
              if (e.target.checked && key) rememberKey(storage, key);
              if (!e.target.checked) forgetRememberedKey(storage);
            }}
          />
          Remember on this device
        </label>
        <button
          type="button"
          onClick={forget}
          className="rounded-sm border border-rule px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Forget key
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={fill}
          disabled={blocked !== null || running}
          aria-describedby={blocked ? `${id}-why` : undefined}
          className="rounded-sm bg-accent px-3 py-1 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Filling prices…" : "Fill prices"}
        </button>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Overwrite existing prices
        </label>
        {blocked && !running && (
          <span id={`${id}-why`} className="text-muted">
            {blocked}
          </span>
        )}
      </div>
      {targets.length > MAX_FILL_SYMBOLS && (
        <p className="text-muted">
          At most {MAX_FILL_SYMBOLS} prices per fill; the rest stay for you to
          enter.
        </p>
      )}
      {rowEntries.length > 0 && (
        <ul
          aria-label="Fill progress by ticker"
          className="flex flex-col gap-0.5"
        >
          {rowEntries.map((t) => (
            <li key={t} data-fill-row={t}>
              <span className="font-mono">{t}</span>{" "}
              <span
                className={
                  rows[t].status === "unknown_symbol" ||
                  rows[t].status === "failed"
                    ? "text-warn"
                    : "text-muted"
                }
              >
                {rowText(rows[t])}
              </span>
            </li>
          ))}
        </ul>
      )}
      {summary && <p data-fill-summary>{summary}</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {progress}
      </p>
    </section>
  );
}
