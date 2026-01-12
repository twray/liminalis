import type { DrawMethods } from "../core/drawMethods";
import type { RenderIsometricMethods } from "../core/renderIsometricMethods";
import type { Point2D } from "./";

export type DrawCallback = (methods: DrawMethods) => void;
export type RenderIsometricCallback = (methods: RenderIsometricMethods) => void;

export interface RenderProps {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  center: Point2D;
  time: number;
  draw: (callback: DrawCallback) => void;
  renderIsometric: (callback: RenderIsometricCallback) => void;
}
