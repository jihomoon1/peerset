// The NM policy for multiples (methodology §10). Checked in this order: EV ≤ 0
// withholds both EV multiples, then a denominator at or below zero, then the 100.0x
// cap. Missing and Unsupported inputs are handled before this (multiples.ts): they
// are "—" or "Unsupported", never NM.

import { NM_MULTIPLE_CAP } from "./policy";
import type { NmReason } from "./types";

export function nmReason(
  numerator: number,
  denominator: number,
  rule: { evNumerator: boolean; notPositive: NmReason },
): NmReason | null {
  if (rule.evNumerator && numerator <= 0) return "EV_NOT_POSITIVE";
  if (denominator <= 0) return rule.notPositive;
  if (numerator / denominator > NM_MULTIPLE_CAP) return "ABOVE_CAP";
  return null;
}

export const NM_REASON_TEXT: Record<NmReason, string> = {
  REVENUE_NOT_POSITIVE: "revenue ≤ 0",
  EBITDA_NOT_POSITIVE: "EBITDA ≤ 0",
  EPS_NOT_POSITIVE: "EPS ≤ 0",
  EV_NOT_POSITIVE: "EV ≤ 0",
  ABOVE_CAP: "above 100x policy",
};
