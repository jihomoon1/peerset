// Methodology §5 (0.4.0): does any LTM component period report discontinued
// operations? A period does when one of CONCEPTS.discontinuedOps is reported for
// exactly that period (latest-filed rule, §1) with a value other than 0.

import { selectFact } from "../factSelection";
import { CONCEPTS } from "../policy";
import type { LTMCalculation, ReportedFinancialFact } from "../types";
import { formatMillions, formatPerShare } from "@/lib/format";

export type ComponentRole = "fy" | "ytdCurrent" | "ytdPrior";

export interface DiscontinuedOpsPeriod {
  role: ComponentRole;
  concept: string;
  value: number;
  unit: ReportedFinancialFact["unit"];
  fact: ReportedFinancialFact;
}

export interface DiscontinuedOps {
  periods: DiscontinuedOpsPeriod[]; // only the component periods that report them
}

const ROLE_LABEL: Record<ComponentRole, string> = {
  fy: "FY",
  ytdCurrent: "current YTD",
  ytdPrior: "prior-year YTD",
};

export function findDiscontinuedOps(
  facts: readonly ReportedFinancialFact[],
  calc: LTMCalculation,
): DiscontinuedOps | null {
  const components: [ComponentRole, ReportedFinancialFact | undefined][] = [
    ["fy", calc.fy],
    ["ytdCurrent", calc.ytdCurrent],
    ["ytdPrior", calc.ytdPrior],
  ];
  const periods: DiscontinuedOpsPeriod[] = [];
  for (const [role, component] of components) {
    if (!component || component.period.kind !== "duration") continue;
    const key = { start: component.period.start, end: component.period.end };
    for (const concept of CONCEPTS.discontinuedOps) {
      const s = selectFact(facts, concept, key);
      if (s.kind === "found" && s.fact.value !== 0) {
        periods.push({
          role,
          concept,
          value: s.fact.value,
          unit: s.fact.unit,
          fact: s.fact,
        });
        break;
      }
    }
  }
  return periods.length ? { periods } : null;
}

// "FY 2025-01-01 to 2025-12-31: 150.0M; prior-year YTD …: (12.0)M"
export function describeDiscontinuedOps(d: DiscontinuedOps): string {
  return d.periods
    .map((p) => {
      const per = p.fact.period;
      const range =
        per.kind === "duration" ? `${per.start} to ${per.end}` : per.end;
      const amount =
        p.unit === "USD/shares"
          ? `${formatPerShare(p.value)} per diluted share`
          : `${formatMillions(p.value)}M`;
      return `${ROLE_LABEL[p.role]} ${range}: ${amount}`;
    })
    .join("; ");
}
