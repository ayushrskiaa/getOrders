import { describe, expect, it } from "vitest";
import { formatInr } from "./money";

describe("formatInr", () => {
  it("formats INR without paise for dashboard totals", () => {
    expect(formatInr(8420)).toContain("8,420");
  });
});
