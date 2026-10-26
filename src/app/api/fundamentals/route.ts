// Pre-price fundamentals for one ticker (blueprint §13). Node.js runtime, 60 s limit.
// The region (iad1) is set in vercel.json: preferredRegion is deprecated in Next 16.

import { defaultDeps } from "@/lib/fundamentals";
import { createFundamentalsHandler } from "./handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = createFundamentalsHandler(defaultDeps);
