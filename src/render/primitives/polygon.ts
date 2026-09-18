import type { Point2D } from "../../types";
import {
  computeTransformedMultipointAABB,
  DEFAULT_BLEND_MODE,
  DEFAULT_FILL_STYLE,
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
  getOffsetVertex,
  getRowNorms,
  hasVisibleFill,
  hasVisibleStroke,
  renderWithTransform,
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

// When the caller supplies a polygon whose last point already duplicates
// its first (rather than using closePath: true with a non-duplicated
// list), that repeated point isn't a second distinct ring vertex -- it's
// the same corner twice. Left alone, both copies would see a degenerate
// zero-length "edge" back to themselves (previous/next collapsing onto the
// vertex itself), breaking the angle math at exactly that corner. Mirrors
// bezier.ts's identical naturallyClosed handling.
const getDistinctRingPoints = (points: Point2D[]): Point2D[] => {
  const first = points[0];
  const last = points[points.length - 1];
  const isDuplicateClosingPoint =
    points.length > 2 && first.x === last.x && first.y === last.y;

  return isDuplicateClosingPoint ? points.slice(0, -1) : points;
};

// A true parallel offset of the closed ring, moving every vertex along its
// own local bisector by (strokeWidth/2)/sin(theta/2) (see
// stroke-alignment-geometric-offset-plan.md). Positive strokeWidth/2 moves
// outward, negative moves inward -- getOffsetVertex's own sign convention.
// Exact for convex vertices; a reflex vertex offset outward can, in
// principle, cross other edges of the offset shape (out of scope here --
// see the plan's concave caveat). Returns an array the same length as the
// input -- including a repeated closing point, if the input had one, so
// tracePath still draws the same number of segments.
const getOffsetPolygonPoints = (
  points: Point2D[],
  signedOffset: number,
): Point2D[] => {
  const ringPoints = getDistinctRingPoints(points);
  const ringLength = ringPoints.length;

  const offsetRingPoints = ringPoints.map((vertex, index) => {
    const previousPoint = ringPoints[(index - 1 + ringLength) % ringLength];
    const nextPoint = ringPoints[(index + 1) % ringLength];

    return getOffsetVertex(
      vertex,
      { x: previousPoint.x - vertex.x, y: previousPoint.y - vertex.y },
      { x: nextPoint.x - vertex.x, y: nextPoint.y - vertex.y },
      signedOffset,
    );
  });

  return ringPoints.length === points.length
    ? offsetRingPoints
    : [...offsetRingPoints, offsetRingPoints[0]];
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
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    lineJoin = DEFAULT_STROKE_LINE_JOIN,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
    lineCap = DEFAULT_STROKE_LINE_CAP,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    closePath,
  } = props;
  const computedValues = getComputedValuesFromProps(props);
  const { shouldClosePath, bounds } = computedValues;

  if (points.length < 2) {
    return;
  }

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    const canApplyStrokeAlignment =
      hasVisibleStroke({ strokeStyle, strokeWidth }) && shouldClosePath;

    const strokePoints =
      canApplyStrokeAlignment && strokeAlignment === "inside"
        ? getOffsetPolygonPoints(points, -strokeWidth / 2)
        : canApplyStrokeAlignment && strokeAlignment === "outside"
          ? getOffsetPolygonPoints(points, strokeWidth / 2)
          : points;

    context.beginPath();
    tracePath(context, strokePoints, shouldClosePath);

    if (hasVisibleFill({ fillStyle }) && closePath) {
      context.fillStyle = fillStyle;
      context.fill();
    }

    if (hasVisibleStroke({ strokeStyle, strokeWidth })) {
      context.strokeStyle = strokeStyle;
      console.log(strokeStyle);
      context.lineWidth = strokeWidth;
      context.lineJoin = lineJoin;
      context.miterLimit = miterLimit;
      context.lineCap = lineCap;
      context.stroke();
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
  rawPoints: Point2D[],
  shouldClosePath: boolean,
  nativeStrokeWidth: number,
  miterLimit: number,
): Point2D[] => {
  const points = shouldClosePath ? getDistinctRingPoints(rawPoints) : rawPoints;
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

  if (!hasVisibleStroke({ strokeStyle, strokeWidth })) {
    return computeTransformedMultipointAABB(points, props);
  }

  const { shouldClosePath } = getComputedValuesFromProps(props);

  // A true geometric offset of the points themselves (see
  // stroke-alignment-geometric-offset-plan.md) -- once the path is
  // pre-offset, "inside"/"outside" render (and therefore bound) EXACTLY
  // like "center" does: a plain centered stroke of the real strokeWidth.
  const effectivePoints =
    shouldClosePath && strokeAlignment === "inside"
      ? getOffsetPolygonPoints(points, -strokeWidth / 2)
      : shouldClosePath && strokeAlignment === "outside"
        ? getOffsetPolygonPoints(points, strokeWidth / 2)
        : points;

  const bounds = computeTransformedMultipointAABB(effectivePoints, props);

  // Round-pen baseline: dilating the fill geometry's boundary by an
  // isotropic pen is a Minkowski sum with a disk, which simply grows an
  // already-tight AABB uniformly -- exact, not an approximation -- so this
  // covers every edge's own contribution (and every round/bevel join's)
  // regardless of corner sharpness. Row-norm-scaled per axis for non-
  // uniform scale/rotation (Section 3 / Step 1); any probe point works
  // since the linear part is constant across an affine transform. Always
  // the plain strokeWidth/2 now -- strokeAlignment's effect is already
  // baked into effectivePoints, not a separate extent calculation.
  const halfStrokeWidth = strokeWidth / 2;
  const transformState = resolveTransformState(props, bounds);
  const { columnX, columnY } = getLinearPartOfTransform(
    effectivePoints[0],
    transformState,
  );
  const { rowNormX, rowNormY } = getRowNorms(columnX, columnY);
  const padX = halfStrokeWidth * rowNormX;
  const padY = halfStrokeWidth * rowNormY;

  const paddedBounds: Bounds = {
    x: bounds.x - padX,
    y: bounds.y - padY,
    width: bounds.width + padX * 2,
    height: bounds.height + padY * 2,
  };

  if (lineJoin !== "miter") {
    return paddedBounds;
  }

  // A miter spike is an ADDITIONAL protrusion beyond the round-pen
  // baseline, only at corners -- so union the exact tip candidates in
  // rather than replacing the baseline with them. Computed on the SAME
  // effectivePoints the render function actually strokes, at the real
  // (never doubled, now that offsetting replaces the old double-width-
  // plus-clip mechanism) strokeWidth -- including for "inside", which can
  // still genuinely overshoot the offset (and even the original) boundary
  // for a sufficiently acute corner, same as arc's "inside" case.
  const transformedTipCandidates = getMiterTipCandidatesForPolygon(
    effectivePoints,
    shouldClosePath,
    strokeWidth,
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
