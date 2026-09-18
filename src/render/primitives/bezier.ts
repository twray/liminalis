import type { Point2D } from "../../types";
import {
  DEFAULT_BLEND_MODE,
  DEFAULT_FILL_STYLE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_LINE_CAP,
  DEFAULT_STROKE_LINE_JOIN,
  DEFAULT_STROKE_MITER_LIMIT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  EMPTY_BOUNDS,
  deriveBoundsFromPoints,
  getLinearPartOfTransform,
  getMiterTipCandidates,
  getOffsetVertex,
  getRowNorms,
  hasVisibleStroke,
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

// Bezier derivative at the segment boundaries, for exact miter-tip geometry
// at each joint (see stroke-width-aware-bounds-plan.md Step 4). Quadratic
// B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2 has B'(0) = 2(P1-P0), B'(1) =
// 2(P2-P1); cubic B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)t^2*P2 + t^3*P3
// has B'(0) = 3(P1-P0), B'(1) = 3(P3-P2). The constant factor (2 or 3)
// doesn't matter for angle/direction purposes -- these feed straight into
// normalize() -- so it's kept only for clarity, not correctness.
const getSegmentTangentAtStart = (
  startPoint: Point2D,
  segment: BezierCurveSegment,
): Point2D => {
  const control1 = isCubicBezierSegment(segment)
    ? segment.control[0]
    : segment.control;

  return { x: control1.x - startPoint.x, y: control1.y - startPoint.y };
};

const getSegmentTangentAtEnd = (segment: BezierCurveSegment): Point2D => {
  const lastControl = isCubicBezierSegment(segment)
    ? segment.control[1]
    : segment.control;

  return {
    x: segment.point.x - lastControl.x,
    y: segment.point.y - lastControl.y,
  };
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
    lineJoin = DEFAULT_STROKE_LINE_JOIN,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
    lineCap = DEFAULT_STROKE_LINE_CAP,
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

    if (hasVisibleStroke({ strokeStyle, strokeWidth })) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
      context.lineJoin = lineJoin;
      context.miterLimit = miterLimit;
      context.lineCap = lineCap;

      const canApplyStrokeAlignment = shouldClosePath;

      // A true geometric offset of the path itself (exact for the on-curve
      // points, an approximation for control points), stroked normally at
      // the real strokeWidth -- not the old double-width-plus-clip
      // approach, which cut through the middle of each join's actual
      // shape instead of along its true outward boundary, visibly
      // clipping/flattening every join under "inside"/"outside" (see
      // stroke-alignment-geometric-offset-plan.md).
      const strokeGeometry =
        canApplyStrokeAlignment && strokeAlignment === "inside"
          ? getOffsetBezierGeometry(startPoint, curveSegments, -strokeWidth / 2)
          : canApplyStrokeAlignment && strokeAlignment === "outside"
            ? getOffsetBezierGeometry(
                startPoint,
                curveSegments,
                strokeWidth / 2,
              )
            : { startPoint, curveSegments };

      context.beginPath();
      tracePath(
        context,
        strokeGeometry.startPoint,
        strokeGeometry.curveSegments,
        shouldClosePath,
      );
      context.stroke();
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

// Every joint along a closed bezier has a join (curve-to-curve at segment
// boundaries, plus curve-to-chord at the two ends if closePath adds an
// implicit closing chord rather than the curve already ending exactly where
// it started); an open bezier's two path ends are free ends instead
// (handled by lineCap, not lineJoin), so only its interior joints get one.
// Mirrors polygon's getMiterTipCandidatesForPolygon exactly in structure --
// only the edge-direction source differs (a curve segment's tangent at its
// own start/end, rather than a straight edge's fixed direction).
const getMiterTipCandidatesForBezier = (
  startPoint: Point2D,
  curveSegments: BezierCurveSegment[],
  shouldClosePath: boolean,
  nativeStrokeWidth: number,
  miterLimit: number,
): Point2D[] => {
  const segmentCount = curveSegments.length;

  if (!shouldClosePath) {
    const candidates: Point2D[] = [];

    for (let index = 1; index < segmentCount; index++) {
      const joint = curveSegments[index - 1].point;
      const tangentAtEnd = getSegmentTangentAtEnd(curveSegments[index - 1]);
      const tangentAtStart = getSegmentTangentAtStart(
        joint,
        curveSegments[index],
      );

      candidates.push(
        ...getMiterTipCandidates(
          joint,
          { x: -tangentAtEnd.x, y: -tangentAtEnd.y },
          tangentAtStart,
          nativeStrokeWidth,
          miterLimit,
        ),
      );
    }

    return candidates;
  }

  const lastSegmentEnd = curveSegments[segmentCount - 1].point;
  const naturallyClosed =
    lastSegmentEnd.x === startPoint.x && lastSegmentEnd.y === startPoint.y;

  // Distinct ring points: when the curve already ends exactly where it
  // started, that shared point is listed once (no separate closing chord
  // needed); otherwise closePath's implicit chord adds startPoint back in
  // as its own extra ring point.
  const fullRingPoints = naturallyClosed
    ? [
        startPoint,
        ...curveSegments.slice(0, -1).map((segment) => segment.point),
      ]
    : [startPoint, ...curveSegments.map((segment) => segment.point)];
  const ringLength = fullRingPoints.length;

  const candidates: Point2D[] = [];

  for (let index = 0; index < ringLength; index++) {
    const joint = fullRingPoints[index];

    // Edge AFTER this joint (starts here): a curve segment if one exists
    // at this index, otherwise (only possible at the final ring point, and
    // only when not naturally closed) the implicit closing chord.
    const edgeAfterDirection =
      index < segmentCount
        ? getSegmentTangentAtStart(joint, curveSegments[index])
        : {
            x: fullRingPoints[0].x - joint.x,
            y: fullRingPoints[0].y - joint.y,
          };

    // Edge BEFORE this joint (ends here): a curve segment, wrapping around
    // to the last one when naturally closed; otherwise (only at the very
    // first ring point) the implicit closing chord.
    const previousSegmentIndex = naturallyClosed
      ? (index - 1 + ringLength) % ringLength
      : index - 1;
    const edgeBeforeDirection =
      previousSegmentIndex >= 0
        ? (() => {
            const tangentAtEnd = getSegmentTangentAtEnd(
              curveSegments[previousSegmentIndex],
            );
            return { x: -tangentAtEnd.x, y: -tangentAtEnd.y };
          })()
        : {
            x: fullRingPoints[ringLength - 1].x - joint.x,
            y: fullRingPoints[ringLength - 1].y - joint.y,
          };

    candidates.push(
      ...getMiterTipCandidates(
        joint,
        edgeBeforeDirection,
        edgeAfterDirection,
        nativeStrokeWidth,
        miterLimit,
      ),
    );
  }

  return candidates;
};

// The offset on-curve position for every joint (index 0 = startPoint,
// index i = curveSegments[i-1].point), mirroring
// getMiterTipCandidatesForBezier's joint traversal exactly but computing a
// single offset point per joint (via getOffsetVertex) instead of a miter
// candidate pair. Returns an array the same length as [startPoint,
// ...curveSegments.map(s => s.point)] -- including a repeated closing
// point, if the curve had one, mapped to the same offset as the first
// joint.
const getOffsetJointPoints = (
  startPoint: Point2D,
  curveSegments: BezierCurveSegment[],
  signedOffset: number,
): Point2D[] => {
  const segmentCount = curveSegments.length;
  const fullJointPoints = [startPoint, ...curveSegments.map((s) => s.point)];
  const lastSegmentEnd = curveSegments[segmentCount - 1].point;
  const naturallyClosed =
    lastSegmentEnd.x === startPoint.x && lastSegmentEnd.y === startPoint.y;

  const ringPoints = naturallyClosed
    ? fullJointPoints.slice(0, -1)
    : fullJointPoints;
  const ringLength = ringPoints.length;

  const offsetRingPoints = ringPoints.map((joint, index) => {
    const edgeAfterDirection =
      index < segmentCount
        ? getSegmentTangentAtStart(joint, curveSegments[index])
        : {
            x: ringPoints[0].x - joint.x,
            y: ringPoints[0].y - joint.y,
          };

    const previousSegmentIndex = naturallyClosed
      ? (index - 1 + ringLength) % ringLength
      : index - 1;
    const edgeBeforeDirection =
      previousSegmentIndex >= 0
        ? (() => {
            const tangentAtEnd = getSegmentTangentAtEnd(
              curveSegments[previousSegmentIndex],
            );
            return { x: -tangentAtEnd.x, y: -tangentAtEnd.y };
          })()
        : {
            x: ringPoints[ringLength - 1].x - joint.x,
            y: ringPoints[ringLength - 1].y - joint.y,
          };

    return getOffsetVertex(
      joint,
      edgeBeforeDirection,
      edgeAfterDirection,
      signedOffset,
    );
  });

  return naturallyClosed
    ? [...offsetRingPoints, offsetRingPoints[0]]
    : offsetRingPoints;
};

// A true offset for the on-curve points (exact, same formula as polygon's
// vertex offset); an APPROXIMATION for control points, since the real
// perpendicular offset of a Bezier curve isn't itself a Bezier curve (see
// stroke-alignment-geometric-offset-plan.md). Chosen to preserve exact
// tangent direction at both curve endpoints wherever the control structure
// allows it: a cubic segment's two independent control points each move by
// the SAME displacement as their nearest on-curve point (tangent at an
// endpoint depends only on that endpoint and its adjacent control point,
// so shifting both by the same vector leaves the direction unchanged); a
// quadratic segment's single shared control point can't satisfy both
// endpoint tangents at once, so it moves by their AVERAGE displacement.
const getOffsetBezierGeometry = (
  startPoint: Point2D,
  curveSegments: BezierCurveSegment[],
  signedOffset: number,
): { startPoint: Point2D; curveSegments: BezierCurveSegment[] } => {
  const fullJointPoints = [startPoint, ...curveSegments.map((s) => s.point)];
  const offsetJointPoints = getOffsetJointPoints(
    startPoint,
    curveSegments,
    signedOffset,
  );
  const displacements = fullJointPoints.map((joint, index) => ({
    x: offsetJointPoints[index].x - joint.x,
    y: offsetJointPoints[index].y - joint.y,
  }));

  const offsetSegments: BezierCurveSegment[] = curveSegments.map(
    (segment, index) => {
      const startDisplacement = displacements[index];
      const endDisplacement = displacements[index + 1];
      const newPoint = offsetJointPoints[index + 1];

      if (isCubicBezierSegment(segment)) {
        return {
          control: [
            {
              x: segment.control[0].x + startDisplacement.x,
              y: segment.control[0].y + startDisplacement.y,
            },
            {
              x: segment.control[1].x + endDisplacement.x,
              y: segment.control[1].y + endDisplacement.y,
            },
          ] as [Point2D, Point2D],
          point: newPoint,
        };
      }

      const averageDisplacement = {
        x: (startDisplacement.x + endDisplacement.x) / 2,
        y: (startDisplacement.y + endDisplacement.y) / 2,
      };

      return {
        control: {
          x: segment.control.x + averageDisplacement.x,
          y: segment.control.y + averageDisplacement.y,
        },
        point: newPoint,
      };
    },
  );

  return { startPoint: offsetJointPoints[0], curveSegments: offsetSegments };
};

export const getBezierTransformedAABB = (props: BezierProps): Bounds => {
  const computedValues = getComputedValuesFromProps(props);

  if (!computedValues) return EMPTY_BOUNDS;

  const {
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    lineJoin = DEFAULT_STROKE_LINE_JOIN,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
  } = props;

  const { startPoint, curveSegments, shouldClosePath } = computedValues;

  // A true geometric offset of the points themselves (see
  // stroke-alignment-geometric-offset-plan.md) -- once the path is
  // pre-offset, "inside"/"outside" render (and therefore bound) EXACTLY
  // like "center" does: a plain centered stroke of the real strokeWidth.
  // Only meaningful when there's a real stroke to offset for in the first
  // place, so skip it (and the padding/miter steps below) entirely when
  // there isn't -- but still run the real transform either way.
  const hasStroke = hasVisibleStroke({ strokeStyle, strokeWidth });
  const effectiveGeometry =
    hasStroke && shouldClosePath && strokeAlignment === "inside"
      ? getOffsetBezierGeometry(startPoint, curveSegments, -strokeWidth / 2)
      : hasStroke && shouldClosePath && strokeAlignment === "outside"
        ? getOffsetBezierGeometry(startPoint, curveSegments, strokeWidth / 2)
        : { startPoint, curveSegments };

  const tightBounds = getTightBezierBounds(
    effectiveGeometry.startPoint,
    effectiveGeometry.curveSegments,
  );

  const transformState = resolveTransformState(props, tightBounds);
  const { hasRotate, hasScale } = transformState;

  const transformedStartPoint =
    hasRotate || hasScale
      ? transformPoint(effectiveGeometry.startPoint, transformState)
      : effectiveGeometry.startPoint;
  const transformedSegments: BezierCurveSegment[] =
    hasRotate || hasScale
      ? effectiveGeometry.curveSegments.map((segment) =>
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
        )
      : effectiveGeometry.curveSegments;

  const transformedTightBounds =
    hasRotate || hasScale
      ? getTightBezierBounds(transformedStartPoint, transformedSegments)
      : tightBounds;

  if (!hasStroke) return transformedTightBounds;

  // Round-pen baseline: dilating the fill geometry's boundary by an
  // isotropic pen is a Minkowski sum with a disk, which simply grows an
  // already-tight AABB uniformly -- exact for ANY boundary shape, curved
  // or straight, not an approximation -- so this covers every curve
  // segment's own contribution (and every round/bevel join's) regardless
  // of corner sharpness. Row-norm-scaled per axis for non-uniform
  // scale/rotation (Section 3 / Step 1); any probe point works since the
  // linear part is constant across an affine transform. Always the plain
  // strokeWidth/2 now -- strokeAlignment's effect is already baked into
  // effectiveGeometry, not a separate extent calculation.
  const halfStrokeWidth = strokeWidth / 2;
  const { columnX, columnY } = getLinearPartOfTransform(
    effectiveGeometry.startPoint,
    transformState,
  );
  const { rowNormX, rowNormY } = getRowNorms(columnX, columnY);
  const padX = halfStrokeWidth * rowNormX;
  const padY = halfStrokeWidth * rowNormY;

  const paddedBounds: Bounds = {
    x: transformedTightBounds.x - padX,
    y: transformedTightBounds.y - padY,
    width: transformedTightBounds.width + padX * 2,
    height: transformedTightBounds.height + padY * 2,
  };

  if (lineJoin !== "miter") {
    return paddedBounds;
  }

  // A miter spike is an ADDITIONAL protrusion beyond the round-pen
  // baseline, only at joints -- so union the exact tip candidates in
  // rather than replacing the baseline with them. Computed on the SAME
  // effectiveGeometry the render function actually strokes, at the real
  // (never doubled, now that offsetting replaces the old double-width-
  // plus-clip mechanism) strokeWidth -- including for "inside", which can
  // still genuinely overshoot the offset (and even the original) boundary
  // for a sufficiently acute joint, same as arc's "inside" case.
  const transformedTipCandidates = getMiterTipCandidatesForBezier(
    effectiveGeometry.startPoint,
    effectiveGeometry.curveSegments,
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
