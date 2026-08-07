import { clampNonNegativeValue } from "../../../util";
import type { ClosedPathDescriptor, EllipseProps } from "../types";
import { arc } from "./arc";

const tracePath = (
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  startAngle = 0,
  endAngle = Math.PI * 2,
): void => {
  context.ellipse(cx, cy, radiusX, radiusY, 0, startAngle, endAngle);
};

export const ellipse = (
  context: CanvasRenderingContext2D,
  props: EllipseProps,
): void => {
  arc(context, { ...props, start: 0, end: 360 });
};

export const ellipsePathDescriptor = (
  props: EllipseProps,
): ClosedPathDescriptor => {
  const radiusX = clampNonNegativeValue(props.radiusX);
  const radiusY = clampNonNegativeValue(props.radiusY);
  const { cx, cy } = props;

  return {
    bounds: {
      x: cx - radiusX,
      y: cy - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
    },
    isValid: radiusX >= 0.5 && radiusY >= 0.5,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(context, cx, cy, radiusX, radiusY);
    },
  };
};
