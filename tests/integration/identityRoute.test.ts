import { describe, expect, it } from "vitest";
import { createIdentityHandler } from "@/app/api/identity/handler";
import type { LoadDeps } from "@/lib/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { fixtureFetch } from "../helpers/fixtures";

// GET /api/identity?ticker= (M6, blueprint §6 "Valid, not analyzed"): the home search's
// identity card. It reads only the ticker list and submissions, never a filing.

const UA = "PeerSet-Test leak-canary@example.invalid";

function deps(fixture: string, fetchOverride?: typeof fetch) {
  const fake = fixtureFetch(["_shared", fixture]);
  const d: LoadDeps = {
    client: createSecClient({
      fetch: fetchOverride ?? fake.fetch,
      env: { SEC_USER_AGENT: UA },
      logger: () => {},
      limiter: createLimiter(0),
    }),
    cache: (_key, _revalidate, fn) => fn(),
    asOf: "2026-10-26",
    logger: () => {},
  };
  return { d, requested: fake.requested };
}

const get = (d: LoadDeps, ticker: string) =>
  createIdentityHandler(
    () => d,
    () => {},
  )(new Request(`http://localhost/api/identity?ticker=${ticker}`));

describe("GET /api/identity", () => {
  it("returns the identity card for a supported company, from two SEC requests at most", async () => {
    const { d, requested } = deps("LII/2026Q2");
    const res = await get(d, "lii");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ticker: "LII",
      cik: "0001069202",
      name: expect.stringMatching(/LENNOX/i),
      exchange: "NYSE",
      sic: "3585",
      latestPeriodic: { form: "10-Q", reportDate: "2026-06-30" },
      support: { supported: true },
    });
    expect(requested).toHaveLength(2); // ticker list + submissions
    expect(JSON.stringify(body)).not.toContain("leak-canary");
  });

  it("an unknown ticker is a 404 with the blueprint §6 wording", async () => {
    const { d } = deps("LII/2026Q2");
    const res = await get(d, "ZZZZZ");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      code: "TICKER_NOT_FOUND",
      message: "No SEC-registered company uses ZZZZZ",
    });
  });

  it("a 20-F filer comes back unsupported, with the reason, not an error", async () => {
    const { d } = deps("TM/2026Q1");
    const res = await get(d, "TM");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ticker: "TM",
      support: {
        supported: false,
        reason: {
          message:
            "Files 20-F annual reports; only 10-K and 10-Q filers are supported",
        },
      },
    });
  });

  it("SEC rate-limiting is a 429 with Retry-After", async () => {
    const { d } = deps(
      "LII/2026Q2",
      (async () => new Response("slow down", { status: 429 })) as typeof fetch,
    );
    const res = await get(d, "LII");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect((await res.json()).code).toBe("SEC_RATE_LIMITED");
  });
});
