import { clampNonNegativeValue } from "../../util";
import type { CircleProps, ClosedPathDescriptor } from "../types";
import { arc } from "./arc";

const tracePath = (
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle = 0,
  endAngle = Math.PI * 2,
): void => {
  context.arc(cx, cy, radius, startAngle, endAngle);
};

export const circle = (
  context: CanvasRenderingContext2D,
  props: CircleProps,
): void => {
  arc(context, { ...props, start: 0, end: 360 });
};

export const circlePathDescriptor = (
  props: CircleProps,
): ClosedPathDescriptor => {
  const radius = clampNonNegativeValue(props.radius);
  const { cx, cy } = props;

  return {
    bounds: {
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
    },
    isValid: radius >= 0.5,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(context, cx, cy, radius);
    },
  };
};
