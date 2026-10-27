import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8">
      <h1 className="text-base font-semibold">Page not found</h1>
      <p className="text-sm">There&apos;s nothing at this address.</p>
      <p className="text-sm">
        <Link href="/" className="text-accent underline">
          Go to the home page
        </Link>{" "}
        to search for a ticker.
      </p>
    </main>
  );
}
