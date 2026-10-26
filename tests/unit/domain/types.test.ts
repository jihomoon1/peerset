import { describe, expect, expectTypeOf, it } from "vitest";
import type { Metric } from "@/domain/types";

// Type-level guarantees for the Metric union (blueprint §11). These are enforced by
// `npm run typecheck`: a @ts-expect-error line that stops being an error fails tsc.

const missing: Metric = {
  status: "missing",
  reason: "no FY fact",
  warnings: [],
};

describe("Metric union", () => {
  it("cannot be read as a number before checking status", () => {
    const m = missing as Metric;
    // @ts-expect-error value does not exist on every member of the union
    const unchecked = m.value;
    expect(unchecked).toBeUndefined();
    expectTypeOf<Metric>().not.toHaveProperty("value");
  });

  it("exposes a number once narrowed to reported or derived", () => {
    const m = missing as Metric;
    if (m.status === "reported" || m.status === "derived") {
      expectTypeOf(m.value).toEqualTypeOf<number>();
      expectTypeOf(m.inputs).toBeArray();
    }
    expectTypeOf<
      Extract<Metric, { status: "reported" | "derived" }>["value"]
    >().toEqualTypeOf<number>();
  });

  it("keeps missing and unsupported free of any value", () => {
    expectTypeOf<Extract<Metric, { status: "missing" }>>().not.toHaveProperty(
      "value",
    );
    expectTypeOf<
      Extract<Metric, { status: "unsupported" }>
    >().not.toHaveProperty("value");
    expectTypeOf<
      Extract<Metric, { status: "unsupported" }>["reason"]
    >().toHaveProperty("code");
  });
});
