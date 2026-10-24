# 0001 — Caching model: Cache Components off for v1

Date: October 23, 2026 · Status: accepted (Jiho, M0 planning)

## Context

- `create-next-app` 16.4.2 enables Cache Components by default for App Router projects (`--cache-components`, "default for App Router"; Next.js docs, updated 2026-09-29). We scaffolded with `--no-cache-components`; `next.config.ts` contains no `cacheComponents` key, so it is off.
- Blueprint §14 caches trimmed SEC results with the fetch Data Cache (`force-cache`, `revalidate`) and `unstable_cache`, because those persist across deploys, while plain `'use cache'` entries are keyed by build ID and are typically lost between serverless requests.
- The `unstable_cache` docs (updated 2026-09-01) now say: "This API has been replaced by `use cache` in Next.js 16. We recommend opting into Cache Components and replacing `unstable_cache` with the `use cache` directive." It is not removed and still persists results across requests and deployments.

## Decision

Keep Cache Components **off** in v1 and implement blueprint §14 as written.

## Trade-off

Off keeps the persistent, deploy-surviving caches §14 is designed around, with no redesign of the caching layer before any finance code exists. The cost is that we build on an API Next.js now calls "replaced", so expect a migration (likely to `'use cache: remote'` or similar) when Next.js 17 makes Cache Components mandatory.

## Revisit when

Next.js 17 ships, or `unstable_cache` is deprecated with a removal date, or Vercel documents persistence for `'use cache: remote'` that matches §14's lifetimes.
