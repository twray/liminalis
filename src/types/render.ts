import type { DrawMethods } from "../render";

// Every DrawMethods member is designed to be exposed to renderable
// callbacks (onRender, visual()), so RenderProps extends it directly rather
// than hand-copying members one by one — a prior version did that, and it
// silently fell out of sync with DrawMethods (missing newly-added
// primitives like place()) since nothing enforced the two stayed aligned.
export interface RenderProps extends DrawMethods {
  context: CanvasRenderingContext2D;
  hasMeasurements: true;
  time: number;
}
