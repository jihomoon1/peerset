// Builds the peer index from SEC's bulk files on disk (blueprint §10.1). Reads only the
// CIK##########.json entries of listed companies; overflow pages
// (CIK##########-submissions-001.json) and everything else are skipped. A bulk entry
// that fails SEC schema validation is kept without that data and counted.

import { readFileSync } from "node:fs";
import { screeningRevenue } from "@/domain/screeningRevenue";
import {
  assembleIndex,
  companyRecord,
  listedUniverse,
} from "@/peers/buildIndex";
import type { PeerIndex, PeerIndexMeta } from "@/peers/indexTypes";
import { trimCompanyFacts } from "@/sec/companyFacts";
import { parseSubmissions } from "@/sec/submissions";
import type { Submissions } from "@/sec/schemas";
import { forEachJsonEntry } from "./bulkZip";

const ENTRY = /^CIK(\d{10})\.json$/;

export interface BuildInput {
  tickersPath: string;
  submissionsZip: string;
  companyfactsZip: string;
  sources: PeerIndexMeta["sources"];
  log?: (message: string) => void;
}

type RevenueResult = ReturnType<typeof screeningRevenue>;

export async function buildFromFiles(input: BuildInput): Promise<PeerIndex> {
  const log = input.log ?? (() => {});
  const universe = listedUniverse(
    JSON.parse(readFileSync(input.tickersPath, "utf8")),
  );
  const wanted = (name: string) => {
    const m = ENTRY.exec(name);
    return m !== null && universe.listed.has(m[1]);
  };
  const cikOf = (name: string) => ENTRY.exec(name)![1];
  const unreadable = { submissions: 0, companyfacts: 0 };

  const subs = new Map<string, Submissions>();
  const s = await forEachJsonEntry(
    input.submissionsZip,
    wanted,
    (name, text) => {
      try {
        subs.set(cikOf(name), parseSubmissions(JSON.parse(text)));
      } catch {
        unreadable.submissions++;
      }
    },
  );
  log(`submissions.zip: ${s.entries} entries, ${s.read} read`);

  const revenue = new Map<string, RevenueResult>();
  const f = await forEachJsonEntry(
    input.companyfactsZip,
    wanted,
    (name, text) => {
      try {
        revenue.set(
          cikOf(name),
          screeningRevenue(trimCompanyFacts(JSON.parse(text)).facts),
        );
      } catch {
        unreadable.companyfacts++;
        revenue.set(cikOf(name), {
          kind: "none",
          reason: "companyfacts entry didn't match SEC's expected format",
        });
      }
    },
  );
  log(`companyfacts.zip: ${f.entries} entries, ${f.read} read`);

  const companies = [...universe.listed].map(([cik, listed]) =>
    companyRecord(
      cik,
      listed,
      subs.get(cik) ?? null,
      revenue.get(cik) ?? { kind: "none", reason: "no companyfacts entry" },
    ),
  );
  return assembleIndex(universe, companies, input.sources, unreadable);
}
