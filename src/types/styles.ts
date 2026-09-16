import type { FontSize, FontStyle, FontWeight } from "./text";

export interface FillStyles {
  fillStyle?: string;
}

export interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

export interface JoinableStrokeStyles {
  lineJoin?: "round" | "bevel" | "miter";
  miterLimit?: number;
}

export interface CappableStrokeStyles {
  lineCap?: "butt" | "round" | "square";
}

export type StrokeAlignment = "center" | "inside" | "outside";

export interface TextStyles {
  font?: string;
  fontStyle?: FontStyle;
  fontSize?: FontSize;
  fontWeight?: FontWeight;
  fontFamily?: string;
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
