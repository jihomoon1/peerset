"use client";

// The Export button (blueprint §6): in the sticky site header, drawn there through a
// portal because the header belongs to the root layout while the peers and prices
// live in the workbench. Disabled until the table has a usable row; shows
// "Exporting…" while the server builds the workbook; failures show in plain words.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { COMPS_COLUMNS } from "@/domain/comps";
import {
  DEFAULT_SLIDE_OPTIONS,
  SLIDE_COLUMN_LABEL,
  SLIDE_STAT_LABEL,
  SLIDE_STATS,
  type SlideOptions,
} from "@/export/options";
import type { ExportState } from "./exportRequest";
import { HEADER_ACTIONS_ID } from "./headerSlot";

const noSubscribe = () => () => {};

function filenameOf(res: Response, fallback: string): string {
  const m = /filename="([^"]+)"/.exec(
    res.headers.get("content-disposition") ?? "",
  );
  return m ? m[1] : fallback;
}

export function ExportButton({ state }: { state: ExportState }) {
  // The header slot exists only in the browser; the server renders nothing here,
  // so the first client render matches it and the portal appears right after.
  const slot = useSyncExternalStore(
    noSubscribe,
    () => document.getElementById(HEADER_ACTIONS_ID),
    () => null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Export options (blueprint §17): the full workbook unless the user picks the
  // slide table. Kept for this visit only.
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<"full" | "slide">("full");
  const [slide, setSlide] = useState<SlideOptions>(DEFAULT_SLIDE_OPTIONS);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  const toggle = <K extends keyof SlideOptions>(
    key: K,
    item: SlideOptions[K][number],
    on: boolean,
  ) =>
    setSlide((cur) => {
      const list = cur[key] as string[];
      const next = on ? [...list, item] : list.filter((x) => x !== item);
      // The table needs at least one column.
      if (key === "columns" && next.length === 0) return cur;
      return { ...cur, [key]: next };
    });

  const disabled = busy || state.disabledReason !== null;
  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          layout === "slide"
            ? { ...state.request, options: { layout, ...slide } }
            : state.request,
        ),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "message" in body
            ? String((body as { message: unknown }).message)
            : `the server answered ${res.status}`;
        setError(`Export failed: ${message}`);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameOf(
        res,
        `PeerSet_${state.request.target}_${layout === "slide" ? "slide" : "comps"}.xlsx`,
      );
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(
        "Export failed: the request didn't complete; check your connection",
      );
    } finally {
      setBusy(false);
    }
  };

  const note =
    state.disabledReason ??
    (state.notANumber > 0
      ? `${state.notANumber} cell${state.notANumber === 1 ? "" : "s"} show NM, — or Unsupported, in the workbook as on screen`
      : null);

  const ui = (
    <div className="flex items-center gap-2 text-[12px]">
      {error ? (
        <p role="alert" className="max-w-xs truncate text-error" title={error}>
          {error}
        </p>
      ) : note ? (
        <p
          id="export-note"
          className="hidden max-w-xs truncate text-muted md:block"
          title={note}
        >
          {note}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onExport}
        disabled={disabled}
        aria-describedby={note ? "export-note" : undefined}
        className="rounded-sm bg-accent px-3 py-1 text-[13px] font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export to Excel"}
      </button>
      <div ref={box} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="export-options"
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm border border-rule px-3 py-1 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Options
          {layout === "slide" && <span className="sr-only">: slide table</span>}
        </button>
        {open && (
          <div
            id="export-options"
            role="group"
            aria-label="Export options"
            className="absolute top-full right-0 z-30 mt-2 flex w-72 flex-col gap-3 border border-foreground bg-background p-4 text-[13px] text-foreground"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold">What to export</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="export-layout"
                  className="mt-0.5"
                  checked={layout === "full"}
                  onChange={() => setLayout("full")}
                />
                <span>
                  Full workbook
                  <span className="block text-muted">
                    Three sheets with formulas and every source.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="export-layout"
                  className="mt-0.5"
                  checked={layout === "slide"}
                  onChange={() => setLayout("slide")}
                />
                <span>
                  Slide table
                  <span className="block text-muted">
                    One clean table to paste into a slide, with the sources for
                    your footer.
                  </span>
                </span>
              </label>
            </fieldset>
            {layout === "slide" && (
              <details className="border-t border-rule pt-3">
                <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-accent">
                  Advanced
                </summary>
                <fieldset className="mt-3 flex flex-col gap-1">
                  <legend className="mb-1 text-muted">Columns</legend>
                  {COMPS_COLUMNS.map((c) => (
                    <label key={c} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={slide.columns.includes(c)}
                        onChange={(e) => toggle("columns", c, e.target.checked)}
                      />
                      {SLIDE_COLUMN_LABEL[c]}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="mt-3 flex flex-col gap-1">
                  <legend className="mb-1 text-muted">
                    Summary rows (peers only)
                  </legend>
                  {SLIDE_STATS.map((st) => (
                    <label key={st} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={slide.stats.includes(st)}
                        onChange={(e) => toggle("stats", st, e.target.checked)}
                      />
                      {SLIDE_STAT_LABEL[st]}
                    </label>
                  ))}
                </fieldset>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return slot ? createPortal(ui, slot) : null;
}
