import { describe, expect, it } from "vitest";
import { inferCategory } from "./categories";

describe("inferCategory", () => {
  it("maps grocery-like items", () => {
    expect(inferCategory("Milk and brown bread")).toBe("GROCERIES");
  });

  it("maps electronics-like items", () => {
    expect(inferCategory("USB-C laptop charger")).toBe("ELECTRONICS");
  });

  it("falls back to other", () => {
    expect(inferCategory("mystery item")).toBe("OTHER");
  });
});
