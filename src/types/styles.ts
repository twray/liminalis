import type { Property } from "csstype";

type SizeUnit =
  | "%"
  | "px"
  | "pt"
  | "pc"
  | "in"
  | "cm"
  | "mm"
  | "Q"
  | "em"
  | "rem"
  | "ex"
  | "rex"
  | "cap"
  | "rcap"
  | "ch"
  | "rch"
  | "ic"
  | "ric"
  | "lh"
  | "rlh"
  | "vw"
  | "vh"
  | "vi"
  | "vb"
  | "vmin"
  | "vmax"
  | "svw"
  | "svh"
  | "svi"
  | "svb"
  | "lvw"
  | "lvh"
  | "lvi"
  | "lvb"
  | "dvw"
  | "dvh"
  | "dvi"
  | "dvb"
  | "cqw"
  | "cqh"
  | "cqi"
  | "cqb"
  | "cqmin"
  | "cqmax";

type SizeValue = `${number}${SizeUnit}`;

export interface FillStyles {
  fillStyle?: string;
}

export interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

export type StrokeAlignment = "center" | "inside" | "outside";

export type FontFamily = Property.FontFamily;

export type FontSize = SizeValue;

export type FontWeight =
  | "normal"
  | "bold"
  | "bolder"
  | "lighter"
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

export type FontStyle =
  | "normal"
  | "italic"
  | "oblique"
  | `oblique ${number}deg`;

export interface TextStyles {
  fontStyle?: FontStyle;
  fontSize?: FontSize;
  fontWeight?: FontWeight;
  fontFamily?: FontFamily;
}

export interface WithOpacity {
  opacity?: number;
}

export interface WithBlend {
  blend?: GlobalCompositeOperation;
}

export type PartialDrawStyles = Partial<
  FillStyles & StrokeStyles & TextStyles & WithOpacity & WithBlend
>;

export type PartialIsometricStyles = Partial<FillStyles & StrokeStyles>;
