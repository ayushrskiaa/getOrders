import { describe, expect, it } from "vitest";
import { escapeCsv } from "./csv";

describe("escapeCsv", () => {
  it("quotes commas and double quotes", () => {
    expect(escapeCsv('Milk, "organic"')).toBe('"Milk, ""organic"""');
  });

  it("leaves plain cells unquoted", () => {
    expect(escapeCsv("AMAZON")).toBe("AMAZON");
  });
});
