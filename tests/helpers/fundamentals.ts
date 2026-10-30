// Runs the full SEC adapter → domain path offline on a frozen fixture.

import { buildFundamentals } from "@/domain/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { fixtureFetch } from "./fixtures";

export const FIXTURES = {
  LII: { fixture: "LII/2026Q2", cik: "0001069202", asOf: "2026-10-26" },
  WSO: { fixture: "WSO/2026Q2", cik: "0000105016", asOf: "2026-10-26" },
  AAON: { fixture: "AAON/2026Q2", cik: "0000824142", asOf: "2026-10-26" },
  CARR: { fixture: "CARR/2026Q2", cik: "0001783180", asOf: "2026-10-26" },
  GGG: { fixture: "GGG/2026Q3", cik: "0000042888", asOf: "2026-10-26" },
  TT: { fixture: "TT/2026Q2", cik: "0001466258", asOf: "2026-10-26" },
  JCI: { fixture: "JCI/2026Q2", cik: "0000833444", asOf: "2026-10-26" },
} as const;

export async function fixtureFundamentals(ticker: keyof typeof FIXTURES) {
  const { fixture, cik, asOf } = FIXTURES[ticker];
  const client = createSecClient({
    fetch: fixtureFetch([fixture]).fetch,
    env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
    logger: () => {},
    limiter: createLimiter(0),
  });
  return buildFundamentals(await getCompanyFacts(cik, { asOf, client }));
}
