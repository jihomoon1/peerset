// Runs once when a server instance starts. Refuses fixture mode in production
// (M3): logs the reason and exits, so a misconfigured deployment can't serve
// frozen data. Throwing alone isn't enough: Next logs it and keeps serving 500s.

import { assertFixtureModeAllowed } from "@/lib/fixtureMode";

export function register() {
  try {
    assertFixtureModeAllowed(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
    throw err;
  }
}
