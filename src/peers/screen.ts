// Peer screening (blueprint §10.2) over the committed peer index: SIC tier, eligibility,
// size, rank, select, explain. Pure: the analysis date is injected and nothing is
// fetched, so a whole screen runs without a single SEC or price call.

import { addMonths, daysBetween } from "@/domain/dates";
import { inFinancialSicRange } from "@/domain/issuerKind";
import {
  EXCLUDED_SIC_RANGE,
  PEER_ASSETS_SCREEN,
  PEER_REVENUE_SCREEN,
  PEERS,
  PERIODIC_FORMS,
  SCREENING_REVENUE_MAX_AGE_MONTHS,
  STALE_FILER_DAYS,
} from "@/domain/policy";
import type {
  ExclusionCode,
  IssuerKind,
  PeerSelectionResult,
  ScreeningFunnelStep,
} from "@/domain/types";
import { formatBandRatio } from "@/lib/format";
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

const KIND_NAME: Record<IssuerKind, string> = {
  operating: "an operating company",
  bank: "a bank",
  digitalAsset: "a digital-asset company",
};

// Banks are sized by total assets, everyone else by screening revenue (§13E).
const sizeOf = (kind: IssuerKind, c: PeerIndexCompany) =>
  kind === "bank" ? c.totalAssets?.value : c.revenue?.value;

