export interface Point2D {
  x: number;
  y: number;
}

export interface Dimensions2D {
  width: number;
  height: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Corners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface IsometricPosition {
  isoX: number;
  isoY: number;
  isoZ: number;
}

export interface BlockDimensions extends IsometricPosition {
  lengthX: number;
  lengthY: number;
  lengthZ: number;
}

export interface Dimensions3D {
  lengthX: number;
  lengthY: number;
  lengthZ: number;
}
