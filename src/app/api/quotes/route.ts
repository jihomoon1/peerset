// End-of-day quotes for the valuation block (blueprint §13), alpha_vantage mode only.

import { defaultQuoteDeps } from "@/lib/quotes";
import { createQuotesHandler } from "./handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = createQuotesHandler(() => defaultQuoteDeps());
