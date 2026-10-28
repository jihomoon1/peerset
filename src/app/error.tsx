"use client";

import Link from "next/link";

// Unexpected failures. Shows a reference for the logs, never the error message or a
// stack trace (blueprint §15).
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8">
      <section
        role="alert"
        className="max-w-xl border border-error/40 bg-error-bg px-4 py-3"
      >
        <h1 className="text-base font-semibold text-error">
          Something went wrong
        </h1>
        <p className="mt-1 text-sm">
          PeerSet couldn&apos;t show this page. Try again, or start over from
          the home page.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-muted">Reference {error.digest}</p>
        )}
      </section>
      <p className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={reset}
          className="text-accent underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Try again
        </button>
        <Link href="/" className="text-accent underline">
          Home page
        </Link>
      </p>
    </main>
  );
}
