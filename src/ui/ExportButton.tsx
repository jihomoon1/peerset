"use client";

// The Export button (blueprint §6): in the sticky site header, drawn there through a
// portal because the header belongs to the root layout while the peers and prices
// live in the workbench. Disabled until the table has a usable row; shows
// "Exporting…" while the server builds the workbook; failures show in plain words.

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

  const disabled = busy || state.disabledReason !== null;
  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state.request),
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
        `PeerSet_${state.request.target}_comps.xlsx`,
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
    </div>
  );
  return slot ? createPortal(ui, slot) : null;
}
