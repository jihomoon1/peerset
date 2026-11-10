import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ABOUT_EVIDENCE as ev } from "@/lib/aboutEvidence";

const golden = (name: string) =>
  JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "../../golden", `${name}.json`),
      "utf8",
    ),
  );

describe("Why PeerSet evidence: Carrier", () => {
  const g = golden("CARR-2026Q2-balance");
  const c = ev.carrier;

  it("matches the CARR Q2 2026 balance golden, value for value", () => {
    const included = g.debt.lines.filter(
      (l: { included: boolean }) => l.included,
    );
    expect(c.lines.map((l) => [l.label, l.value])).toEqual(
      included.map((l: { label: string; value: number }) => [l.label, l.value]),
    );
    expect(c.faceTotal).toBe(g.debt.total);
    expect(c.tagConcept).toBe(g.debt.crossCheck.concept);
    expect(c.tagValue).toBe(g.debt.crossCheck.value);
    expect(g.debt.warnings).toContain("W_DEBT_TOTAL_TAG_DIFFERS");
    expect(c.date).toBe(g.filing.reportDate);
    expect(c.form).toBe(g.filing.form);
    expect(c.accession).toBe(g.filing.accession);
    expect(c.statementUrl).toBe(g.statement.url);
  });

  it("adds up: lines sum to the face total; gap = face total − tag", () => {
    expect(c.lines.reduce((s, l) => s + l.value, 0)).toBe(c.faceTotal);
    expect(c.faceTotal - c.tagValue).toBe(c.gap);
  });
});

describe("Why PeerSet evidence: Watsco", () => {
  const g = golden("WSO-2026Q2-balance");
  const w = ev.watsco;
  const line = (label: string) =>
    g.debt.lines.find((l: { label: string }) => l.label === label);

  it("matches the WSO Q2 2026 balance golden, value for value", () => {
    const excluded = line(w.excluded.label);
    expect(excluded.included).toBe(false);
    expect(w.excluded.concept).toBe(excluded.concept);
    expect(w.excluded.value).toBe(excluded.value);
    const counted = line(w.counted.label);
    expect(counted.included).toBe(true);
    expect(w.counted.value).toBe(counted.value);
    expect(w.operatingNoncurrent).toBe(
      line("Operating lease liabilities, net of current portion").value,
    );
    expect(w.total).toBe(g.debt.total);
    expect(g.debt.warnings).toContain("W_LEASE_LINE_EXCLUDED");
    expect(w.date).toBe(g.filing.reportDate);
    expect(w.form).toBe(g.filing.form);
    expect(w.accession).toBe(g.filing.accession);
    expect(w.statementUrl).toBe(g.statement.url);
  });

  it("adds up: by tag alone = excluded line + counted line", () => {
    expect(w.excluded.value + w.counted.value).toBe(w.byTagAlone);
  });
});
