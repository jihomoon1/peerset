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

export function fixtureText(dir: string, file: string): string {
  return gunzipSync(readFileSync(path.join(FIXTURE_ROOT, dir, file))).toString(
    "utf8",
  );
}

interface Manifest {
  files: { url: string; file: string }[];
}

// Every fixture directory (ticker/as-of) plus _shared.
export function allFixtureDirs(): string[] {
  const dirs = ["_shared"];
  for (const ticker of readdirSync(FIXTURE_ROOT)) {
    if (ticker === "_shared") continue;
    for (const asOf of readdirSync(path.join(FIXTURE_ROOT, ticker)))
      dirs.push(`${ticker}/${asOf}`);
  }
  return dirs;
}

// A fetch that answers each URL listed in the given fixture manifests and 404s the rest.
export function fixtureFetch(dirs: string[]) {
  const byUrl = new Map<string, { dir: string; file: string }>();
  for (const dir of dirs) {
    const manifest = JSON.parse(
      readFileSync(path.join(FIXTURE_ROOT, dir, "manifest.json"), "utf8"),
    ) as Manifest;
    for (const f of manifest.files) byUrl.set(f.url, { dir, file: f.file });
  }
  const requested: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    const hit = byUrl.get(url);
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(fixtureText(hit.dir, hit.file), { status: 200 });
  }) as typeof fetch;
  return { fetch: fetchFn, requested };
}
