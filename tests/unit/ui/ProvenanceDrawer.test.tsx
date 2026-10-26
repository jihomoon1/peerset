import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildFundamentals,
  METRIC_KEYS,
  type MetricKey,
} from "@/domain/fundamentals";
import { createLimiter, createSecClient } from "@/sec/client";
import { getCompanyFacts } from "@/sec/freshness";
import { ProvenanceDrawer } from "@/ui/ProvenanceDrawer";
import { OperatingBlock } from "@/ui/OperatingBlock";
import { fixtureFetch } from "../../helpers/fixtures";

// M1 gate: the drawer shows formula, inputs, concept, period, accession and link for
// every metric. Rendered to static HTML from the LII fixture (no browser needed).

const client = createSecClient({
  fetch: fixtureFetch(["LII/2026Q2"]).fetch,
  env: { SEC_USER_AGENT: "PeerSet-Test test@example.invalid" },
  logger: () => {},
  limiter: createLimiter(0),
});
const f = buildFundamentals(
  await getCompanyFacts("0001069202", { asOf: "2026-10-23", client }),
);

const render = (key: MetricKey) =>
  renderToStaticMarkup(
    <ProvenanceDrawer f={f} metricKey={key} onClose={() => {}} />,
  );

const CONCEPTS: Record<MetricKey, string[]> = {
  revenue: ["us-gaap:Revenues"],
  operatingIncome: ["us-gaap:OperatingIncomeLoss"],
  da: ["us-gaap:DepreciationAndAmortization"],
  ebitda: [
    "us-gaap:OperatingIncomeLoss",
    "us-gaap:DepreciationAndAmortization",
  ],
  ebitdaMargin: [
    "us-gaap:OperatingIncomeLoss",
    "us-gaap:DepreciationAndAmortization",
    "us-gaap:Revenues",
  ],
  netIncome: ["us-gaap:NetIncomeLoss"],
  dilutedEps: ["us-gaap:EarningsPerShareDiluted"],
};

describe("ProvenanceDrawer", () => {
  it.each(METRIC_KEYS)(
    "%s: formula, bridge, inputs, accession links",
    (key) => {
      const html = render(key);
      expect(html).toContain('aria-labelledby="drawer-title"');
      expect(html).toContain("Formula");
      expect(html).toContain("LTM bridge");
      for (const concept of CONCEPTS[key]) expect(html).toContain(concept);
      // FY from the 10-K, YTDs from the 10-Q, each linked to its filing index.
      expect(html).toContain("January 1, 2025 – December 31, 2025");
      expect(html).toContain("January 1, 2026 – June 30, 2026");
      expect(html).toContain("January 1, 2025 – June 30, 2025");
      for (const acc of ["0001069202-26-000028", "0001069202-26-000087"]) {
        expect(html).toContain(acc);
        expect(html).toContain(`/${acc.replaceAll("-", "")}/${acc}-index.htm`);
      }
      expect(html).toContain("Parsed from the filing&#x27;s XBRL");
      expect(html).toContain("Status");
      expect(html).toContain("Warnings");
    },
  );

  it("EBITDA shows the bridge sum and both inputs", () => {
    const html = render("ebitda");
    expect(html).toContain("Operating income + D&amp;A");
    expect(html).toContain("1,164.9");
    expect(html).toContain("1,043.0");
    expect(html).toContain("121.9");
    expect(html).toContain("W_DA_FROM_CASH_FLOW");
    expect(html).toContain('1,041.5</span> <span class="text-muted">USD m');
  });

  it("EPS shows the cross-check and split result", () => {
    const html = render("dilutedEps");
    expect(html).toContain("EPS cross-check");
    expect(html).toContain("none detected");
  });
});

describe("OperatingBlock", () => {
  it("is a real table whose values are buttons that open a dialog", () => {
    const html = renderToStaticMarkup(<OperatingBlock f={f} />);
    expect(html).toContain("<table");
    expect(html).toContain('<th scope="row"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(7);
    expect(html).toContain("EBITDA (standardized, unadjusted)");
    expect(html).toContain("22.51");
    expect(html).toContain("22.0%");
  });
});
