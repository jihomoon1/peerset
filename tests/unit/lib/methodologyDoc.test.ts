import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { headingId, renderMethodology } from "@/lib/methodologyDoc";
import { METHODOLOGY_ANCHORS } from "@/lib/methodologyLinks";
import { METHODOLOGY_VERSION } from "@/domain/policy";

// The /methodology page renders docs/methodology.md (M6 step 5). Column headers link
// to its sections, so every anchor the UI uses must exist in the rendered document.

const doc = readFileSync(
  path.join(process.cwd(), "docs", "methodology.md"),
  "utf8",
);

describe("headingId", () => {
  it.each([
    ["5. Diluted EPS and P/E", "5-diluted-eps-and-pe"],
    [
      "4. EBITDA (standardized, unadjusted)",
      "4-ebitda-standardized-unadjusted",
    ],
    [
      "7.F Fallback: tag rules (methodology 0.2.1)",
      "7f-fallback-tag-rules-methodology-021",
    ],
    ["13A. Peer screening (blueprint §10)", "13a-peer-screening-blueprint-10"],
  ])("%s → %s (GitHub-style, so links match the repo view)", (text, id) => {
    expect(headingId(text)).toBe(id);
  });
});

describe("renderMethodology", () => {
  const r = renderMethodology(doc);

  it("gives every heading a stable id", () => {
    expect(r.html).toContain('<h3 id="5-diluted-eps-and-pe">'); // one level below the page h1
    expect(r.ids).toContain("10-multiples-and-the-nm-policy");
  });

  it("renders the GFM tables", () => {
    expect(r.html).toMatch(/<table>[\s\S]*Revenue ≤ 0/);
  });

  it("shows the methodology version that policy.ts uses", () => {
    expect(r.html).toContain(`Methodology version: ${METHODOLOGY_VERSION}`);
  });

  it.each(Object.entries(METHODOLOGY_ANCHORS))(
    "the %s column's anchor #%s exists",
    (_column, anchor) => {
      expect(r.ids).toContain(anchor);
    },
  );
});
