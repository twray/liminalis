import type { Point2D } from "../../types";
import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type { Bounds, ClosedPathDescriptor, PolygonProps } from "../types";

type PolygonComputedValues = {
  shouldClosePath: boolean;
  bounds: Bounds;
};

const getComputedValuesFromProps = (
  props: PolygonProps,
): PolygonComputedValues => {
  const { points, closePath = false } = props;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const pointsAlreadyClosed =
    firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y;
  const shouldClosePath = closePath || pointsAlreadyClosed;

  const minX = Math.min(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxX = Math.max(...points.map(({ x }) => x));
  const maxY = Math.max(...points.map(({ y }) => y));

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  return { shouldClosePath, bounds };
};

const tracePath = (
  context: CanvasRenderingContext2D,
  points: Point2D[],
  shouldClosePath: boolean,
): void => {
  if (points.length === 0) {
    return;
  }

  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    context.lineTo(point.x, point.y);
  }

  if (shouldClosePath) {
    context.closePath();
  }
};

export const polygon = (
  context: CanvasRenderingContext2D,
  props: PolygonProps,
): void => {
  const {
    points,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;
  const computedValues = getComputedValuesFromProps(props);
  const { shouldClosePath, bounds } = computedValues;

  if (points.length < 2) {
    return;
  }

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      const canApplyStrokeAlignment = shouldClosePath;

      if (canApplyStrokeAlignment && strokeAlignment === "inside") {
        context.lineWidth = strokeWidth * 2;

        context.save();
        context.beginPath();
        tracePath(context, points, true);
        context.clip();

        context.beginPath();
        tracePath(context, points, true);
        context.stroke();
        context.restore();
      } else if (canApplyStrokeAlignment && strokeAlignment === "outside") {
        context.lineWidth = strokeWidth * 2;

        const clipPadding = strokeWidth * 2;

        context.save();
        context.beginPath();
        context.rect(
          bounds.x - clipPadding,
          bounds.y - clipPadding,
          bounds.width + clipPadding * 2,
          bounds.height + clipPadding * 2,
        );
        tracePath(context, points, true);
        context.clip("evenodd");

        context.beginPath();
        tracePath(context, points, true);
        context.stroke();
        context.restore();
      } else {
        context.beginPath();
        tracePath(context, points, shouldClosePath);
        context.stroke();
      }
    }

    context.restore();
  });
};

export const polygonPathDescriptor = (
  props: PolygonProps,
): ClosedPathDescriptor => {
  const { points } = props;
  const { shouldClosePath, bounds } = getComputedValuesFromProps(props);

  const hasValidPointSet = points.length >= 2 && shouldClosePath;

  if (!hasValidPointSet) {
    return {
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      isValid: false,
      tracePath: () => {
        // no-op for invalid clip descriptors
      },
    };
  }

  return {
    bounds,
    isValid: true,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(context, points, true);
    },
  };
};
