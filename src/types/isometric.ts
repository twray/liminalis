export type IsometricTileFaceType = "base" | "side-right" | "side-left";

export interface IsometricPosition {
  isoX: number;
  isoY: number;
  isoZ: number;
}

export interface IsometricDimensions {
  lengthX: number;
  lengthY: number;
  lengthZ: number;
}

export interface IsometricStyles {
  fillStyle?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface IsometricTransformations {
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  scale?: number;
}

export interface IsometricTile
  extends IsometricPosition,
    IsometricStyles,
    IsometricTransformations {
  type: IsometricTileFaceType;
  width: number;
  height: number;
}

export interface IsometricCuboid
  extends IsometricPosition,
    IsometricDimensions,
    IsometricStyles,
    IsometricTransformations {}

export type IsometricObject = IsometricTile | IsometricCuboid;
