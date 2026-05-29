export interface FillStyles {
  fillStyle?: string;
}

export interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

export interface TextStyles {
  fontStyle?: string;
}

export interface WithOpacity {
  opacity?: number;
}

export type PartialDrawStyles = Partial<
  FillStyles & StrokeStyles & TextStyles & WithOpacity
>;

export type PartialIsometricStyles = Partial<FillStyles & StrokeStyles>;
