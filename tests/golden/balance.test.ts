import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BalanceSheetItem } from "@/domain/balanceSheet";
import { buildFundamentals } from "@/domain/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { fixtureFetch } from "../helpers/fixtures";

// Balance-sheet goldens (methodology 0.3.0 §7–§9, blueprint §16). Expected values are
// read from each filing's rendered balance sheet (see "statement" and "note" in each
// JSON), never from the engine. The full adapter → domain path runs offline on
// frozen fixtures.

interface GoldenLine {
  label: string;
  concept: string;
  displayed: string;
  value: number;
  included: boolean;
}
interface GoldenItem {
  lines: GoldenLine[];
  total: number;
  warnings: string[];
  crossCheck?: { concept: string; value: number };
}
type GoldenSingle =
  { status: "missing" } | { status: "derived"; concept: string; value: number };
interface Golden {
  ticker: string;
  cik: string;
  fixture: string;
  asOf: string;
  filing: { accession: string; reportDate: string };
  statement: { name: string; url: string; scale: string };
  methodologyVersion: string;
  debt: GoldenItem;
  cash: GoldenItem;
  preferred: GoldenSingle;
  nci: GoldenSingle;
  notDebt?: { concept: string }[];
}

const goldens: Golden[] = readdirSync(import.meta.dirname)
  .filter((f) => f.endsWith("-balance.json"))
  .sort()
  .map((f) =>
    JSON.parse(readFileSync(path.join(import.meta.dirname, f), "utf8")),
  );

async function run(g: Golden) {
  const fake = fixtureFetch([g.fixture]);
  const client = createSecClient({
    fetch: fake.fetch,
    env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
    logger: () => {},
    limiter: createLimiter(0),
  });
  return buildFundamentals(
    await getCompanyFacts(g.cik, { asOf: g.asOf, client }),
  );
}

const SCALE: Record<string, number> = { Millions: 1e6, Thousands: 1e3 };

// The golden's own arithmetic: each value is the displayed number times the scale.
function checkTranscription(g: GoldenItem, scale: string) {
  for (const line of g.lines)
    expect(
      Math.round(Number(line.displayed.replace(/[$,\s]/g, "")) * SCALE[scale]),
      line.concept,
    ).toBe(line.value);
  expect(
    g.lines.filter((l) => l.included).reduce((sum, l) => sum + l.value, 0),
  ).toBe(g.total);
}

function checkItem(item: BalanceSheetItem, g: GoldenItem) {
  expect(item.method).toBe("face");
  for (const line of g.lines) {
    const engine = item.lines.find((l) => l.concept === line.concept);
    expect(engine, line.concept).toBeDefined();
    expect(engine!.label, line.concept).toBe(line.label);
    expect(engine!.value, line.concept).toBe(line.value);
    expect(engine!.included, line.concept).toBe(line.included);
  }
  // Nothing included that the golden doesn't list.
  expect(
    item.lines
      .filter((l) => l.included)
      .map((l) => l.concept)
      .sort(),
  ).toEqual(
    g.lines
      .filter((l) => l.included)
      .map((l) => l.concept)
      .sort(),
  );
  expect(item.metric).toMatchObject({ status: "derived", value: g.total });
  expect(item.metric.warnings.map((w) => w.code).sort()).toEqual(
    [...g.warnings].sort(),
  );
}

describe.each(goldens.map((g) => [g.ticker, g] as const))(
  "%s balance-sheet golden",
  async (_ticker, g) => {
    const f = await run(g);

    it("reads the rendered balance sheet of the expected filing", () => {
      expect(f.freshness.latestAccession).toBe(g.filing.accession);
      expect(f.balanceSheet).toEqual({
        date: g.filing.reportDate,
        statement: {
          url: g.statement.url,
          name: g.statement.name,
          scale: g.statement.scale,
        },
      });
      expect(f.methodologyVersion).toBe(g.methodologyVersion);
    });

    it("golden values are the displayed numbers times the scale", () => {
      checkTranscription(g.debt, g.statement.scale);
      checkTranscription(g.cash, g.statement.scale);
    });

    it("debt: every face line and the total equal the filing", () => {
      checkItem(f.debt, g.debt);
      if (g.debt.crossCheck) {
        const message = f.debt.metric.warnings.find(
          (w) => w.code === "W_DEBT_TOTAL_TAG_DIFFERS",
        )?.message;
        expect(message).toContain(g.debt.crossCheck.concept);
        expect(message).toContain(
          `${(g.debt.crossCheck.value / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1 })}M`,
        );
      }
    });

    it("cash: every face line and the total equal the filing", () => {
      checkItem(f.cash, g.cash);
    });

    it("preferred stock and NCI equal the filing", () => {
      for (const [item, golden] of [
        [f.evAdjustments.preferred, g.preferred],
        [f.evAdjustments.nci, g.nci],
      ] as const) {
        if (golden.status === "missing")
          expect(item.metric.status).toBe("missing");
        else
          expect(item.metric).toMatchObject({
            status: "derived",
            value: golden.value,
            inputs: [{ concept: golden.concept }],
          });
      }
    });

    it("leaves out the lines the methodology says are not debt", () => {
      const included = f.debt.lines.filter((l) => l.included);
      for (const { concept } of g.notDebt ?? [])
        expect(included.map((l) => l.concept)).not.toContain(concept);
    });
  },
);

it("has the six M2a balance-sheet goldens", () => {
  expect(goldens.map((g) => g.ticker).sort()).toEqual([
    "AAON",
    "CARR",
    "GGG",
    "LII",
    "TT",
    "WSO",
  ]);
});
