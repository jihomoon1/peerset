// data/peer-index.json's file format (docs/decisions/0008-peer-index-format.md):
// columnar rows, like SEC's own ticker file, with SIC descriptions and revenue concept
// names stored once. One company per line, so a monthly refresh diffs line by line.
// encodeIndex is deterministic: the same index always gives the same bytes.

// Format 2 (methodology 0.5.0, §13E) adds each company's kind and a bank's total assets;
// a format-1 file still reads, with financial companies left without a kind.

import { z } from "zod";
import { inFinancialSicRange } from "@/domain/issuerKind";
import type { PeerIndex, PeerIndexCompany } from "./indexTypes";

export const INDEX_FORMAT = "peerset-peer-index/2";
const INDEX_FORMAT_V1 = "peerset-peer-index/1";

const FIELDS_V1 = [
  "cik",
  "name",
  "listings",
  "sic",
  "fiscalYearEnd",
  "incorporation",
  "latest",
  "revenue",
  "revenueNote",
] as const;
const FIELDS = [...FIELDS_V1, "kind", "totalAssets"] as const;

// [form, filedDate, reportDate, accession]
const Latest = z.tuple([z.string(), z.string(), z.string(), z.string()]);
// [value, periodEnd, concept index, accession]
const Revenue = z.tuple([z.number(), z.string(), z.number().int(), z.string()]);
const ROW_V1 = [
  z.string(),
  z.string(),
  z.array(z.tuple([z.string(), z.string()])).min(1),
  z.string(),
  z.string(),
  z.string(),
  Latest.nullable(),
  Revenue.nullable(),
  z.string().nullable(),
] as const;
const RowV1 = z.tuple(ROW_V1);
const Row = z.tuple([
  ...ROW_V1,
  z.enum(["operating", "bank", "digitalAsset"]).nullable(),
  // [value, accession]: a bank's total assets at the latest report date
  z.tuple([z.number(), z.string()]).nullable(),
]);
const Source = z.object({ url: z.string(), lastModified: z.string() });

const Meta = z.object({
  generatedAt: z.string(),
  methodologyVersion: z.string(),
  sources: z.object({
    tickers: Source,
    submissions: Source,
    companyfacts: Source,
  }),
  counts: z.object({
    total: z.number().int(),
    listed: z.number().int(),
    withRevenue: z.number().int(),
    byExclusionReason: z.record(z.string(), z.number().int()),
    unreadable: z.object({
      submissions: z.number().int(),
      companyfacts: z.number().int(),
    }),
  }),
});

const common = {
  meta: Meta,
  sicDescriptions: z.record(z.string(), z.string()),
  concepts: z.array(z.string()),
  unlisted: z.array(z.tuple([z.string(), z.string()])),
};
const FileSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal(INDEX_FORMAT),
    fields: z.tuple(FIELDS.map((f) => z.literal(f)) as never),
    rows: z.array(Row),
    ...common,
  }),
  z.object({
    format: z.literal(INDEX_FORMAT_V1),
    fields: z.tuple(FIELDS_V1.map((f) => z.literal(f)) as never),
    rows: z.array(RowV1),
    ...common,
  }),
]);

const FOREIGN = new Set(["20-F", "20-F/A", "40-F", "40-F/A"]);

export function encodeIndex(index: PeerIndex): string {
  const sicDescriptions: Record<string, string> = {};
  const concepts = [
    ...new Set(
      index.companies.flatMap((c) => (c.revenue ? [c.revenue.concept] : [])),
    ),
  ].sort();
  for (const c of index.companies)
    if (c.sic && c.sicDescription) sicDescriptions[c.sic] = c.sicDescription;

  const rows = [...index.companies]
    .sort((a, b) => a.cik.localeCompare(b.cik))
    .map((c) =>
      JSON.stringify([
        c.cik,
        c.name,
        c.listings.map((l) => [l.ticker, l.exchange]),
        c.sic,
        c.fiscalYearEnd,
        c.incorporation,
        c.latest
          ? [
              c.latest.form,
              c.latest.filedDate,
              c.latest.reportDate,
              c.latest.accession,
            ]
          : null,
        c.revenue
          ? [
              c.revenue.value,
              c.revenue.periodEnd,
              concepts.indexOf(c.revenue.concept),
              c.revenue.accession,
            ]
          : null,
        c.revenueNote,
        c.kind,
        c.totalAssets ? [c.totalAssets.value, c.totalAssets.accession] : null,
      ]),
    );
  const sortedSics = Object.fromEntries(
    Object.entries(sicDescriptions).sort(([a], [b]) => a.localeCompare(b)),
  );
  return [
    "{",
    `"format": ${JSON.stringify(INDEX_FORMAT)},`,
    `"meta": ${JSON.stringify(index.meta)},`,
    `"sicDescriptions": ${JSON.stringify(sortedSics)},`,
    `"concepts": ${JSON.stringify(concepts)},`,
    `"fields": ${JSON.stringify(FIELDS)},`,
    `"rows": [`,
    rows.join(",\n"),
    `],`,
    `"unlisted": [`,
    index.unlisted
      .map((l) => JSON.stringify([l.ticker, l.exchange]))
      .join(",\n"),
    `]`,
    "}",
    "",
  ].join("\n");
}

export function decodeIndex(raw: unknown): PeerIndex {
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `peer index: ${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const file = parsed.data;
  const v2 = file.format === INDEX_FORMAT;
  const rows: (z.infer<typeof RowV1> | z.infer<typeof Row>)[] = file.rows;
  const companies: PeerIndexCompany[] = rows.map((r) => {
    const [
      cik,
      name,
      listings,
      sic,
      fiscalYearEnd,
      incorporation,
      latest,
      revenue,
      revenueNote,
    ] = r;
    const extra = r.length === 11 ? r : null;
    const assets = extra ? extra[10] : null;
    return {
      cik,
      name,
      ticker: listings[0][0],
      listings: listings.map(([ticker, exchange]) => ({ ticker, exchange })),
      sic,
      sicDescription: file.sicDescriptions[sic] ?? "",
      fiscalYearEnd,
      incorporation,
      latest: latest
        ? {
            form: latest[0],
            filedDate: latest[1],
            reportDate: latest[2],
            accession: latest[3],
          }
        : null,
      files20F: latest ? FOREIGN.has(latest[0]) : false,
      revenue: revenue
        ? {
            value: revenue[0],
            periodEnd: revenue[1],
            concept: file.concepts[revenue[2]],
            accession: revenue[3],
          }
        : null,
      revenueNote,
      kind: extra ? extra[9] : inFinancialSicRange(sic) ? null : "operating",
      totalAssets: assets ? { value: assets[0], accession: assets[1] } : null,
    };
  });
  return {
    meta: file.meta,
    companies,
    unlisted: file.unlisted.map(([ticker, exchange]) => ({ ticker, exchange })),
    kindsRecorded: v2,
  };
}
