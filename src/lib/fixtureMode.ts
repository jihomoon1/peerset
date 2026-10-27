// Fixture mode (M3): PEERSET_SEC_FIXTURES=1 makes the server answer SEC requests from
// the frozen fixtures under tests/fixtures/sec, so the e2e suite never calls live SEC.
// It is refused in production: at startup (instrumentation.ts) and again wherever the
// server builds its SEC client (defaultDeps).

type Env = Record<string, string | undefined>;

// The analysis date the goldens use. Pinned so the stale-filer rule (200 days) and the
// price-date checks don't drift as the frozen filings age.
export const FIXTURE_AS_OF = "2026-10-26";

export function assertFixtureModeAllowed(env: Env = process.env): void {
  if (env.PEERSET_SEC_FIXTURES === "1" && env.VERCEL_ENV === "production")
    throw new Error(
      "PEERSET_SEC_FIXTURES=1 is not allowed in production; remove it from the environment",
    );
}

export function fixtureModeOn(env: Env = process.env): boolean {
  assertFixtureModeAllowed(env);
  return env.PEERSET_SEC_FIXTURES === "1";
}
