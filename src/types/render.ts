import type { RenderIsometricMethods } from "../core/renderIsometricMethods";
import type { DrawMethods } from "../render";
import type { Point2D } from "./";

export type DrawCallback = (methods: DrawMethods) => void;
export type RenderIsometricCallback = (methods: RenderIsometricMethods) => void;

export interface Measurements {
  width: number;
  height: number;
  center: Point2D;
}

export interface RenderProps {
  context: CanvasRenderingContext2D;
  hasMeasurements: boolean;
  getMeasurements: () => Measurements;
  time: number;
  draw: (callback: DrawCallback) => void;
  renderIsometric: (callback: RenderIsometricCallback) => void;
}
