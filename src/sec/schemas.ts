// Zod schemas for the SEC responses PeerSet reads (blueprint §8.5). Each checks only
// the fields we use, so SEC adding fields never breaks us. z.object strips unknown
// keys by default. A failure is SEC_SCHEMA_CHANGED with the path — never a guess.

import * as z from "zod";
import { SecSchemaChangedError } from "@/lib/errors";

export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
  what: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.map(String).join(".") || "(root)";
  throw new SecSchemaChangedError(`${what}: ${path}: ${issue.message}`);
}

// www.sec.gov/files/company_tickers_exchange.json
export const CompanyTickersExchangeSchema = z.object({
  fields: z.tuple([
    z.literal("cik"),
    z.literal("name"),
    z.literal("ticker"),
    z.literal("exchange"),
  ]),
  data: z.array(
    z.tuple([z.number().int(), z.string(), z.string(), z.string().nullable()]),
  ),
});

// data.sec.gov/submissions/CIK##########.json — the parallel arrays in filings.recent
const isoDateOrEmpty = z.union([z.iso.date(), z.literal("")]);

export const SubmissionsSchema = z.object({
  cik: z.string(),
  name: z.string(),
  sic: z.string(),
  sicDescription: z.string().nullable(),
  tickers: z.array(z.string()),
  exchanges: z.array(z.string().nullable()),
  fiscalYearEnd: z.string().nullable(),
  stateOfIncorporation: z.string().nullable(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      filingDate: z.array(z.iso.date()),
      reportDate: z.array(isoDateOrEmpty),
      form: z.array(z.string()),
      primaryDocument: z.array(z.string()),
    }),
  }),
});
export type Submissions = z.infer<typeof SubmissionsSchema>;

// data.sec.gov/api/xbrl/companyfacts/CIK##########.json
// Top level only: concepts we don't use are not validated, so a change in one of
// them can't break us. Whitelisted concepts are checked with ConceptFactsSchema.
export const CompanyFactsSchema = z.object({
  // A number for most companies, a zero-padded string for others ("0001144879").
  cik: z.union([z.number().int(), z.string().regex(/^\d{1,10}$/)]),
  entityName: z.string(),
  facts: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export const ConceptFactsSchema = z.object({
  units: z.record(
    z.string(),
    z.array(
      z.object({
        start: z.iso.date().optional(),
        end: z.iso.date(),
        val: z.number(),
        accn: z.string(),
        form: z.string(),
        filed: z.iso.date(),
      }),
    ),
  ),
});
export type ConceptFacts = z.infer<typeof ConceptFactsSchema>;

// www.sec.gov/Archives/edgar/data/{cik}/{accession}/index.json
export const FilingIndexSchema = z.object({
  directory: z.object({
    item: z.array(z.object({ name: z.string() })),
  }),
});
export type FilingIndex = z.infer<typeof FilingIndexSchema>;
