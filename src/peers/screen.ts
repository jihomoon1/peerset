// Peer screening (blueprint §10.2) over the committed peer index: SIC tier, eligibility,
// size, rank, select, explain. Pure: the analysis date is injected and nothing is
// fetched, so a whole screen runs without a single SEC or price call.

import { daysBetween } from "@/domain/dates";
import {
  EXCLUDED_SIC_RANGE,
  PEER_REVENUE_SCREEN,
  PEERS,
  PERIODIC_FORMS,
  STALE_FILER_DAYS,
} from "@/domain/policy";
import type { ExclusionCode, PeerSelectionResult } from "@/domain/types";
import { formatRatioX } from "@/lib/format";
import {
  InvalidInputError,
  TickerNotFoundError,
  UnsupportedIssuerError,
} from "@/lib/errors";
import { FOREIGN_FORMS, TRANSITION_FORMS } from "@/sec/submissions";
import type { PeerIndex, PeerIndexCompany } from "./indexTypes";

type Tier = PeerSelectionResult["tier"];
type Exclusion = { code: ExclusionCode; detail: string };

const TIERS: { tier: Tier; digits: number }[] = [
  { tier: "sic4", digits: 4 },
  { tier: "sic3", digits: 3 },
  { tier: "sic2", digits: 2 },
];

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

// Plain code-point order, so ranking never depends on the server's locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Blueprint §10.2 step 2, apart from "not the target" and the size band: why this
// company can't be a peer on the analysis date, or null when it can.
export function exclusionFor(
  c: PeerIndexCompany,
  analysisDate: string,
): Exclusion | null {
  const latest = c.latest;
  if (!latest)
    return {
      code: "NO_PERIODIC_FILING",
      detail: "no 10-K or 10-Q in SEC's recent filings",
    };
  if (c.files20F || FOREIGN_FORMS.has(latest.form))
    return {
      code: "FOREIGN_FILER",
      detail: `latest annual report is a ${latest.form}`,
    };
  if (TRANSITION_FORMS.has(latest.form) || !PERIODIC_FORMS.has(latest.form))
    return {
      code: "TRANSITION_PERIOD",
      detail: `latest report is a ${latest.form}`,
    };
  const sic = Number(c.sic);
  if (sic >= EXCLUDED_SIC_RANGE.min && sic <= EXCLUDED_SIC_RANGE.max)
    return {
      code: "FINANCIAL_SIC",
      detail: `SIC ${c.sic} is in the financial range ${EXCLUDED_SIC_RANGE.min}–${EXCLUDED_SIC_RANGE.max}`,
    };
  const age = daysBetween(latest.filedDate, analysisDate);
  if (age > STALE_FILER_DAYS)
    return {
      code: "STALE_FILING",
      detail: `latest ${latest.form} filed ${latest.filedDate}, ${age} days before ${analysisDate}`,
    };
  if (!c.revenue)
    return {
      code: "NO_SCREENING_REVENUE",
      detail: c.revenueNote ?? "no screening revenue",
    };
  return null;
}

// The target by any of its listed tickers. Unknown → 404; listed off the major
// exchanges, ineligible or without screening revenue → unsupported (422).
export function findTarget(
  index: PeerIndex,
  ticker: string,
  analysisDate: string,
): PeerIndexCompany {
  const t = ticker.toUpperCase();
  const company = index.companies.find((c) =>
    c.listings.some((l) => l.ticker === t),
  );
  if (!company) {
    const off = index.unlisted.find((l) => l.ticker === t);
    if (off)
      throw new UnsupportedIssuerError(
        `${t} isn't listed on a major exchange (${off.exchange || "no exchange"}); peers are screened from NYSE, Nasdaq and Cboe listings`,
        `target off-exchange: ${off.exchange || "blank"}`,
      );
    throw new TickerNotFoundError(t, "not in the peer index");
  }
  if (!/^\d{4}$/.test(company.sic))
    throw new UnsupportedIssuerError(
      `${t} has no SIC code in SEC's records, so peers can't be screened`,
      "target without SIC",
    );
  const why = exclusionFor(company, analysisDate);
  if (why)
    throw new UnsupportedIssuerError(
      why.code === "NO_SCREENING_REVENUE"
        ? `${t} has no screening revenue: ${why.detail}`
        : `${t} can't be screened for peers: ${why.detail}`,
      `target ${why.code}`,
    );
  return company;
}

