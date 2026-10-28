import { describe, expect, it, vi } from "vitest";

// A stand-in for Next's unstable_cache that keys entries the way Next 16.4 does:
// the callback's source text plus the key parts (next/dist/server/web/spec-extension/
// unstable-cache.js, `fixedKey`). The page and the API route are bundled separately,
// so the same callback is minified into different source text in each.
const store = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache:
    (cb: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      const key = `${cb.toString()}-${keyParts.join(",")}`;
      if (!store.has(key)) store.set(key, await cb());
      return store.get(key);
    },
}));

const { nextCache } = await import("@/lib/cache");

describe("nextCache", () => {
  it("shares one entry between callers whose callbacks differ only in source text", async () => {
    store.clear();
    let runs = 0;
    // Same work, written two ways, like the page's and the route's minified bundles.
    const fromPage = async () => {
      runs++;
      return { revenue: 1 };
    };
    const fromRoute = async () => {
      const n = 1;
      runs += n;
      return { revenue: n };
    };
    const key = ["fundamentals", "0001069202", "acc", "0.3.2"];

    await nextCache(key, 60, fromPage);
    const second = await nextCache(key, 60, fromRoute);

    expect(runs).toBe(1);
    expect(second).toEqual({ revenue: 1 });
    expect(store.size).toBe(1);
  });

  it("keeps different key parts apart", async () => {
    store.clear();
    await nextCache(["a"], 60, async () => 1);
    expect(await nextCache(["b"], 60, async () => 2)).toBe(2);
  });
});
