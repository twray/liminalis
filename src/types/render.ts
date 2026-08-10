import type { RenderIsometricMethods } from "../core/renderIsometricMethods";
import type { DrawMethods } from "../render";
import type { Point2D } from "./";

export type DrawCallback = (methods: DrawMethods) => void;
export type RenderIsometricCallback = (methods: RenderIsometricMethods) => void;

export interface RenderProps {
  context: CanvasRenderingContext2D;
  sceneWidth: number;
  sceneHeight: number;
  sceneCenter: Point2D;
  time: number;
  draw: (callback: DrawCallback) => void;
  renderIsometric: (callback: RenderIsometricCallback) => void;
}
