"use client";

import { useEffect, useRef } from "react";
import type { CompanyFundamentals, MetricKey } from "@/domain/fundamentals";
import type {
  LTMCalculation,
  Provenance,
  ReportedFinancialFact,
} from "@/domain/types";
import { formatDate, formatPercent, formatPerShare } from "@/lib/format";
import {
  bridgeKeysFor,
  displayMetric,
  factUnitLabel,
  formatFactValue,
  formatPeriod,
  METRIC_LABELS,
  METRIC_UNITS,
} from "./metricDisplay";

const isFact = (p: Provenance): p is ReportedFinancialFact => "concept" in p;

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The provenance drawer (blueprint §6): formula, LTM bridge, every input with its
// concept, period, value, source and filing link, then status and warnings. A modal
// dialog: focus stays inside, Esc closes, focus returns to the opening button.
export function ProvenanceDrawer({
  f,
  metricKey,
  onClose,
}: {
  f: CompanyFundamentals;
  metricKey: MetricKey;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  const trapFocus = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const m = f.metrics[metricKey];
  const d = displayMetric(m);
  const bridges = bridgeKeysFor(metricKey).flatMap((key) => {
    const parts = Object.entries(f.ltmDetail).filter(([k]) =>
      k.startsWith(`${key}:`),
    );
    const own = f.ltmDetail[key];
    return [
      ...(own ? [{ key, label: METRIC_LABELS[key], calc: own }] : []),
      ...parts.map(([k, calc]) => ({
        key: k,
        label: `${METRIC_LABELS[key]}: ${calc.concept}`,
        calc,
      })),
    ];
  });
  const facts: ReportedFinancialFact[] =
    m.status === "reported" || m.status === "derived"
      ? m.inputs.filter(isFact)
      : [];
  const bridgeFacts = bridges.flatMap(({ calc }) =>
    [calc.fy, calc.ytdCurrent, calc.ytdPrior].filter(
      (x): x is ReportedFinancialFact => x !== undefined,
    ),
  );
  const inputs = facts.length > 0 ? facts : bridgeFacts;
  const metricInputs =
    m.status === "reported" || m.status === "derived"
      ? m.inputs.filter((p) => !isFact(p))
      : [];

  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={trapFocus}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[440px] max-w-full overflow-y-auto border-l border-rule bg-background p-0 text-[13px] text-foreground backdrop:bg-black/30"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="drawer-title" className="text-base font-semibold">
              {METRIC_LABELS[metricKey]}
            </h2>
            <p className="tabular-nums">
              <span className="text-lg font-semibold">{d.text}</span>{" "}
              <span className="text-muted">
                {METRIC_UNITS[metricKey]} · LTM through {formatDate(f.ltmEnd)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-rule px-2 py-1 focus-visible:outline-2 focus-visible:outline-accent"
          >
            Close
          </button>
        </div>

        <Section title="Status">
          <p>
            {m.status[0].toUpperCase() + m.status.slice(1)}
            {d.note && <>: {d.note}</>}
          </p>
        </Section>

        {(m.status === "reported" || m.status === "derived") && (
          <Section title="Formula">
            <p>{m.formula}</p>
            {metricInputs.length > 0 && (
              <p className="mt-1 tabular-nums text-muted">
                {metricInputs
                  .map((p) =>
                    "metric" in p
                      ? `${METRIC_LABELS[p.metric as MetricKey] ?? p.metric} ${formatFactValue(p.value, "USD")}`
                      : "",
                  )
                  .join(metricKey === "ebitdaMargin" ? " ÷ " : " + ")}
              </p>
            )}
          </Section>
        )}

        {bridges.map(({ key, label, calc }) => (
          <Bridge key={key} label={label} calc={calc} />
        ))}

        {inputs.length > 0 && (
          <Section title="Inputs">
            <ul className="flex flex-col gap-2">
              {inputs.map((x, i) => (
                <li key={i} className="border-l-2 border-rule pl-2">
                  <div className="font-mono text-xs">{x.concept}</div>
                  <div className="tabular-nums">
                    {formatPeriod(x)}:{" "}
                    <span className="font-medium">
                      {formatFactValue(x.value, x.unit)}
                    </span>{" "}
                    <span className="text-muted">{factUnitLabel(x.unit)}</span>
                  </div>
                  <div className="text-muted">
                    {x.source === "filing"
                      ? "Parsed from the filing's XBRL"
                      : "SEC companyfacts"}{" "}
                    · {x.filing.form} filed {formatDate(x.filing.filedDate)} ·{" "}
                    <a
                      href={x.filing.indexUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline underline-offset-2"
                    >
                      {x.filing.accession}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {metricKey === "dilutedEps" && (
          <Section title="EPS cross-check">
            {f.eps.crossCheck.status === "checked" ? (
              <p className="tabular-nums">
                LTM net income{" "}
                {formatFactValue(f.eps.crossCheck.netIncome, "USD")} ÷ FY
                diluted shares{" "}
                {formatFactValue(f.eps.crossCheck.dilutedShares, "shares")}M ={" "}
                {formatPerShare(f.eps.crossCheck.impliedEps)}; gap{" "}
                {formatPercent(f.eps.crossCheck.gap)} (warns above 5%).
              </p>
            ) : (
              <p>Skipped: {f.eps.crossCheck.reason}.</p>
            )}
            <p className="mt-1">
              Stock split since the last 10-K:{" "}
              {f.eps.splitSinceLastAnnual
                ? `yes (${f.eps.splitEvidence})`
                : "none detected"}
            </p>
          </Section>
        )}

        <Section title="Warnings">
          {m.warnings.length === 0 ? (
            <p className="text-muted">None</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {m.warnings.map((w) => (
                <li
                  key={w.code + w.message}
                  className={
                    w.severity === "caution" ? "bg-warn-bg px-2 py-1" : ""
                  }
                >
                  <span
                    className={
                      w.severity === "caution" ? "font-medium text-warn" : ""
                    }
                  >
                    {w.severity === "caution" ? "Caution" : "Note"}:
                  </span>{" "}
                  {w.message}{" "}
                  <span className="font-mono text-xs text-muted">{w.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <p className="text-xs text-muted">Methodology {f.methodologyVersion}</p>
      </div>
    </dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

const ROW_LABELS = {
  fy: "Fiscal year",
  ytdCurrent: "+ Current YTD",
  ytdPrior: "− Prior-year YTD",
} as const;

// FY + YTD − prior YTD = LTM, with the §2 checks.
function Bridge({ label, calc }: { label: string; calc: LTMCalculation }) {
  const rows = (["fy", "ytdCurrent", "ytdPrior"] as const).flatMap((k) =>
    calc[k] ? [[k, calc[k]] as const] : [],
  );
  return (
    <Section title={`LTM bridge: ${label}`}>
      <table className="w-full border-collapse tabular-nums">
        <caption className="sr-only">
          {label}: how the last twelve months are built
        </caption>
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th scope="col" className="py-1 pr-2 font-normal">
              Component
            </th>
            <th scope="col" className="py-1 pr-2 font-normal">
              Period
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, fact]) => (
            <tr key={k} className="border-b border-rule">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {calc.method === "annual"
                  ? "Fiscal year (10-K)"
                  : ROW_LABELS[k]}
              </th>
              <td className="py-1 pr-2">{formatPeriod(fact)}</td>
              <td className="py-1 text-right">
                {formatFactValue(fact.value, fact.unit)}
              </td>
            </tr>
          ))}
          <tr className="font-medium">
            <th scope="row" className="py-1 pr-2 text-left">
              = LTM
            </th>
            <td className="py-1 pr-2">through {formatDate(calc.ltmEnd)}</td>
            <td className="py-1 text-right">
              {calc.value === undefined
                ? "—"
                : formatFactValue(calc.value, calc.fy.unit)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 font-mono text-xs text-muted">{calc.concept}</p>
      <ul className="mt-1 text-xs">
        {calc.checks.map((c) => (
          <li key={c.name}>
            <span className={c.passed ? "" : "font-medium text-error"}>
              {c.passed ? "Passed" : "Failed"}
            </span>{" "}
            {c.name}: <span className="text-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
