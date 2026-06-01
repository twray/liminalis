import { clampWithinRange } from "./common.js";

type RgbTuple = [number, number, number];
type HslTuple = [number, number, number];

let colorParserContext: CanvasRenderingContext2D | null | undefined;

export function parseColorToRgb(colorValue: string): RgbTuple {
  const normalizedColor = colorValue.trim();

  if (normalizedColor.toLowerCase() === "transparent") {
    return [0, 0, 0];
  }

  const parsedColor =
    parseHexColor(normalizedColor) ??
    parseRgbColor(normalizedColor) ??
    parseHslColor(normalizedColor) ??
    parseColorWithCanvas(normalizedColor);

  return parsedColor ?? [0, 0, 0];
}

export function offsetColorHsl(
  baseColor: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): RgbTuple {
  const [red, green, blue] = parseColorToRgb(baseColor);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);

  const adjustedHue = normalizeHue(hue + hueOffset);
  const adjustedSaturation = clampWithinRange(
    saturation + saturationOffset,
    0,
    100,
  );
  const adjustedLightness = clampWithinRange(
    lightness + lightnessOffset,
    0,
    100,
  );

  return hslToRgb(adjustedHue, adjustedSaturation, adjustedLightness);
}

function parseHexColor(colorValue: string): RgbTuple | null {
  if (!colorValue.startsWith("#")) {
    return null;
  }

  const hex = colorValue.slice(1).trim();

  if (!/^[\da-f]+$/i.test(hex)) {
    return null;
  }

  if (hex.length === 3 || hex.length === 4) {
    const expandedHex = hex
      .slice(0, 3)
      .split("")
      .map((character) => `${character}${character}`)
      .join("");

    return [
      parseInt(expandedHex.slice(0, 2), 16),
      parseInt(expandedHex.slice(2, 4), 16),
      parseInt(expandedHex.slice(4, 6), 16),
    ];
  }

  if (hex.length === 6 || hex.length === 8) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  return null;
}

function parseRgbColor(colorValue: string): RgbTuple | null {
  const match = colorValue.match(/^rgba?\((.+)\)$/i);

  if (!match || !match[1]) {
    return null;
  }

  const channels = splitCssFunctionParameters(match[1]).slice(0, 3);

  if (channels.length !== 3) {
    return null;
  }

  const parsedChannels = channels.map(parseRgbChannel);

  if (parsedChannels.some((channel) => channel === null)) {
    return null;
  }

  return [
    parsedChannels[0] as number,
    parsedChannels[1] as number,
    parsedChannels[2] as number,
  ];
}

function parseHslColor(colorValue: string): RgbTuple | null {
  const match = colorValue.match(/^hsla?\((.+)\)$/i);

  if (!match || !match[1]) {
    return null;
  }

  const channels = splitCssFunctionParameters(match[1]).slice(0, 3);

  if (channels.length !== 3) {
    return null;
  }

  const hue = parseHue(channels[0]);
  const saturation = parsePercentage(channels[1]);
  const lightness = parsePercentage(channels[2]);

  if (hue === null || saturation === null || lightness === null) {
    return null;
  }

  return hslToRgb(hue, saturation, lightness);
}

function parseColorWithCanvas(colorValue: string): RgbTuple | null {
  const parserContext = getColorParserContext();

  if (!parserContext) {
    return null;
  }

  const sentinelColor = "rgb(1, 2, 3)";
  parserContext.fillStyle = sentinelColor;
  parserContext.fillStyle = colorValue;

  const parsedColor = parserContext.fillStyle;

  if (parsedColor === sentinelColor && !isSentinelColorInput(colorValue)) {
    return null;
  }

  return parseHexColor(parsedColor) ?? parseRgbColor(parsedColor);
}

