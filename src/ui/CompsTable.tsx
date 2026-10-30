"use client";

// The comps table (blueprint §6): target row pinned with an accent border, peer rows,
// then statistics rows below a rule that never sort. Sticky header and Company
// column, sortable headers with aria-sort, NM with its reason, a lag marker in "Fin.
// through", a dot on values parsed from the filing. Every cell opens the same drawers
// as the target's; statistics cells open a drawer listing what each statistic used.

import { useEffect, useRef, useState } from "react";
import type {
  CompsColumn,
  CompsRow,
  CompsTable as Comps,
  StatColumn,
} from "@/domain/comps";
import type { MetricKey } from "@/domain/fundamentals";
import type { MetricStats } from "@/domain/stats";
import type { Metric } from "@/domain/types";
import {
  formatMillions,
  formatMultiple,
  formatPercent,
  formatPerShare,
} from "@/lib/format";
import { sortPeerRows, type SortColumn, type SortState } from "./compsSort";
import { EvBridgeDrawer } from "./EvBridgeDrawer";
import { displayMetric } from "./metricDisplay";
import { byListingOrder, displayValuationCell } from "./pricing";
import { ProvenanceDrawer } from "./ProvenanceDrawer";
import { StatsDrawer, STAT_ROWS, type StatKey } from "./StatsDrawer";

type Unit = "USD" | "multiple" | "ratio" | "USD/shares";

export const TABLE_COLUMNS: {
  key: CompsColumn;
  label: string;
  header: string;
  unit: Unit;
}[] = [
  { key: "price", label: "Price", header: "Price (USD)", unit: "USD/shares" },
  { key: "marketCap", label: "Market cap", header: "Market cap", unit: "USD" },
  { key: "ev", label: "EV", header: "EV", unit: "USD" },
  { key: "revenue", label: "LTM revenue", header: "LTM revenue", unit: "USD" },
  { key: "ebitda", label: "LTM EBITDA", header: "LTM EBITDA", unit: "USD" },
  {
    key: "ebitdaMargin",
    label: "EBITDA margin",
    header: "EBITDA margin",
    unit: "ratio",
  },
  {
    key: "evRevenue",
    label: "EV/Revenue",
    header: "EV/Revenue",
    unit: "multiple",
  },
  {
    key: "evEbitda",
    label: "EV/EBITDA",
    header: "EV/EBITDA",
    unit: "multiple",
  },
  { key: "pe", label: "P/E", header: "P/E", unit: "multiple" },
];

const OPERATING: Partial<Record<CompsColumn, MetricKey>> = {
  revenue: "revenue",
  ebitda: "ebitda",
  ebitdaMargin: "ebitdaMargin",
};
const VALUATION = new Set<CompsColumn>([
  "marketCap",
  "ev",
  "evRevenue",
  "evEbitda",
  "pe",
]);

export function formatStat(value: number, unit: Unit): string {
  if (unit === "multiple") return formatMultiple(value);
  if (unit === "ratio") return formatPercent(value);
  if (unit === "USD/shares") return formatPerShare(value);
  return formatMillions(value);
}

interface CellText {
  text: string;
  kind: "value" | "needs-price" | "nm" | "missing" | "unsupported";
  note?: string;
}

function cellText(row: CompsRow, col: CompsColumn, m: Metric): CellText {
  const unit = TABLE_COLUMNS.find((c) => c.key === col)!.unit;
  if (col === "price" || VALUATION.has(col))
    return displayValuationCell(
      m,
      unit === "ratio" ? "multiple" : unit,
      row.needsPrice ?? [],
    );
  const d = displayMetric(m);
  return { text: d.text, kind: d.kind, note: d.note ?? d.exact };
}

const tone = (kind: CellText["kind"]) =>
  kind === "value" ? "" : kind === "needs-price" ? "text-warn" : "text-muted";

type Open =
  | { kind: "cell"; row: CompsRow; col: CompsColumn }
  | { kind: "stats"; col: StatColumn; stat: StatKey };

const STICKY_COL =
  "sticky left-0 z-[1] bg-background max-w-48 min-w-40 border-r border-rule";

