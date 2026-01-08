import type { DrawMethods } from "../core/drawMethods";
import type { RenderIsometricMethods } from "../core/renderIsometricMethods";
import type { AnimationOptions, Point2D } from "./";

export type DrawCallback = (methods: DrawMethods) => void;
export type RenderIsometricCallback = (methods: RenderIsometricMethods) => void;

export interface RenderProps {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  center: Point2D;
  animate: (options: AnimationOptions | AnimationOptions[]) => number;
  draw: (callback: DrawCallback) => void;
  renderIsometric: (callback: RenderIsometricCallback) => void;
}
