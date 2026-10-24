import { describe, expect, it } from "vitest";

// Proves the test runner works. Financial tests arrive in M1.
describe("test runner", () => {
  it("runs a TypeScript test", () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
