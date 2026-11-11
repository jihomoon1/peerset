// POST /api/export — the comps workbook (blueprint §13, §17). The body carries only
// inputs (target, added and removed peers, prices, price date); the server reloads
// fundamentals and recomputes everything (lib/exportSnapshot.ts). Kept apart from
// route.ts so tests can inject fixture deps.

import { buildSlideWorkbook } from "@/export/slide";
import { buildWorkbook } from "@/export/workbook";
import {
  errorResponseBody,
  httpStatusFor,
  InvalidInputError,
  PeerSetError,
  SecRateLimitedError,
} from "@/lib/errors";
import {
  loadExportSnapshot,
  parseExportOptions,
  type ExportDeps,
} from "@/lib/exportSnapshot";
import { log, type Logger } from "@/lib/log";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A 12-peer, two-class request is well under 2 KB.
const MAX_BODY_BYTES = 16 * 1024;

async function readBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES)
    throw new InvalidInputError(
      "The export request is too large",
      `body ${raw.length} chars`,
    );
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidInputError(
      "The export request isn't valid JSON",
      "body not JSON",
    );
  }
}

export function createExportHandler(
  makeDeps: () => ExportDeps,
  logger: Logger = log,
) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    try {
      const deps = makeDeps();
      const body = await readBody(request);
      // Checked before any filing is loaded, so a bad option fails fast.
      const options = parseExportOptions(body);
      const snapshot = await loadExportSnapshot(body, deps);
      const workbook =
        options.layout === "slide"
          ? buildSlideWorkbook(snapshot, options)
          : buildWorkbook(snapshot);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const ticker = snapshot.table.target.ticker;
      const kind = options.layout === "slide" ? "slide" : "comps";
      const filename = `PeerSet_${ticker}_${kind}_${snapshot.analysisDate}.xlsx`;
      logger("export", {
        requestId,
        ticker,
        layout: options.layout,
        peers: snapshot.table.counts.peers,
        failed: snapshot.table.counts.failed,
        quotes: snapshot.quotes.length,
        bytes: buffer.byteLength,
        ms: Date.now() - started,
      });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": XLSX_CONTENT_TYPE,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      // Detail goes to logs only; it never holds the User-Agent or headers.
      logger("export_error", {
        requestId,
        code: err instanceof PeerSetError ? err.code : "INTERNAL",
        detail:
          err instanceof PeerSetError
            ? err.detail
            : `${err instanceof Error ? err.name : typeof err}`,
        ms: Date.now() - started,
      });
      return Response.json(errorResponseBody(err, requestId), {
        status: httpStatusFor(err),
        headers: {
          "Cache-Control": "no-store",
          ...(err instanceof SecRateLimitedError
            ? { "Retry-After": "600" }
            : {}),
        },
      });
    }
  };
}
