// Revenue (methodology §3): highest-priority concept with every LTM component. If
// another listed concept has its own LTM over the same window with a different value,
// use Revenues when it is the larger (it is the total element), warn, and show both.

import { computeLtm, ltmForConcept, type LtmInput } from "../ltm";
import { CONCEPTS } from "../policy";
import { componentsOf, ltmMetric, type LtmMetricResult } from "./common";

const TOTAL = "us-gaap:Revenues";

const usd = (v: number) => `USD ${v.toLocaleString("en-US")}`;

export function computeRevenue(input: LtmInput): LtmMetricResult {
  const primary = computeLtm(input, CONCEPTS.revenue);
  if (primary.kind !== "ok") return ltmMetric(primary, "USD");

  for (const concept of CONCEPTS.revenue) {
    if (concept === primary.calc.concept) continue;
    const other = ltmForConcept(input, concept);
    if (
      other.kind !== "ok" ||
      other.period.start !== primary.period.start ||
      other.value === primary.value
    )
      continue;

    const useOther = concept === TOTAL && other.value > primary.value;
    const [chosen, shown] = useOther ? [other, primary] : [primary, other];
    const result = ltmMetric(chosen, "USD", [
      {
        code: "W_REVENUE_CONCEPTS_DIFFER",
        // Full dollars: rounding to millions happens only in display formatting.
        message: `${primary.calc.concept} gives ${usd(primary.value)} and ${concept} gives ${usd(other.value)} for the same LTM; using ${chosen.calc.concept}`,
        severity: "caution",
      },
    ]);
    if (
      result.metric.status === "reported" ||
      result.metric.status === "derived"
    )
      result.metric.inputs.push(...componentsOf(shown.calc));
    return result;
  }
  return ltmMetric(primary, "USD");
}