function getColorParserContext(): CanvasRenderingContext2D | null {
  if (colorParserContext !== undefined) {
    return colorParserContext;
  }

  if (typeof document === "undefined") {
    colorParserContext = null;
    return colorParserContext;
  }

  const parserCanvas = document.createElement("canvas");
  colorParserContext = parserCanvas.getContext("2d");

  return colorParserContext;
}

function isSentinelColorInput(colorValue: string): boolean {
  const normalizedColor = colorValue.replace(/\s+/g, "").toLowerCase();

  return (
    normalizedColor === "rgb(1,2,3)" || normalizedColor === "rgba(1,2,3,1)"
  );
}

function splitCssFunctionParameters(parameters: string): string[] {
  const normalizedParameters = parameters.replace(/\//g, " ").trim();

  if (normalizedParameters.includes(",")) {
    return normalizedParameters
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return normalizedParameters.split(/\s+/).filter(Boolean);
}

function parseRgbChannel(channelValue: string): number | null {
  if (channelValue.endsWith("%")) {
    const percentage = Number.parseFloat(channelValue.slice(0, -1));

    if (!Number.isFinite(percentage)) {
      return null;
    }

    return clampByte((percentage / 100) * 255);
  }

  const value = Number.parseFloat(channelValue);

  if (!Number.isFinite(value)) {
    return null;
  }

  return clampByte(value);
}

function parseHue(hueValue: string): number | null {
  const normalizedHueValue = hueValue.trim().toLowerCase().replace(/deg$/, "");
  const parsedHue = Number.parseFloat(normalizedHueValue);

  if (!Number.isFinite(parsedHue)) {
    return null;
  }

  return normalizeHue(parsedHue);
}

function parsePercentage(percentageValue: string): number | null {
  const normalizedValue = percentageValue.trim();
  const value = normalizedValue.endsWith("%")
    ? Number.parseFloat(normalizedValue.slice(0, -1))
    : Number.parseFloat(normalizedValue);

  if (!Number.isFinite(value)) {
    return null;
  }

  return clampWithinRange(value, 0, 100);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function rgbToHsl(red: number, green: number, blue: number): HslTuple {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;

  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);

  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;

    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case normalizedRed:
        hue = (normalizedGreen - normalizedBlue) / delta;
        if (normalizedGreen < normalizedBlue) {
          hue += 6;
        }
        break;
      case normalizedGreen:
        hue = (normalizedBlue - normalizedRed) / delta + 2;
        break;
      default:
        hue = (normalizedRed - normalizedGreen) / delta + 4;
        break;
    }

    hue /= 6;
  }

  return [hue * 360, saturation * 100, lightness * 100];
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): RgbTuple {
  const normalizedHue = normalizeHue(hue) / 360;
  const normalizedSaturation = clampWithinRange(saturation, 0, 100) / 100;
  const normalizedLightness = clampWithinRange(lightness, 0, 100) / 100;

  if (normalizedSaturation === 0) {
    const gray = clampByte(normalizedLightness * 255);
    return [gray, gray, gray];
  }

  const q =
    normalizedLightness < 0.5
      ? normalizedLightness * (1 + normalizedSaturation)
      : normalizedLightness +
        normalizedSaturation -
        normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;

  const red = hueToRgb(p, q, normalizedHue + 1 / 3);
  const green = hueToRgb(p, q, normalizedHue);
  const blue = hueToRgb(p, q, normalizedHue - 1 / 3);

  return [clampByte(red * 255), clampByte(green * 255), clampByte(blue * 255)];
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalizedT = t;

  if (normalizedT < 0) {
    normalizedT += 1;
  }

  if (normalizedT > 1) {
    normalizedT -= 1;
  }

  if (normalizedT < 1 / 6) {
    return p + (q - p) * 6 * normalizedT;
  }

  if (normalizedT < 1 / 2) {
    return q;
  }

  if (normalizedT < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalizedT) * 6;
  }

  return p;
}

function clampByte(value: number): number {
  return Math.round(clampWithinRange(value, 0, 255));
}
