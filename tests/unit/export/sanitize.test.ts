import { describe, expect, it } from "vitest";
import { text } from "@/export/sanitize";

// Spreadsheet formula injection (blueprint §15): text that a spreadsheet could read
// as a formula gets a leading apostrophe, so it stays inert text.

describe("text()", () => {
  it.each([
    ['=HYPERLINK("http://evil.example","click")'],
    ["+1+1"],
    ["-2+3"],
    ["@SUM(A1)"],
    ["\t=1+1"],
    ["\r=1+1"],
  ])("prefixes %j with an apostrophe", (s) => {
    expect(text(s)).toBe(`'${s}`);
  });

  it.each([["Lennox International Inc."], ["—"], ["NM"], ["3M Co"], [""]])(
    "leaves %j as it is",
    (s) => {
      expect(text(s)).toBe(s);
    },
  );

  it("always returns a string", () => {
    expect(typeof text("123")).toBe("string");
  });
});
