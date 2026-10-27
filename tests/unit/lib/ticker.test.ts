import { describe, expect, it } from "vitest";
import { parseTickerInput } from "@/lib/ticker";

describe("parseTickerInput (home search)", () => {
  it.each([
    ["lii", "LII"],
    ["  wso ", "WSO"],
    ["brk-b", "BRK-B"],
    ["WSO.B", "WSO.B"],
  ])("accepts %j as %s", (raw, ticker) => {
    expect(parseTickerInput(raw)).toEqual({ ok: true, ticker });
  });

  it.each(["", "   ", "1ABC", "LII!", "ABCDEFGHIJK", "a b"])(
    "rejects %j with a message",
    (raw) => {
      const r = parseTickerInput(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    },
  );
});
