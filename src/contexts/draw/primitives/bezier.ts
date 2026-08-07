import type { Point2D } from "../../../types";
import {
  DEFAULT_BLEND_MODE,
  DEFAULT_FILL_STYLE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type {
  BezierCurveSegment,
  BezierProps,
  BezierStartSegment,
  ClosedPathDescriptor,
  CubicBezierSegment,
} from "../types";

interface BezierComputedValues {
  startPoint: Point2D;
  curveSegments: BezierCurveSegment[];
  shouldClosePath: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

const isPoint2D = (value: unknown): value is Point2D =>
  typeof value === "object" &&
  value !== null &&
  "x" in value &&
  "y" in value &&
  typeof value.x === "number" &&
  typeof value.y === "number";

const isBezierStartSegment = (value: unknown): value is BezierStartSegment => {
  if (typeof value !== "object" || value === null || !("point" in value)) {
    return false;
  }

  if ("control" in value) {
    return false;
  }

  return isPoint2D(value.point);
};

const isBezierCurveSegment = (value: unknown): value is BezierCurveSegment => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("control" in value) ||
    !("point" in value)
  ) {
    return false;
  }

  if (!isPoint2D(value.point)) {
    return false;
  }

  if (Array.isArray(value.control)) {
    return (
      value.control.length === 2 &&
      isPoint2D(value.control[0]) &&
      isPoint2D(value.control[1])
    );
  }

  return isPoint2D(value.control);
};

const isCubicBezierSegment = (
  segment: BezierCurveSegment,
): segment is CubicBezierSegment => Array.isArray(segment.control);

const getComputedValuesFromProps = (
  props: BezierProps,
): BezierComputedValues | null => {
  const { segments, closePath = false } = props;

  if (segments.length < 2) {
    return null;
  }

  const [startSegment, ...curveSegments] = segments;
  const validatedCurveSegments = curveSegments.filter(isBezierCurveSegment);

  if (
    !isBezierStartSegment(startSegment) ||
    validatedCurveSegments.length !== curveSegments.length
  ) {
    return null;
  }

  const startPoint = startSegment.point;
  const pathEnd =
    validatedCurveSegments[validatedCurveSegments.length - 1].point;
  const pathAlreadyClosed =
    startPoint.x === pathEnd.x && startPoint.y === pathEnd.y;
  const shouldClosePath = closePath || pathAlreadyClosed;

  const points: Point2D[] = [startPoint];

  for (const segment of validatedCurveSegments) {
    if (!isCubicBezierSegment(segment)) {
      points.push(segment.control, segment.point);
    } else {
      points.push(...segment.control, segment.point);
    }
  }

  const minX = Math.min(...points.map(({ x }) => x));
  const minY = Math.min(...points.map(({ y }) => y));
  const maxX = Math.max(...points.map(({ x }) => x));
  const maxY = Math.max(...points.map(({ y }) => y));

  return {
    startPoint,
    curveSegments: validatedCurveSegments,
    shouldClosePath,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
};

const tracePath = (
  context: CanvasRenderingContext2D,
  startPoint: Point2D,
  curveSegments: BezierCurveSegment[],
  shouldClosePath: boolean,
): void => {
  context.moveTo(startPoint.x, startPoint.y);

  for (const segment of curveSegments) {
    if (!isCubicBezierSegment(segment)) {
      context.quadraticCurveTo(
        segment.control.x,
        segment.control.y,
        segment.point.x,
        segment.point.y,
      );
    } else {
      const [control1, control2] = segment.control;

      context.bezierCurveTo(
        control1.x,
        control1.y,
        control2.x,
        control2.y,
        segment.point.x,
        segment.point.y,
      );
    }
  }

  if (shouldClosePath) {
    context.closePath();
  }
};

export const bezier = (
  context: CanvasRenderingContext2D,
  props: BezierProps,
): void => {
  const {
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const computedValues = getComputedValuesFromProps(props);

  if (!computedValues) {
    return;
  }

  const { startPoint, curveSegments, shouldClosePath, bounds } = computedValues;

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.beginPath();
      tracePath(context, startPoint, curveSegments, shouldClosePath);
      context.fill();
    }

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      const canApplyStrokeAlignment = shouldClosePath;

      if (canApplyStrokeAlignment && strokeAlignment === "inside") {
        context.lineWidth = strokeWidth * 2;

        context.save();
        context.beginPath();
        tracePath(context, startPoint, curveSegments, true);
        context.clip();

        context.beginPath();
        tracePath(context, startPoint, curveSegments, true);
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
        tracePath(context, startPoint, curveSegments, true);
        context.clip("evenodd");

        context.beginPath();
        tracePath(context, startPoint, curveSegments, true);
        context.stroke();
        context.restore();
      } else {
        context.beginPath();
        tracePath(context, startPoint, curveSegments, shouldClosePath);
        context.stroke();
      }
    }

    context.restore();
  });
};

export const bezierPathDescriptor = (
  props: BezierProps,
): ClosedPathDescriptor => {
  const computedValues = getComputedValuesFromProps(props);

  if (!computedValues || !computedValues.shouldClosePath) {
    return {
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      isValid: false,
      tracePath: () => {
        // no-op for invalid clip descriptors
      },
    };
  }

  const { startPoint, curveSegments, bounds } = computedValues;

  return {
    bounds,
    isValid: true,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(context, startPoint, curveSegments, true);
    },
  };
};
