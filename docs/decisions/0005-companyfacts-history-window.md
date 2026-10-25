# 0005 — companyfacts history window: two years

Date: October 24, 2026 · Status: decided in M1a (adapter retention, not a methodology change)

## Problem

Blueprint §14 targets a trimmed companyfacts result under 200 KB so it fits the cache comfortably. Filtering LII's 4.3 MB companyfacts to whitelisted concepts, periodic forms and accepted units still left 2,624 facts (1,054,690 bytes serialized), because companyfacts keeps every comparative ever filed, back to 2009.

## Decision

`src/sec/companyFacts.ts` drops facts whose period **ends** more than 730 days before the newest us-gaap period end in that company's companyfacts (`FACT_HISTORY_DAYS`).

- LII: 290 facts, 116,215 bytes. WSO: about 98 KB.
- The window applies to periods, never to filings, so the latest-filed rule (methodology §1) still sees every filing that reported a kept period, restatements included.
- Periodic accessions for the freshness check are collected **before** the window.

## Why two years is enough

LTM after a 10-Q needs the prior fiscal year (ends at most about 9 months before the LTM end) and the prior-year YTD (ends 1 year before). Even when companyfacts is a quarter behind and the LTM end comes from the parsed filing, the oldest needed period end is about 15 months before the newest companyfacts period end, well within 24 months. The EPS split check compares two values of the same prior-YTD period, also inside the window.

## Not chosen

- Compact serialization (a filings table plus facts that reference it) would shrink the cache entry by about half but changes nothing about the data; it can be added with caching in M1b if needed.
- A methodology constant: this is adapter retention and changes no financial definition, so it stays out of `policy.ts` and `methodology.md`.
