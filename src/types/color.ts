export interface ColorPalette {
  name: string;
  colors: string[];
}

export interface ColorPalettes extends Array<ColorPalette> {}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface HSLColor {
  h: number;
  s: number;
  l: number;
}

export interface ParsedColor {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
}
