// Net income attributable to the parent (methodology §3): NetIncomeLoss.

import { computeLtm, type LtmInput } from "../ltm";
import { CONCEPTS } from "../policy";
import { ltmMetric, type LtmMetricResult } from "./common";

export function computeNetIncome(input: LtmInput): LtmMetricResult {
  return ltmMetric(computeLtm(input, CONCEPTS.netIncome), "USD");
}
