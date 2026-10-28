import { describe, expect, it } from "vitest";
import {
  assertFixtureModeAllowed,
  FIXTURE_AS_OF,
  fixtureModeOn,
} from "@/lib/fixtureMode";
import { nextCache } from "@/lib/cache";
import { defaultDeps } from "@/lib/fundamentals";

// M3: PEERSET_SEC_FIXTURES=1 serves frozen fixtures to the e2e suite. It must never
// run in production.
describe("fixture mode guard", () => {
  it.each([
    [{}, false],
    [{ PEERSET_SEC_FIXTURES: "0" }, false],
    [{ PEERSET_SEC_FIXTURES: "true" }, false], // only the exact value "1"
    [{ PEERSET_SEC_FIXTURES: "1" }, true],
    [{ PEERSET_SEC_FIXTURES: "1", VERCEL_ENV: "preview" }, true],
  ])("fixtureModeOn(%j) is %s", (env, on) => {
    expect(fixtureModeOn(env)).toBe(on);
    expect(() => assertFixtureModeAllowed(env)).not.toThrow();
  });

  it("refuses fixture mode in production", () => {
    const env = { PEERSET_SEC_FIXTURES: "1", VERCEL_ENV: "production" };
    expect(() => assertFixtureModeAllowed(env)).toThrow(/production/);
    expect(() => fixtureModeOn(env)).toThrow(/production/);
  });

  it("allows production without fixture mode", () => {
    expect(fixtureModeOn({ VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("defaultDeps in fixture mode", () => {
  it("pins the analysis date and never reads SEC_USER_AGENT", async () => {
    const deps = defaultDeps({ PEERSET_SEC_FIXTURES: "1" });
    expect(deps.asOf).toBe(FIXTURE_AS_OF);
    // In-memory only: never Next's persistent cache, which holds live data.
    expect(deps.cache).not.toBe(nextCache);
    let calls = 0;
    const fn = async () => ++calls;
    await deps.cache(["fixture-test"], 60, fn);
    await deps.cache(["fixture-test"], 60, fn);
    expect(calls).toBe(1);
  });

  it("serves LII submissions from the fixture, with no network", async () => {
    const deps = defaultDeps({ PEERSET_SEC_FIXTURES: "1" });
    const r = await deps.client.getJson(
      "https://data.sec.gov/submissions/CIK0001069202.json",
    );
    expect(r.kind).toBe("ok");
  });

  it("throws in production with fixture mode on", () => {
    expect(() =>
      defaultDeps({ PEERSET_SEC_FIXTURES: "1", VERCEL_ENV: "production" }),
    ).toThrow(/production/);
  });

  it("needs SEC_USER_AGENT outside fixture mode", () => {
    expect(() => defaultDeps({})).toThrow();
  });
});
