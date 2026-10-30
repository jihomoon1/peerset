// Builds fixture-peer-index.json: a peer index over only the companies that have frozen
// SEC fixtures, so fixture mode (e2e) screens peers without the live index or the
// clock. Uses the same builder functions as the monthly index (src/peers/buildIndex.ts)
// on each fixture's submissions and companyfacts. Regenerate after adding a fixture:
//   npx tsx tests/fixtures/peer-index/build-fixture-index.ts
// tests/integration/fixturePeerIndex.test.ts fails if the committed file is stale.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { screeningRevenue } from "@/domain/screeningRevenue";
import { assembleIndex, companyRecord, listedUniverse } from "@/peers/buildIndex";
import { encodeIndex } from "@/peers/indexFormat";
import type { PeerIndex } from "@/peers/indexTypes";
import { trimCompanyFacts } from "@/sec/companyFacts";
import { parseSubmissions } from "@/sec/submissions";

const SEC = path.join("tests", "fixtures", "sec");
export const FIXTURE_INDEX_PATH = path.join(
  "tests",
  "fixtures",
  "peer-index",
  "fixture-peer-index.json",
);

interface Manifest {
  cik: string;
  files: { role: string; file: string; retrievedAt: string }[];
}

const readGz = (file: string) =>
  JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));

// The newest as-of per ticker, as fixture mode itself picks (src/sec/fixtureFetch.ts).
function fixtureDirs(): string[] {
  return readdirSync(SEC)
    .filter((t) => t !== "_shared")
    .sort()
    .map((t) => {
      const asOfs = readdirSync(path.join(SEC, t)).sort();
      return path.join(SEC, t, asOfs[asOfs.length - 1]);
    });
}

export function buildFixtureIndex(): PeerIndex {
  const shared = JSON.parse(
    readFileSync(path.join(SEC, "_shared", "manifest.json"), "utf8"),
  ) as { files: { file: string; retrievedAt: string }[] };
  const universe = listedUniverse(
    readGz(path.join(SEC, "_shared", shared.files[0].file)),
  );

  const companies = [];
  let newest = shared.files[0].retrievedAt;
  for (const dir of fixtureDirs()) {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "manifest.json"), "utf8"),
    ) as Manifest;
    const file = (role: string) => {
      const f = manifest.files.find((x) => x.role === role)!;
      if (f.retrievedAt > newest) newest = f.retrievedAt;
      return path.join(dir, f.file);
    };
    const listed = universe.listed.get(manifest.cik);
    if (!listed) throw new Error(`${dir}: CIK ${manifest.cik} is not listed`);
    companies.push(
      companyRecord(
        manifest.cik,
        listed,
        parseSubmissions(readGz(file("submissions"))),
        screeningRevenue(trimCompanyFacts(readGz(file("companyfacts"))).facts),
      ),
    );
  }

  // Only the fixture companies: the universe's other listings are left out, and
  // off-exchange tickers aren't needed.
  const fixtureUniverse = { ...universe, unlisted: [] };
  const sources = {
    tickers: { url: "fixture", lastModified: shared.files[0].retrievedAt },
    submissions: { url: "fixture", lastModified: newest },
    companyfacts: { url: "fixture", lastModified: newest },
  };
  return assembleIndex(fixtureUniverse, companies, sources, {
    submissions: 0,
    companyfacts: 0,
  });
}

if (process.argv[1]?.endsWith("build-fixture-index.ts")) {
  writeFileSync(FIXTURE_INDEX_PATH, encodeIndex(buildFixtureIndex()));
  console.log(`wrote ${FIXTURE_INDEX_PATH}`);
}