// Blueprint §10.2 step 2, apart from "not the target" and the size band: why this
// company can't be a peer of a `targetKind` target on the analysis date, or null when
// it can. Methodology §13E (0.5.0): each kind screens only its own kind.
export function exclusionFor(
  c: PeerIndexCompany,
  analysisDate: string,
  targetKind: IssuerKind = "operating",
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
  if (targetKind === "operating" ? inFinancialSicRange(c.sic) : c.kind === null)
    return {
      code: "FINANCIAL_SIC",
      detail:
        targetKind === "operating"
          ? `SIC ${c.sic} is in the financial range ${EXCLUDED_SIC_RANGE.min}–${EXCLUDED_SIC_RANGE.max}`
          : `SIC ${c.sic}: neither a bank nor a digital-asset company`,
    };
  if (c.kind !== targetKind)
    return {
      code: "OTHER_KIND",
      detail: `${KIND_NAME[c.kind ?? "operating"]}, not ${KIND_NAME[targetKind]}`,
    };
  const age = daysBetween(latest.filedDate, analysisDate);
  if (age > STALE_FILER_DAYS)
    return {
      code: "STALE_FILING",
      detail: `latest ${latest.form} filed ${latest.filedDate}, ${age} days before ${analysisDate}`,
    };
  if (targetKind === "bank")
    return c.totalAssets
      ? null
      : {
          code: "NO_TOTAL_ASSETS",
          detail: `no total assets (us-gaap:Assets) at the latest report date (${latest.reportDate})`,
        };
  if (!c.revenue)
    return {
      code: "NO_SCREENING_REVENUE",
      detail: c.revenueNote ?? "no screening revenue",
    };
  // Methodology §13A: sizing on a year long before the latest report would mislead.
  const limit = addMonths(latest.reportDate, -SCREENING_REVENUE_MAX_AGE_MONTHS);
  if (c.revenue.periodEnd < limit)
    return {
      code: "NO_SCREENING_REVENUE",
      detail: `screening revenue is for the fiscal year ended ${c.revenue.periodEnd}, more than ${SCREENING_REVENUE_MAX_AGE_MONTHS} months before the latest report (${latest.reportDate})`,
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
  if (company.kind === null)
    throw new UnsupportedIssuerError(
      index.kindsRecorded
        ? `${t} is a financial company (SIC ${company.sic}) that is neither a bank nor a digital-asset company, so peers can't be screened`
        : `${t} is a financial company (SIC ${company.sic}); the peer index predates bank and digital-asset screening and must be rebuilt`,
      `target FINANCIAL_SIC${index.kindsRecorded ? "" : " (index format 1)"}`,
    );
  const why = exclusionFor(company, analysisDate, company.kind);
  if (why)
    throw new UnsupportedIssuerError(
      why.code === "NO_SCREENING_REVENUE"
        ? `${t} has no screening revenue: ${why.detail}`
        : why.code === "NO_TOTAL_ASSETS"
          ? `${t} has ${why.detail}`
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
  const kind = target.kind ?? "operating";
  const band = kind === "bank" ? PEER_ASSETS_SCREEN : PEER_REVENUE_SCREEN;
  const sizeName = kind === "bank" ? "total assets" : "revenue";
  const targetSize = sizeOf(kind, target);
  if (targetSize === undefined || targetSize <= 0)
    throw new UnsupportedIssuerError(
      kind === "bank"
        ? `${target.ticker} has no positive total assets to size peers against`
        : `${target.ticker} has no positive screening revenue to size peers against`,
      `target ${sizeName} missing or not positive`,
    );

  // Steps 1–3 per tier. "Fewer than 5 eligible" counts companies that pass both the
  // eligibility rules and the size band, i.e. that could be selected: widening exists
  // to reach the 5-peer minimum (M4a decision, recorded in the report).
  let tier: Tier = "sic2";
  let inTier: PeerIndexCompany[] = [];
  let qualified: Candidate[] = [];
  let excluded: PeerSelectionResult["excluded"] = [];
  const funnel: ScreeningFunnelStep[] = [];
  for (const t of TIERS) {
    const prefix = target.sic.slice(0, t.digits);
    inTier = index.companies.filter(
      (c) => c.cik !== target.cik && c.sic.slice(0, t.digits) === prefix,
    );
    qualified = [];
    excluded = [];
    for (const company of inTier) {
      const why = exclusionFor(company, options.analysisDate, kind);
      if (why) {
        excluded.push({ cik: company.cik, ticker: company.ticker, ...why });
        continue;
      }
      const ratio = sizeOf(kind, company)! / targetSize;
      if (ratio < band.min || ratio > band.max) {
        excluded.push({
          cik: company.cik,
          ticker: company.ticker,
          code: "OUTSIDE_SIZE_RANGE",
          detail: `${sizeName} ${formatBandRatio(ratio)} the target's (allowed ${band.min}x–${band.max}x)`,
        });
        continue;
      }
      qualified.push({ company, ratio, distance: Math.abs(Math.log(ratio)) });
    }
    tier = t.tier;
    const dropped: ScreeningFunnelStep["dropped"] = {};
    for (const e of excluded) dropped[e.code] = (dropped[e.code] ?? 0) + 1;
    funnel.push({
      tier: t.tier,
      group: prefix,
      companies: inTier.length,
      dropped,
      qualified: qualified.length,
    });
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
      detail: `ranked ${count + i + 1} of ${qualified.length} by closeness of ${sizeName}; ${count} kept`,
    }),
  );

  excluded.sort((a, b) => byText(a.code, b.code) || byText(a.ticker, b.ticker));
  return {
    tier,
    funnel,
    selected: kept.map((q) => ({
      cik: q.company.cik,
      ticker: q.company.ticker,
      reason: reasonFor(q, target, tier, sizeName),
      latest: {
        form: q.company.latest!.form,
        filedDate: q.company.latest!.filedDate,
      },
    })),
    excluded,
    indexGeneratedAt: index.meta.generatedAt,
  };
}

// "SIC 3585 exact · revenue 0.6x · Dec FYE · 10-Q filed 2026-07-29" (blueprint §10.2);
// banks say "total assets 0.6x" (§13E).
function reasonFor(
  q: Candidate,
  target: PeerIndexCompany,
  tier: Tier,
  sizeName: string,
): string {
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
  return `${sic} · ${sizeName} ${formatBandRatio(q.ratio)} · ${fye} · ${latest.form} filed ${latest.filedDate}`;
}
