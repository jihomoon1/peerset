// Operating income (methodology §3): OperatingIncomeLoss only, no fallback.

import { computeLtm, type LtmInput } from "../ltm";
import { CONCEPTS } from "../policy";
import { ltmMetric, type LtmMetricResult } from "./common";

export function computeOperatingIncome(input: LtmInput): LtmMetricResult {
  return ltmMetric(computeLtm(input, CONCEPTS.operatingIncome), "USD");
}
