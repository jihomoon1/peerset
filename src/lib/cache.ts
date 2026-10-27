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

// Process-memory cache for fixture mode (M3): keeps e2e renders fast without
// touching the persistent cache that holds live SEC data. Ignores revalidation.
export function memoryCache(): CacheFn {
  const entries = new Map<string, Promise<unknown>>();
  return <T>(
    key: string[],
    _revalidateSeconds: number,
    fn: () => Promise<T>,
  ) => {
    const k = JSON.stringify(key);
    if (!entries.has(k)) entries.set(k, fn());
    return entries.get(k) as Promise<T>;
  };
}
