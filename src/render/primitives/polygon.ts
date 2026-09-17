import type { Point2D } from "../../types";
import {
  computeTransformedMultipointAABB,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_LINE_CAP,
  DEFAULT_STROKE_LINE_JOIN,
  DEFAULT_STROKE_MITER_LIMIT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  deriveBoundsFromPoints,
  EMPTY_BOUNDS,
  getLinearPartOfTransform,
  getMiterTipCandidates,
  getRowNorms,
  hasVisibleStroke,
  renderWithTransform,
  resolveStrokeOutwardOffset,
  resolveTransformState,
  setContextGlobals,
  transformPoint,
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
    lineJoin = DEFAULT_STROKE_LINE_JOIN,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
    lineCap = DEFAULT_STROKE_LINE_CAP,
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
      context.lineJoin = lineJoin;
      context.miterLimit = miterLimit;
      context.lineCap = lineCap;

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
      bounds: EMPTY_BOUNDS,
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

// Every vertex of a closed polygon has a join (the ring wraps around); an
// open polygon's two endpoints are free ends instead (handled by lineCap,
// not lineJoin), so only its interior vertices get a join.
const getMiterTipCandidatesForPolygon = (
  points: Point2D[],
  shouldClosePath: boolean,
  nativeStrokeWidth: number,
  miterLimit: number,
): Point2D[] => {
  const pointCount = points.length;
  const firstJointIndex = shouldClosePath ? 0 : 1;
  const lastJointIndex = shouldClosePath ? pointCount - 1 : pointCount - 2;

  const candidates: Point2D[] = [];

  for (let index = firstJointIndex; index <= lastJointIndex; index++) {
    const previousPoint = points[(index - 1 + pointCount) % pointCount];
    const vertex = points[index];
    const nextPoint = points[(index + 1) % pointCount];

    // Both point AWAY from the vertex, out along their own edge.
    const edgeDirectionToPrevious = {
      x: previousPoint.x - vertex.x,
      y: previousPoint.y - vertex.y,
    };
    const edgeDirectionToNext = {
      x: nextPoint.x - vertex.x,
      y: nextPoint.y - vertex.y,
    };

    candidates.push(
      ...getMiterTipCandidates(
        vertex,
        edgeDirectionToPrevious,
        edgeDirectionToNext,
        nativeStrokeWidth,
        miterLimit,
      ),
    );
  }

  return candidates;
};

export const getPolygonTransformedAABB = (props: PolygonProps): Bounds => {
  const {
    points,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    lineJoin = DEFAULT_STROKE_LINE_JOIN,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
  } = props;
  if (points.length <= 2) return EMPTY_BOUNDS;

  const bounds = computeTransformedMultipointAABB(points, props);

  if (!hasVisibleStroke({ strokeStyle, strokeWidth })) return bounds;

  // Round-pen baseline: dilating the fill geometry's boundary by an
  // isotropic pen is a Minkowski sum with a disk, which simply grows an
  // already-tight AABB uniformly -- exact, not an approximation -- so this
  // covers every edge's own contribution (and every round/bevel join's)
  // regardless of corner sharpness. Row-norm-scaled per axis for non-
  // uniform scale/rotation (Section 3 / Step 1); any probe point works
  // since the linear part is constant across an affine transform.
  const extent = resolveStrokeOutwardOffset(strokeWidth, strokeAlignment);
  const transformState = resolveTransformState(props, bounds);
  const { columnX, columnY } = getLinearPartOfTransform(
    points[0],
    transformState,
  );
  const { rowNormX, rowNormY } = getRowNorms(columnX, columnY);
  const padX = extent * rowNormX;
  const padY = extent * rowNormY;

  const paddedBounds: Bounds = {
    x: bounds.x - padX,
    y: bounds.y - padY,
    width: bounds.width + padX * 2,
    height: bounds.height + padY * 2,
  };

  if (lineJoin !== "miter" || strokeAlignment === "inside") {
    return paddedBounds;
  }

  // A miter spike is an ADDITIONAL protrusion beyond the round-pen
  // baseline, only at corners -- so union the exact tip candidates in
  // rather than replacing the baseline with them. "outside" strokes at
  // strokeWidth*2 before clipping away the inward half (Section 3), so
  // that's the width canvas's own miter formula actually sees; "center"
  // uses the native, undoubled width.
  const { shouldClosePath } = getComputedValuesFromProps(props);
  const nativeStrokeWidth =
    strokeAlignment === "outside" ? strokeWidth * 2 : strokeWidth;

  const transformedTipCandidates = getMiterTipCandidatesForPolygon(
    points,
    shouldClosePath,
    nativeStrokeWidth,
    miterLimit,
  ).map((tip) => transformPoint(tip, transformState));

  if (transformedTipCandidates.length === 0) return paddedBounds;

  const paddedBoundsCorners: Point2D[] = [
    { x: paddedBounds.x, y: paddedBounds.y },
    { x: paddedBounds.x + paddedBounds.width, y: paddedBounds.y },
    {
      x: paddedBounds.x + paddedBounds.width,
      y: paddedBounds.y + paddedBounds.height,
    },
    { x: paddedBounds.x, y: paddedBounds.y + paddedBounds.height },
  ];

  return deriveBoundsFromPoints([
    ...paddedBoundsCorners,
    ...transformedTipCandidates,
  ]);
};
