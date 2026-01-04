import { describe, it, expect } from "vitest";

describe("Extension Setup", () => {
  it("should pass basic test", () => {
    expect(true).toBe(true);
  });

  it("should verify test framework is working", () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
