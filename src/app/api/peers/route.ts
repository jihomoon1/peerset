// Peer selection for one ticker (blueprint §13): reads the committed peer index, no
// SEC calls. Node.js runtime, for the file read.

import { defaultPeersDeps } from "@/lib/peers";
import { createPeersHandler } from "./handler";

export const runtime = "nodejs";

export const GET = createPeersHandler(defaultPeersDeps);
