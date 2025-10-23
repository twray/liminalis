import palettes from "../data/colorPalletes.json";
import type { ColorPalettes } from "../types/index.js";

export const PALETTE_NAMES = {
  SUNRISE: "sunrise",
  GREY_SKIES: "grey-skies",
  BRIGHTNESS: "brightness",
} as const;

export type PaletteName = (typeof PALETTE_NAMES)[keyof typeof PALETTE_NAMES];

export function getPaletteByName(name: PaletteName): string[] {
  const palette = (palettes as ColorPalettes).find((p) => p.name === name);
  return palette?.colors ?? [];
}
