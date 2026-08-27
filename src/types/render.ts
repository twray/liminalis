import type {
  DrawMethods,
  IsometricMethods,
  IsometricOptions,
} from "../render";
import type { Point2D } from "./";

export type IsometricRenderCallback = (methods: IsometricMethods) => void;

export interface Measurements {
  width: number;
  height: number;
  center: Point2D;
}

export interface RenderProps {
  centerOf: DrawMethods["centerOf"];
  withStyles: DrawMethods["withStyles"];
  background: DrawMethods["background"];
  line: DrawMethods["line"];
  polygon: DrawMethods["polygon"];
  bezier: DrawMethods["bezier"];
  arc: DrawMethods["arc"];
  circle: DrawMethods["circle"];
  ellipse: DrawMethods["ellipse"];
  rect: DrawMethods["rect"];
  group: DrawMethods["group"];
  layer: DrawMethods["layer"];
  text: DrawMethods["text"];
  getTextBounds: DrawMethods["getTextBounds"];
  image: DrawMethods["image"];
  defineBackgroundProps: DrawMethods["defineBackgroundProps"];
  defineLineProps: DrawMethods["defineLineProps"];
  definePolygonProps: DrawMethods["definePolygonProps"];
  defineBezierProps: DrawMethods["defineBezierProps"];
  defineArcProps: DrawMethods["defineArcProps"];
  defineCircleProps: DrawMethods["defineCircleProps"];
  defineEllipseProps: DrawMethods["defineEllipseProps"];
  defineRectProps: DrawMethods["defineRectProps"];
  defineGroupProps: DrawMethods["defineGroupProps"];
  defineLayerProps: DrawMethods["defineLayerProps"];
  defineTextProps: DrawMethods["defineTextProps"];
  context: CanvasRenderingContext2D;
  hasMeasurements: true;
  measurements: Measurements;
  getMeasurements: () => Measurements;
  time: number;
  isometric: (
    callback: IsometricRenderCallback,
    options?: IsometricOptions,
  ) => void;
}
