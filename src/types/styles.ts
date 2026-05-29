export interface FillStyles {
  fillStyle?: string;
}

export interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

export type StrokeAlignment = "center" | "inside" | "outside";

export interface TextStyles {
  fontStyle?: string;
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
