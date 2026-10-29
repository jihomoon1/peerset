import { describe, expect, it } from "vitest";
import type { CompsRow } from "@/domain/comps";
import type { Metric } from "@/domain/types";
import { sortPeerRows } from "@/ui/compsSort";

// Blueprint §6: header sorting is stable; the target and the stats rows never move
// (the target isn't in the rows sorted here). Rows without a usable value (NM, "—",
// Unsupported, loading, failed) go last in either direction, in their original order.

const value = (v: number): Metric => ({
  status: "derived",
  value: v,
  unit: "multiple",
  period: { kind: "instant", end: "2026-06-30" },
  formula: "t",
  inputs: [],
  warnings: [],
});
const nm: Metric = {
  status: "nm",
  value: -2,
  reason: "EBITDA_NOT_POSITIVE",
  inputs: [],
  warnings: [],
};

function row(ticker: string, evEbitda?: Metric): CompsRow {
  return {
    ticker,
    role: "peer",
    state: evEbitda ? "loaded" : "loading",
    ...(evEbitda
      ? { cells: { evEbitda } as unknown as CompsRow["cells"] }
      : {}),
  };
}

const rows = [
  row("A", value(12)),
  row("B", nm),
  row("C", value(8)),
  row("D"),
  row("E", value(12)),
];
const order = (r: CompsRow[]) => r.map((x) => x.ticker).join("");

describe("sortPeerRows", () => {
  it("keeps the given order without a sort", () => {
    expect(order(sortPeerRows(rows, null))).toBe("ABCDE");
  });

  it("sorts ascending, ties stable, unusable last", () => {
    expect(
      order(sortPeerRows(rows, { column: "evEbitda", direction: "ascending" })),
    ).toBe("CAEBD");
  });

  it("sorts descending, ties stable, unusable still last", () => {
    expect(
      order(
        sortPeerRows(rows, { column: "evEbitda", direction: "descending" }),
      ),
    ).toBe("AECBD");
  });

  it("sorts by ticker in plain character order", () => {
    expect(
      order(
        sortPeerRows([row("WSO", nm), row("AAON", nm), row("CARR", nm)], {
          column: "ticker",
          direction: "ascending",
        }),
      ),
    ).toBe("AAONCARRWSO");
  });

  it("does not modify its input", () => {
    sortPeerRows(rows, { column: "evEbitda", direction: "ascending" });
    expect(order(rows)).toBe("ABCDE");
  });
});
