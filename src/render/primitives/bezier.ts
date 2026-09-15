import type { Point2D } from "../../types";
import {
  DEFAULT_BLEND_MODE,
  DEFAULT_FILL_STYLE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  EMPTY_BOUNDS,
  deriveBoundsFromPoints,
  renderWithTransform,
  resolveTransformState,
  setContextGlobals,
  transformPoint,
} from "../common";
import type {
  BezierCurveSegment,
  BezierProps,
  BezierStartSegment,
  Bounds,
  ClosedPathDescriptor,
  CubicBezierSegment,
  QuadraticBezierSegment,
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

const isQuadraticBezierSegment = (
  segment: BezierCurveSegment,
): segment is QuadraticBezierSegment => isPoint2D(segment.control);

const isCubicBezierSegment = (
  segment: BezierCurveSegment,
): segment is CubicBezierSegment =>
  Array.isArray(segment.control) &&
  segment.control.length === 2 &&
  segment.control.every((control) => isPoint2D(control));

const quadraticBezierFunction = (
  t: number,
  p0: number,
  p1: number,
  p2: number,
) => Math.pow(1 - t, 2) * p0 + 2 * (1 - t) * t * p1 + Math.pow(t, 2) * p2;

const cubicBezierFunction = (
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
) =>
  Math.pow(1 - t, 3) * p0 +
  3 * Math.pow(1 - t, 2) * t * p1 +
  3 * (1 - t) * Math.pow(t, 2) * p2 +
  Math.pow(t, 3) * p3;

const evaluateBezierPoint = (
  startPoint: Point2D,
  segment: BezierCurveSegment,
  t: number,
): Point2D => {
  if (isQuadraticBezierSegment(segment)) {
    return {
      x: quadraticBezierFunction(
        t,
        startPoint.x,
        segment.control.x,
        segment.point.x,
      ),
      y: quadraticBezierFunction(
        t,
        startPoint.y,
        segment.control.y,
        segment.point.y,
      ),
    };
  }

  if (isCubicBezierSegment(segment)) {
    return {
      x: cubicBezierFunction(
        t,
        startPoint.x,
        segment.control[0].x,
        segment.control[1].x,
        segment.point.x,
      ),
      y: cubicBezierFunction(
        t,
        startPoint.y,
        segment.control[0].y,
        segment.control[1].y,
        segment.point.y,
      ),
    };
  }

  throw new Error("Invalid bezier curve segment provided");
};

const getQuadraticCriticalT = (
  p0: number,
  p1: number,
  p2: number,
): number | null => {
  const denominator = p0 - 2 * p1 + p2;
  return denominator !== 0 ? (p0 - p1) / denominator : null;
};

const getCubicCriticalTs = (
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number[] => {
  const d0 = p1 - p0;
  const d1 = p2 - p1;
  const d2 = p3 - p2;

  const a = d0 - 2 * d1 + d2;
  const b = 2 * (d1 - d0);
  const c = d0;

  if (a === 0) {
    return b !== 0 ? [-c / b] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  const sqrtDiscriminant = Math.sqrt(discriminant);
  return [(-b + sqrtDiscriminant) / (2 * a), (-b - sqrtDiscriminant) / (2 * a)];
};

const getSegmentCriticalTs = (
  startPoint: Point2D,
  segment: BezierCurveSegment,
): number[] => {
  const onlyValidRoots = (t: number | null): t is number =>
    t !== null && t > 0 && t < 1;

  if (isCubicBezierSegment(segment)) {
    const [control1, control2] = segment.control;

    return [
      ...getCubicCriticalTs(
        startPoint.x,
        control1.x,
        control2.x,
        segment.point.x,
      ),
      ...getCubicCriticalTs(
        startPoint.y,
        control1.y,
        control2.y,
        segment.point.y,
      ),
    ].filter((t) => t > 0 && t < 1);
  }

  return [
    getQuadraticCriticalT(startPoint.x, segment.control.x, segment.point.x),
    getQuadraticCriticalT(startPoint.y, segment.control.y, segment.point.y),
  ].filter(onlyValidRoots);
};

export const getTightSegmentBounds = (
  startPoint: Point2D,
  segment: BezierCurveSegment,
): Bounds => {
  const candidateTs = [0, 1, ...getSegmentCriticalTs(startPoint, segment)];

  return deriveBoundsFromPoints(
    candidateTs.map((t) => evaluateBezierPoint(startPoint, segment, t)),
  );
};

export const getTightBezierBounds = (
  startPoint: Point2D,
  curveSegments: BezierCurveSegment[],
): Bounds => {
  let segmentStart = startPoint;
  const segmentBoundsCorners: Point2D[] = [];

  for (const segment of curveSegments) {
    const segmentBounds = getTightSegmentBounds(segmentStart, segment);

    segmentBoundsCorners.push(
      { x: segmentBounds.x, y: segmentBounds.y },
      {
        x: segmentBounds.x + segmentBounds.width,
        y: segmentBounds.y + segmentBounds.height,
      },
    );

    segmentStart = segment.point;
  }

  return deriveBoundsFromPoints(segmentBoundsCorners);
};

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

  return {
    startPoint,
    curveSegments: validatedCurveSegments,
    shouldClosePath,
    bounds: getTightBezierBounds(startPoint, validatedCurveSegments),
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
      bounds: EMPTY_BOUNDS,
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

export const getBezierTransformedAABB = (props: BezierProps): Bounds => {
  const computedValues = getComputedValuesFromProps(props);

  if (!computedValues) return EMPTY_BOUNDS;

  const { startPoint, curveSegments } = computedValues;
  const tightBounds = getTightBezierBounds(startPoint, curveSegments);

  const transformState = resolveTransformState(props, tightBounds);
  const { hasRotate, hasScale } = transformState;

  if (!hasRotate && !hasScale) return tightBounds;

  const transformedStartPoint = transformPoint(startPoint, transformState);
  const transformedSegments: BezierCurveSegment[] = curveSegments.map(
    (segment) =>
      isCubicBezierSegment(segment)
        ? {
            control: [
              transformPoint(segment.control[0], transformState),
              transformPoint(segment.control[1], transformState),
            ] as [Point2D, Point2D],
            point: transformPoint(segment.point, transformState),
          }
        : {
            control: transformPoint(segment.control, transformState),
            point: transformPoint(segment.point, transformState),
          },
  );

  return getTightBezierBounds(transformedStartPoint, transformedSegments);
};
