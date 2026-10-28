// Reads frozen SEC fixtures and serves them through a fake fetch, so tests never
// call live SEC (CLAUDE.md). The loader lives in src/sec/fixtureFetch.ts, shared with
// the server's fixture mode.

import { fixtureFetch, fixtureText } from "@/sec/fixtureFetch";

export { fixtureFetch, fixtureText };

export function fixtureJson(dir: string, file: string): unknown {
  return JSON.parse(fixtureText(dir, file));
}
