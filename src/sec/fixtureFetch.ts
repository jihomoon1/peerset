// Serves frozen SEC fixtures through a fake fetch. Used by the tests and by fixture
// mode (src/lib/fixtureMode.ts); never by production, which refuses fixture mode and
// doesn't ship tests/fixtures.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export const FIXTURE_ROOT = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "sec",
);

export function fixtureText(
  dir: string,
  file: string,
  root = FIXTURE_ROOT,
): string {
  return gunzipSync(readFileSync(path.join(root, dir, file))).toString("utf8");
}

interface Manifest {
  files: { url: string; file: string }[];
}

const AS_OF_SHAPE = /^\d{4}Q[1-4]$/;

// _shared plus exactly one saved filing per ticker: the newest as-of (2026Q3 beats
// 2026Q2), or the one pinned with PEERSET_FIXTURE_ASOF="LII:2026Q2,WSO:2026Q2".
// Two filings of one ticker never mix (M4a). Names it can't order are an error.
export function allFixtureDirs(
  options: { root?: string; pins?: string } = {},
): string[] {
  const root = options.root ?? FIXTURE_ROOT;
  const pins = parsePins(options.pins ?? process.env.PEERSET_FIXTURE_ASOF);
  const dirs = ["_shared"];
  for (const ticker of visible(root)) {
    if (ticker === "_shared") continue;
    const asOfs = visible(path.join(root, ticker));
    for (const asOf of asOfs)
      if (!AS_OF_SHAPE.test(asOf))
        throw new Error(
          `fixture ${ticker}/${asOf}: as-of must look like 2026Q2, so the newest can be picked`,
        );
    const pinned = pins.get(ticker);
    if (pinned !== undefined && !asOfs.includes(pinned))
      throw new Error(
        `PEERSET_FIXTURE_ASOF names ${ticker}:${pinned}, which isn't saved`,
      );
    const chosen = pinned ?? asOfs.at(-1);
    if (chosen) dirs.push(`${ticker}/${chosen}`);
  }
  return dirs;
}

// Directory names in order, without hidden files such as macOS's .DS_Store.
function visible(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .sort();
}

function parsePins(raw: string | undefined): Map<string, string> {
  const pins = new Map<string, string>();
  for (const part of (raw ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [ticker, asOf, extra] = part.split(":");
    if (!ticker || !asOf || extra !== undefined)
      throw new Error(
        `PEERSET_FIXTURE_ASOF: expected TICKER:AS_OF, got "${part}"`,
      );
    pins.set(ticker.toUpperCase(), asOf);
  }
  return pins;
}

// A fetch that answers each URL listed in the given fixture manifests and 404s the
// rest. Two directories listing the same URL is an error, never a silent overwrite.
export function fixtureFetch(dirs: string[], root = FIXTURE_ROOT) {
  const byUrl = new Map<string, { dir: string; file: string }>();
  for (const dir of dirs) {
    const manifest = JSON.parse(
      readFileSync(path.join(root, dir, "manifest.json"), "utf8"),
    ) as Manifest;
    for (const f of manifest.files) {
      const prior = byUrl.get(f.url);
      if (prior)
        throw new Error(
          `fixtures ${prior.dir} and ${dir} both answer ${f.url}; use one saved filing per ticker`,
        );
      byUrl.set(f.url, { dir, file: f.file });
    }
  }
  const requested: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    const hit = byUrl.get(url);
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(fixtureText(hit.dir, hit.file, root), { status: 200 });
  }) as typeof fetch;
  return { fetch: fetchFn, requested };
}
