// Company identity for the home search (M6). Node.js runtime; two SEC requests at
// most (ticker list and submissions), both cached.

import { defaultDeps } from "@/lib/fundamentals";
import { createIdentityHandler } from "./handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export const GET = createIdentityHandler(defaultDeps);
