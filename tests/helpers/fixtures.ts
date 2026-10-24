// Reads frozen SEC fixtures and serves them through a fake fetch, so tests never
// call live SEC (CLAUDE.md).

import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const ROOT = path.join(import.meta.dirname, "..", "fixtures", "sec");

export function fixtureText(dir: string, file: string): string {
  return gunzipSync(readFileSync(path.join(ROOT, dir, file))).toString("utf8");
}

export function fixtureJson(dir: string, file: string): unknown {
  return JSON.parse(fixtureText(dir, file));
}

interface Manifest {
  files: { url: string; file: string }[];
}

// A fetch that answers each URL listed in the given fixture manifests and 404s the rest.
export function fixtureFetch(dirs: string[]) {
  const byUrl = new Map<string, { dir: string; file: string }>();
  for (const dir of dirs) {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, dir, "manifest.json"), "utf8"),
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
