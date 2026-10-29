// Peer selection for one ticker (blueprint §13): reads the committed peer index, no
// SEC calls. Node.js runtime, for the file read.

import { FIXTURE_AS_OF, fixtureModeOn } from "@/lib/fixtureMode";
import { log } from "@/lib/log";
import { loadPeerIndex } from "@/peers/loadIndex";
import { createPeersHandler } from "./handler";

export const runtime = "nodejs";

export const GET = createPeersHandler(() => ({
  index: () => loadPeerIndex(),
  // Fixture mode pins the analysis date, so screening never drifts with the clock.
  analysisDate: fixtureModeOn()
    ? FIXTURE_AS_OF
    : new Date().toISOString().slice(0, 10),
  logger: log,
}));
