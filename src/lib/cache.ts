// The one place server code reaches Next's persistent cache (blueprint §14, decision
// 0001: Cache Components off, so unstable_cache persists across requests and
// deploys). Injected, so tests and scripts run without Next.

import { unstable_cache } from "next/cache";

// Runs fn once per key and revalidate window, returning the cached JSON afterwards.
export type CacheFn = <T>(
  key: string[],
  revalidateSeconds: number,
  fn: () => Promise<T>,
) => Promise<T>;

export const nextCache: CacheFn = (key, revalidateSeconds, fn) =>
  unstable_cache(fn, key, { revalidate: revalidateSeconds })();
