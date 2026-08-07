import type { Corners } from "../../../types";
import { isCorners } from "../../../util";
import {
  DEFAULT_BLEND_MODE,
  DEFAULT_FILL_STYLE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type { ClosedPathDescriptor, RectProps } from "../types";

const resolveRoundRectCornerRadius = (
  cornerRadius: Corners | number,
): number | [number, number, number, number] =>
  isCorners(cornerRadius)
    ? [
        cornerRadius.topLeft,
        cornerRadius.topRight,
        cornerRadius.bottomLeft,
        cornerRadius.bottomRight,
      ]
    : cornerRadius;

const tracePath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: Corners | number,
): void => {
  context.roundRect(
    x,
    y,
    width,
    height,
    resolveRoundRectCornerRadius(cornerRadius),
  );
};

export const rect = (
  context: CanvasRenderingContext2D,
  props: RectProps,
): void => {
  const {
    x = 0,
    y = 0,
    width,
    height,
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = "center",
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    cornerRadius = 0,
  } = props;

  if (width < 0.5 || height < 0.5) {
    return;
  }

  const bounds = { x, y, width, height };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.beginPath();
      tracePath(context, x, y, width, height, cornerRadius);
      context.fill();
    }

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      let strokeX = x;
      let strokeY = y;
      let strokeWidthDim = width;
      let strokeHeight = height;

      if (strokeAlignment === "inside") {
        const inset = strokeWidth / 2;
        strokeX = x + inset;
        strokeY = y + inset;
        strokeWidthDim = width - strokeWidth;
        strokeHeight = height - strokeWidth;
      } else if (strokeAlignment === "outside") {
        const outset = strokeWidth / 2;
        strokeX = x - outset;
        strokeY = y - outset;
        strokeWidthDim = width + strokeWidth;
        strokeHeight = height + strokeWidth;
      }

      if (strokeWidthDim > 0 && strokeHeight > 0) {
        context.beginPath();
        tracePath(
          context,
          strokeX,
          strokeY,
          strokeWidthDim,
          strokeHeight,
          cornerRadius,
        );
        context.stroke();
      }
    }

    context.restore();
  });
};

export const rectPathDescriptor = (props: RectProps): ClosedPathDescriptor => {
  const { x = 0, y = 0, width, height, cornerRadius = 0 } = props;

  return {
    bounds: { x, y, width, height },
    isValid: width >= 0.5 && height >= 0.5,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(context, x, y, width, height, cornerRadius);
    },
  };
};
