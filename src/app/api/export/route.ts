// The comps workbook for a target, its peers and entered prices (blueprint §13, §17).
// Node.js runtime (ExcelJS, the peer-index file), 60 s limit; region in vercel.json.

import { defaultDeps } from "@/lib/fundamentals";
import { defaultPeersDeps } from "@/lib/peers";
import { createExportHandler } from "./handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createExportHandler(() => ({
  load: defaultDeps(),
  peers: defaultPeersDeps(),
  now: () => new Date(),
}));
