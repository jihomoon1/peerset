"use client";

import { useEffect, useRef } from "react";
import type { MetricWarning } from "@/domain/types";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The provenance drawer's shell (blueprint §6): a modal dialog on the right. Focus
// stays inside, Esc closes, focus returns to the opening button (the caller's job).
export function Drawer({
  title,
  headline,
  subtitle,
  methodologyVersion,
  onClose,
  children,
}: {
  title: string;
  headline: string;
  subtitle: string;
  methodologyVersion: string;
  onClose: () => void;
  children: React.ReactNode;
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
              {title}
            </h2>
            <p className="tabular-nums">
              <span className="text-lg font-semibold">{headline}</span>{" "}
              <span className="text-muted">{subtitle}</span>
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
        {children}
        <p className="text-xs text-muted">Methodology {methodologyVersion}</p>
      </div>
    </dialog>
  );
}

export function Section({
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

export function WarningList({ warnings }: { warnings: MetricWarning[] }) {
  return (
    <Section title="Warnings">
      {warnings.length === 0 ? (
        <p className="text-muted">None</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {warnings.map((w) => (
            <li
              key={w.code + w.message}
              className={w.severity === "caution" ? "bg-warn-bg px-2 py-1" : ""}
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
  );
}