export function CompsTable({
  table,
  inputs,
  errors,
  onInput,
}: {
  table: Comps;
  inputs: Record<string, string>;
  errors: Record<string, string>;
  onInput: (ticker: string, text: string) => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) opener.current?.focus();
  }, [open]);
  const peers = sortPeerRows(table.peers, sort);
  const busy = table.counts.loading > 0;

  const openFrom = (e: React.MouseEvent<HTMLButtonElement>, next: Open) => {
    opener.current = e.currentTarget;
    setOpen(next);
  };

  const sortButton = (column: SortColumn, label: string) => {
    const active = sort?.column === column ? sort.direction : undefined;
    return (
      <button
        type="button"
        onClick={() =>
          setSort({
            column,
            direction: active === "ascending" ? "descending" : "ascending",
          })
        }
        className="inline-flex items-center gap-1 rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {label}
        <span aria-hidden="true" className="text-muted">
          {active === "ascending" ? "▲" : active === "descending" ? "▼" : "↕"}
        </span>
      </button>
    );
  };
  const ariaSort = (column: SortColumn) =>
    sort?.column === column ? sort.direction : undefined;

  const renderCells = (row: CompsRow) => {
    const f = row.fundamentals!;
    const cells = row.cells!;
    const fin = (
      <td key="fin" className="px-2 whitespace-nowrap">
        {f.ltmEnd}
        {f.freshness.status === "filing-parsed" && (
          <span
            className="ml-1 text-accent"
            title="Parsed from the filing: SEC's companyfacts was behind"
          >
            <span aria-hidden="true">•</span>
            <span className="sr-only"> (parsed from filing)</span>
          </span>
        )}
        {row.lag && (
          <span className="ml-1 text-warn" title={row.lag.message}>
            <span aria-hidden="true">lag</span>
            <span className="sr-only"> Lagging: {row.lag.message}</span>
          </span>
        )}
      </td>
    );
    return [
      fin,
      ...TABLE_COLUMNS.map((c) => {
        if (c.key === "price" && row.role === "peer")
          return (
            <td key={c.key} className="px-2 text-right">
              <PriceInputs
                row={row}
                inputs={inputs}
                errors={errors}
                onInput={onInput}
              />
            </td>
          );
        const m = cells[c.key];
        const d = cellText(row, c.key, m);
        const cautions = m.warnings.filter((w) => w.severity === "caution");
        const content = (
          <>
            {d.text}
            {d.kind === "nm" && d.note && (
              <span className="sr-only"> ({d.note})</span>
            )}
            {cautions.length > 0 && (
              <span
                className="ml-1 text-warn"
                title={cautions.map((w) => w.message).join("; ")}
              >
                <span aria-hidden="true">!</span>
                <span className="sr-only">
                  {" "}
                  Warning: {cautions.map((w) => w.message).join("; ")}
                </span>
              </span>
            )}
          </>
        );
        return (
          <td key={c.key} className="px-2 text-right whitespace-nowrap">
            {c.key === "price" ? (
              <span className={tone(d.kind)}>{content}</span>
            ) : (
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${row.ticker} ${c.label}: ${d.text}${d.note && d.kind !== "value" ? ` (${d.note})` : ""}. Show calculation`}
                title={d.kind === "value" ? undefined : d.note}
                onClick={(e) => openFrom(e, { kind: "cell", row, col: c.key })}
                className={`rounded-sm px-1 hover:bg-surface hover:underline focus-visible:outline-2 focus-visible:outline-accent ${tone(d.kind)}`}
              >
                {content}
              </button>
            )}
          </td>
        );
      }),
    ];
  };

  const companyCell = (row: CompsRow) => {
    const name = row.fundamentals?.identity.name ?? row.ticker;
    return (
      <th
        scope="row"
        className={`${STICKY_COL} px-2 text-left font-normal ${
          row.role === "target"
            ? "border-l-4 border-l-accent"
            : "border-l-4 border-l-transparent"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="truncate" title={name}>
            {name}
          </span>
          {row.role === "target" && (
            <span className="shrink-0 rounded-sm bg-accent px-1 text-[11px] font-medium text-background">
              Target
            </span>
          )}
        </span>
      </th>
    );
  };

  const statusRow = (row: CompsRow) => (
    <tr
      key={row.ticker}
      className="h-8 border-b border-rule text-muted"
      aria-busy={row.state === "loading" ? true : undefined}
    >
      {companyCell(row)}
      <td className="px-2">{row.ticker}</td>
      {row.state === "loading" ? (
        <td colSpan={TABLE_COLUMNS.length + 1} className="px-2">
          <span className="sr-only">Loading {row.ticker}</span>
          <span
            aria-hidden="true"
            className="block h-3 w-full animate-pulse rounded-sm bg-surface"
          />
        </td>
      ) : (
        <td colSpan={TABLE_COLUMNS.length + 1} className="px-2 italic">
          {row.failure?.code === "UNSUPPORTED_ISSUER"
            ? "Unsupported"
            : "Failed to load"}
          : {row.failure?.message} — excluded from statistics
        </td>
      )}
    </tr>
  );

  const dataRow = (row: CompsRow) => (
    <tr key={row.ticker} className="h-8 border-b border-rule">
      {companyCell(row)}
      <td className="px-2">{row.ticker}</td>
      {renderCells(row)}
    </tr>
  );

  const statsRow = (stat: StatKey, label: string) => (
    <tr key={stat} className="h-8 border-b border-rule">
      <th
        scope="row"
        className={`${STICKY_COL} border-l-4 border-l-transparent px-2 text-left font-medium`}
      >
        {label}
      </th>
      <td />
      <td />
      {TABLE_COLUMNS.map((c) => {
        if (c.key === "price") return <td key={c.key} />;
        const s: MetricStats = table.stats[c.key];
        const text =
          stat === "n"
            ? `${s.nValid}${s.nExcluded ? ` (${s.nExcluded} excl.)` : ""}`
            : s[stat] === null
              ? "—"
              : formatStat(s[stat]!, c.unit);
        return (
          <td key={c.key} className="px-2 text-right whitespace-nowrap">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`${label} ${c.label}: ${text}. Show values used`}
              onClick={(e) =>
                openFrom(e, { kind: "stats", col: c.key as StatColumn, stat })
              }
              className={`rounded-sm px-1 hover:bg-surface hover:underline focus-visible:outline-2 focus-visible:outline-accent ${text === "—" ? "text-muted" : ""}`}
            >
              {text}
            </button>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div
      className="relative max-h-[75vh] w-full overflow-auto rounded-sm border border-rule"
      aria-busy={busy ? true : undefined}
    >
      <table className="w-full min-w-[1180px] border-collapse text-[13px] tabular-nums">
        <caption className="sr-only">
          Trading comps: the target, then its peers, then statistics over peers
          only. Money columns in USD millions; multiples on LTM financials.
        </caption>
        <thead className="sticky top-0 z-[2] bg-background">
          <tr className="border-b border-rule text-left">
            <th
              scope="col"
              className={`${STICKY_COL} z-[3] px-2 py-1.5`}
              aria-sort={ariaSort("company")}
            >
              {sortButton("company", "Company")}
            </th>
            <th
              scope="col"
              className="px-2 py-1.5"
              aria-sort={ariaSort("ticker")}
            >
              {sortButton("ticker", "Ticker")}
            </th>
            <th
              scope="col"
              className="px-2 py-1.5 whitespace-nowrap"
              aria-sort={ariaSort("finThrough")}
            >
              {sortButton("finThrough", "Fin. through")}
            </th>
            {TABLE_COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-2 py-1.5 text-right whitespace-nowrap"
                aria-sort={ariaSort(c.key)}
              >
                {sortButton(c.key, c.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRow(table.target)}
          {peers.map((row) =>
            row.state === "loaded" ? dataRow(row) : statusRow(row),
          )}
        </tbody>
        <tbody className="border-t-2 border-foreground">
          {STAT_ROWS.map((r) => statsRow(r.key, r.label))}
        </tbody>
      </table>
      {open?.kind === "cell" &&
        open.row.fundamentals &&
        (OPERATING[open.col] ? (
          <ProvenanceDrawer
            f={open.row.fundamentals}
            metricKey={OPERATING[open.col]!}
            onClose={() => setOpen(null)}
          />
        ) : (
          <EvBridgeDrawer
            f={open.row.fundamentals}
            v={open.row.valuation!}
            onClose={() => setOpen(null)}
          />
        ))}
      {open?.kind === "stats" && (
        <StatsDrawer
          label={TABLE_COLUMNS.find((c) => c.key === open.col)!.label}
          unit={TABLE_COLUMNS.find((c) => c.key === open.col)!.unit}
          stat={open.stat}
          stats={table.stats[open.col]}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function PriceInputs({
  row,
  inputs,
  errors,
  onInput,
}: {
  row: CompsRow;
  inputs: Record<string, string>;
  errors: Record<string, string>;
  onInput: (ticker: string, text: string) => void;
}) {
  const f = row.fundamentals!;
  const tickers = byListingOrder(
    f.identity,
    f.shareClasses.classes.flatMap((c) => (c.ticker ? [c.ticker] : [])),
    (t) => t,
  );
  if (tickers.length === 0)
    return <span className="text-muted">No listed class</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {tickers.map((t) => (
        <span key={t} className="flex items-center gap-1">
          {tickers.length > 1 && (
            <span aria-hidden="true" className="text-[11px] text-muted">
              {t}
            </span>
          )}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${t} price (USD)`}
            aria-invalid={errors[t] ? true : undefined}
            title={errors[t]}
            placeholder="Needs price"
            value={inputs[t] ?? ""}
            onChange={(e) => onInput(t, e.target.value)}
            className={`w-24 rounded-sm border px-1 py-0.5 text-right tabular-nums focus-visible:outline-2 focus-visible:outline-accent ${
              errors[t]
                ? "border-error"
                : !inputs[t]?.trim()
                  ? "border-warn bg-warn-bg"
                  : "border-rule bg-background"
            }`}
          />
        </span>
      ))}
    </span>
  );
}
