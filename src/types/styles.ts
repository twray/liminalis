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

// Opt-in stable identity for a primitive. Identity is positional (declaration
// order) by default, which is safe only while that order is stable between
// frames. Supply a key derived from your own data -- never the array index,
// which shifts exactly when the position does -- whenever a list can be
// reordered, prepended to, or have an item removed from anywhere but the end.
export interface WithIdentityKey {
  key?: string;
}

export interface WithFitMode {
  fit?: "cover" | "contain" | "stretch";
}

export type PartialDrawStyles = Partial<
  FillStyles & StrokeStyles & TextStyles & WithOpacity & WithBlend
>;

export type PartialIsometricStyles = Partial<FillStyles & StrokeStyles>;
