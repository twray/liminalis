export interface FillStyles {
  fillStyle?: string;
}

export interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

export interface WithOpacity {
  opacity?: number;
}

export type PartialDrawStyles = Partial<
  FillStyles & StrokeStyles & WithOpacity
>;

export type PartialIsometricStyles = Partial<FillStyles & StrokeStyles>;
