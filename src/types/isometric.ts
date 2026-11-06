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

// The props of an isometric primitive that can be interpolated smoothly.
// Grid placement (isoX/isoY/isoZ) and grid extents (width/height, lengthX/Y/Z)
// are deliberately absent: they index into the integer isometric grid, so an
// in-between value addresses no cell at all. An allow-list rather than an
// Omit<> of those keys, so a numeric prop added to a primitive later is not
// animatable until someone decides it should be.
export interface IsometricAnimatableProps
  extends IsometricTransformations,
    Pick<IsometricStyles, "opacity"> {}

export type IsometricTileAnimatableKeys = keyof IsometricAnimatableProps;

// IsometricView.addCuboidAt does not apply `scale` -- scaling each face about
// its own midpoint would pull the faces apart -- so it is not offered here.
export type IsometricCuboidAnimatableKeys = Exclude<
  IsometricTileAnimatableKeys,
  "scale"
>;
