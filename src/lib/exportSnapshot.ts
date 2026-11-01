// Server side of the export (blueprint §13, "server-truth export"): validates the
// request, reloads cached fundamentals for the target and its peers, reruns peer
// screening and recomputes everything with the browser's own code. Only the inputs
// come from the browser (target, added and removed peers, prices, price date), never
// a number it computed.

import { z } from "zod";
import type { CompsPeer, PeerState } from "@/domain/comps";
import { isIsoDate } from "@/domain/dates";
import { PEERS } from "@/domain/policy";
import { buildExportSnapshot, type ExportSnapshot } from "@/export/snapshot";
import { PRICE_LIMIT } from "@/prices/userEntered";
import { activePeers, NOT_A_PEER_CODES } from "@/ui/peerSet";
import { quotesFromInputs } from "@/ui/pricing";
import { errorResponseBody, InvalidInputError, PeerSetError } from "./errors";
import {
  loadFundamentals,
  normalizeTicker,
  type LoadDeps,
} from "./fundamentals";
import { selectPeers, type PeersDeps } from "./peers";
import { APP_VERSION } from "./site";
import { TICKER_PATTERN } from "./ticker";

export interface ExportDeps {
  load: LoadDeps;
  peers: PeersDeps;
  now: () => Date; // stamps generatedAt; the domain never reads the clock
  appVersion?: string;
}

// The same peer concurrency as the browser (ADR 0009). Here every load runs on one
// instance, so its limiter alone caps the SEC rate.
export const EXPORT_PEER_CONCURRENCY = 3;

const ticker = z.string().regex(TICKER_PATTERN);

export const ExportRequestSchema = z.object({
  target: z.string().min(1).max(20),
  add: z.array(ticker).max(PEERS.max).default([]),
  remove: z
    .array(ticker)
    .max(PEERS.max * 2)
    .default([]),
  // One price per listed class ticker (WSO, WSO-B), as the URL's px= encodes them.
  prices: z.record(ticker, z.number().gt(0).lt(PRICE_LIMIT)).default({}),
  priceDate: z.string().optional(),
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export function parseExportRequest(
  body: unknown,
  analysisDate: string,
): ExportRequest {
  const parsed = ExportRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new InvalidInputError(
      "The export request isn't valid: at most 12 peers, prices above 0 and below 1,000,000",
      `schema: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")
        .slice(0, 200)}`,
    );
  const req = parsed.data;
  if (Object.keys(req.prices).length > 0) {
    if (req.priceDate === undefined || !isIsoDate(req.priceDate))
      throw new InvalidInputError(
        "Price date must be a real date (YYYY-MM-DD)",
      );
    if (req.priceDate > analysisDate)
      throw new InvalidInputError(
        `Price date can't be after the analysis date (${analysisDate})`,
      );
  }
  return req;
}

// A failed load as the browser's peer loader records it: the code and user message
// of the API's error body, never the internal detail.
async function loadPeer(ticker: string, deps: LoadDeps): Promise<PeerState> {
  try {
    return {
      kind: "loaded",
      fundamentals: await loadFundamentals(ticker, deps),
    };
  } catch (err) {
    const body = errorResponseBody(err, "export");
    deps.logger("export_peer_error", {
      ticker,
      code: body.code,
      detail: err instanceof PeerSetError ? err.detail : "unclassified",
    });
    return { kind: "failed", code: body.code, message: body.message };
  }
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

export async function loadExportSnapshot(
  body: unknown,
  deps: ExportDeps,
): Promise<ExportSnapshot> {
  const analysisDate = deps.load.asOf;
  const req = parseExportRequest(body, analysisDate);
  const target = await loadFundamentals(normalizeTicker(req.target), deps.load);

  // Screening as the page does it: a failure leaves only the added peers.
  let selection: ReturnType<typeof selectPeers> | null = null;
  let selectionError: string | undefined;
  try {
    selection = selectPeers(target.identity.ticker, deps.peers);
  } catch (err) {
    selectionError = errorResponseBody(err, "export").message;
  }

  const active = activePeers({
    target: target.identity.ticker,
    suggested: (selection?.selected ?? []).map((p) => ({
      ticker: p.ticker,
      reason: p.reason,
    })),
    added: req.add,
    removed: req.remove,
  });
  const states = await mapLimited(active, EXPORT_PEER_CONCURRENCY, (p) =>
    loadPeer(p.ticker, deps.load),
  );
  // As in the workbench: an added ticker that isn't an SEC company, or can't be
  // analyzed, never enters the table.
  const peers: CompsPeer[] = active.flatMap((p, i) => {
    const state = states[i];
    return p.origin === "added" &&
      state.kind === "failed" &&
      NOT_A_PEER_CODES.has(state.code)
      ? []
      : [{ ...p, state }];
  });

  const generatedAt = deps.now().toISOString();
  const q = quotesFromInputs({
    inputs: Object.fromEntries(
      Object.entries(req.prices).map(([t, v]) => [t, String(v)]),
    ),
    priceDate: req.priceDate ?? analysisDate,
    analysisDate,
    retrievedAt: generatedAt,
    providerQuotes: [],
  });
  const bad = Object.keys(q.errors);
  if (q.dateError || bad.length > 0)
    throw new InvalidInputError(
      q.dateError ?? `Price for ${bad.join(", ")} isn't valid`,
    );

  return buildExportSnapshot({
    target,
    peers,
    quotes: q.quotes,
    analysisDate,
    generatedAt,
    appVersion: deps.appVersion ?? APP_VERSION,
    peerSelection: selection
      ? {
          tier: selection.tier,
          funnel: selection.funnel,
          selected: selection.selected,
          excluded: selection.excluded,
          indexGeneratedAt: selection.indexGeneratedAt,
        }
      : null,
    ...(selectionError ? { peerSelectionError: selectionError } : {}),
  });
}
