import { describe, expect, it } from "vitest";
import { offsetColorHsl, parseColorToRgb } from "./color";

describe("color utilities", () => {
  it("parses hex colors", () => {
    expect(parseColorToRgb("#0f8")).toEqual([0, 255, 136]);
    expect(parseColorToRgb("#ff8800")).toEqual([255, 136, 0]);
  });

  it("parses rgb and hsl colors", () => {
    expect(parseColorToRgb("rgb(100%, 50%, 0%)")).toEqual([255, 128, 0]);
    expect(parseColorToRgb("hsl(120, 100%, 50%)")).toEqual([0, 255, 0]);
  });

  it("applies hsl lightness offsets", () => {
    expect(offsetColorHsl("#808080", 0, 0, 10)).toEqual([154, 154, 154]);
    expect(offsetColorHsl("#808080", 0, 0, -10)).toEqual([103, 103, 103]);
  });

  it("returns black for unsupported colors in non-browser contexts", () => {
    expect(parseColorToRgb("not-a-real-color")).toEqual([0, 0, 0]);
  });
});