interface Candidate {
  company: PeerIndexCompany;
  ratio: number;
  distance: number; // |ln(peer ÷ target)|
}

// Blueprint §10.2. `count` is how many peers to keep: 8 by default, 5 to 12.
export function screenPeers(
  index: PeerIndex,
  target: PeerIndexCompany,
  options: { analysisDate: string; count?: number },
): PeerSelectionResult {
  const count = options.count ?? PEERS.default;
  if (!Number.isInteger(count) || count < PEERS.min || count > PEERS.max)
    throw new InvalidInputError(
      `Keep between ${PEERS.min} and ${PEERS.max} peers`,
      `peer count ${count}`,
    );
  const targetRevenue = target.revenue?.value;
  if (targetRevenue === undefined || targetRevenue <= 0)
    throw new UnsupportedIssuerError(
      `${target.ticker} has no positive screening revenue to size peers against`,
      "target revenue missing or not positive",
    );

  // Steps 1–3 per tier. "Fewer than 5 eligible" counts companies that pass both the
  // eligibility rules and the size band, i.e. that could be selected: widening exists
  // to reach the 5-peer minimum (M4a decision, recorded in the report).
  let tier: Tier = "sic2";
  let inTier: PeerIndexCompany[] = [];
  let qualified: Candidate[] = [];
  let excluded: PeerSelectionResult["excluded"] = [];
  for (const t of TIERS) {
    const prefix = target.sic.slice(0, t.digits);
    inTier = index.companies.filter(
      (c) => c.cik !== target.cik && c.sic.slice(0, t.digits) === prefix,
    );
    qualified = [];
    excluded = [];
    for (const company of inTier) {
      const why = exclusionFor(company, options.analysisDate);
      if (why) {
        excluded.push({ cik: company.cik, ticker: company.ticker, ...why });
        continue;
      }
      const ratio = company.revenue!.value / targetRevenue;
      if (ratio < PEER_REVENUE_SCREEN.min || ratio > PEER_REVENUE_SCREEN.max) {
        excluded.push({
          cik: company.cik,
          ticker: company.ticker,
          code: "OUTSIDE_SIZE_RANGE",
          detail: `revenue ${formatRatioX(ratio)} the target's (allowed ${PEER_REVENUE_SCREEN.min}x–${PEER_REVENUE_SCREEN.max}x)`,
        });
        continue;
      }
      qualified.push({ company, ratio, distance: Math.abs(Math.log(ratio)) });
    }
    tier = t.tier;
    if (qualified.length >= PEERS.min) break;
  }

  // Steps 4–5: closest scale first, ties by ticker A–Z.
  qualified.sort(
    (a, b) =>
      a.distance - b.distance || byText(a.company.ticker, b.company.ticker),
  );
  const kept = qualified.slice(0, count);
  qualified.slice(count).forEach((q, i) =>
    excluded.push({
      cik: q.company.cik,
      ticker: q.company.ticker,
      code: "NOT_IN_TOP_N",
      detail: `ranked ${count + i + 1} of ${qualified.length} by closeness of revenue; ${count} kept`,
    }),
  );

  excluded.sort((a, b) => byText(a.code, b.code) || byText(a.ticker, b.ticker));
  return {
    tier,
    selected: kept.map((q) => ({
      cik: q.company.cik,
      ticker: q.company.ticker,
      reason: reasonFor(q, target, tier),
    })),
    excluded,
    indexGeneratedAt: index.meta.generatedAt,
  };
}

// "SIC 3585 exact · revenue 0.6x · Dec FYE · 10-Q filed 2026-07-29" (blueprint §10.2).
function reasonFor(q: Candidate, target: PeerIndexCompany, tier: Tier): string {
  const c = q.company;
  const sic =
    tier === "sic4"
      ? `SIC ${c.sic} exact`
      : tier === "sic3"
        ? `SIC ${c.sic} · 3-digit group ${target.sic.slice(0, 3)}`
        : `SIC ${c.sic} · 2-digit group ${target.sic.slice(0, 2)}`;
  const month = MONTHS[Number(c.fiscalYearEnd.slice(0, 2)) - 1];
  const fye = month ? `${month} FYE` : "FYE not reported";
  const latest = c.latest!;
  return `${sic} · revenue ${formatRatioX(q.ratio)} · ${fye} · ${latest.form} filed ${latest.filedDate}`;
}
