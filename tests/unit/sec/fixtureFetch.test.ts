import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  allFixtureDirs,
  fixtureFaults,
  fixtureFetch,
} from "@/sec/fixtureFetch";

// A throwaway fixture root: each dir gets a manifest listing the given URLs.
function makeRoot(dirs: Record<string, string[]>): string {
  const root = mkdtempSync(path.join(tmpdir(), "peerset-fixtures-"));
  for (const [dir, urls] of Object.entries(dirs)) {
    mkdirSync(path.join(root, dir), { recursive: true });
    const files = urls.map((url, i) => ({ url, file: `f${i}.json.gz` }));
    files.forEach((f, i) =>
      writeFileSync(
        path.join(root, dir, f.file),
        gzipSync(`{"dir":"${dir}","i":${i}}`),
      ),
    );
    writeFileSync(
      path.join(root, dir, "manifest.json"),
      JSON.stringify({ files }),
    );
  }
  return root;
}

const SUBS = "https://data.sec.gov/submissions/CIK0001069202.json";

describe("allFixtureDirs", () => {
  it("picks the newest saved filing per ticker", () => {
    const root = makeRoot({
      _shared: [],
      "LII/2026Q2": [SUBS],
      "LII/2026Q3": [SUBS],
      "WSO/2026Q2": [],
    });
    expect(allFixtureDirs({ root })).toEqual([
      "_shared",
      "LII/2026Q3",
      "WSO/2026Q2",
    ]);
  });

  it("uses a filing named explicitly", () => {
    const root = makeRoot({ "LII/2026Q2": [], "LII/2026Q3": [] });
    expect(allFixtureDirs({ root, pins: "LII:2026Q2" })).toEqual([
      "_shared",
      "LII/2026Q2",
    ]);
  });

  it("fails when a named filing doesn't exist", () => {
    const root = makeRoot({ "LII/2026Q2": [] });
    expect(() => allFixtureDirs({ root, pins: "LII:2025Q4" })).toThrow(
      /LII:2025Q4/,
    );
  });

  it("fails on an as-of name it can't order", () => {
    const root = makeRoot({ "LII/2026Q2": [], "LII/latest": [] });
    expect(() => allFixtureDirs({ root })).toThrow(/LII\/latest/);
  });
});

describe("fixtureFetch", () => {
  it("fails when two saved filings answer the same URL", () => {
    const root = makeRoot({ "LII/2026Q2": [SUBS], "LII/2026Q3": [SUBS] });
    expect(() => fixtureFetch(["LII/2026Q2", "LII/2026Q3"], root)).toThrow(
      /LII\/2026Q2.*LII\/2026Q3/,
    );
  });

  it("serves each URL from its one directory", async () => {
    const root = makeRoot({ "LII/2026Q3": [SUBS] });
    const res = await fixtureFetch(["LII/2026Q3"], root).fetch(SUBS);
    expect(await res.json()).toEqual({ dir: "LII/2026Q3", i: 0 });
  });
});

// M6: a test-only fault switch for the "rate-limited" UX state. Fixture mode only;
// fixture mode itself is refused in production (src/lib/fixtureMode.ts).
describe("fixture faults (PEERSET_FIXTURE_FAULTS)", () => {
  const GM_SUBS = "https://data.sec.gov/submissions/CIK0001467858.json";
  const GM_FACTS =
    "https://data.sec.gov/api/xbrl/companyfacts/CIK0001467858.json";

  function rootWithTickers() {
    const root = makeRoot({ "LII/2026Q3": [SUBS] });
    mkdirSync(path.join(root, "_shared"), { recursive: true });
    writeFileSync(
      path.join(root, "_shared", "company_tickers_exchange.json.gz"),
      gzipSync(
        JSON.stringify({
          fields: ["cik", "name", "ticker", "exchange"],
          data: [[1467858, "General Motors Co", "GM", "NYSE"]],
        }),
      ),
    );
    return root;
  }

  it("answers every SEC URL for the faulted ticker's CIK with that status", async () => {
    const root = rootWithTickers();
    const faults = fixtureFaults("GM:429", root);
    const { fetch } = fixtureFetch(["LII/2026Q3"], root, { faults });
    expect((await fetch(GM_SUBS)).status).toBe(429);
    expect((await fetch(GM_FACTS)).status).toBe(429);
    // Other companies are untouched.
    expect((await fetch(SUBS)).status).toBe(200);
  });

  it("is off when the variable is empty", () => {
    expect(fixtureFaults(undefined, rootWithTickers())).toEqual([]);
  });

  it("refuses a malformed entry or a ticker SEC doesn't list", () => {
    const root = rootWithTickers();
    expect(() => fixtureFaults("GM", root)).toThrow(/TICKER:STATUS/);
    expect(() => fixtureFaults("ZZZZ:429", root)).toThrow(/ZZZZ/);
  });
});
