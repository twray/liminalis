export const PRIMITIVE_NAME = {
  WITH_STYLES: "withStyles",
  ISOMETRIC: "isometric",
  BACKGROUND: "background",
  LINE: "line",
  POLYGON: "polygon",
  BEZIER: "bezier",
  ARC: "arc",
  CIRCLE: "circle",
  ELLIPSE: "ellipse",
  RECT: "rect",
  GROUP: "group",
  LAYER: "layer",
  TEXT: "text",
  IMAGE: "image",
} as const;

export type PrimitiveName =
  (typeof PRIMITIVE_NAME)[keyof typeof PRIMITIVE_NAME];

export const ALL_PRIMITIVE_NAMES: readonly PrimitiveName[] =
  Object.values(PRIMITIVE_NAME);

export const OVERLAY_WARNING_NAMED_PRIMITIVES = [
  PRIMITIVE_NAME.BACKGROUND,
  PRIMITIVE_NAME.GROUP,
  PRIMITIVE_NAME.LAYER,
] as const;
