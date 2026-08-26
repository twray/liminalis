import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type { Bounds, LineProps } from "../types";

export const getLineBounds = (props: LineProps): Bounds => {
  const minX = Math.min(props.start.x, props.end.x);
  const minY = Math.min(props.start.y, props.end.y);
  const maxX = Math.max(props.start.x, props.end.x);
  const maxY = Math.max(props.start.y, props.end.y);

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export const line = (
  context: CanvasRenderingContext2D,
  props: LineProps,
): void => {
  const {
    start: { x: startX = 0, y: startY = 0 },
    end: { x: endX = 0, y: endY = 0 },
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const bounds = {
    x: minX,
    y: minY,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    context.strokeStyle = strokeStyle;
    context.lineWidth = strokeWidth;

    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    context.restore();
  });
};
