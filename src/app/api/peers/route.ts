// Peer selection for one ticker (blueprint §13): reads the committed peer index, no
// SEC calls. Node.js runtime, for the file read.

import { log } from "@/lib/log";
import { loadPeerIndex } from "@/peers/loadIndex";
import { createPeersHandler } from "./handler";

export const runtime = "nodejs";

export const GET = createPeersHandler(() => ({
  index: () => loadPeerIndex(),
  analysisDate: new Date().toISOString().slice(0, 10),
  logger: log,
}));
