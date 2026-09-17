import type { Point2D } from "../../types";
import {
  clampNonNegativeValue,
  clampWithinRange,
  degreesToRadians,
} from "../../util";
import {
  angleBetweenVectors,
  computeTransformedEllipticalAABB,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_LINE_CAP,
  DEFAULT_STROKE_LINE_JOIN,
  DEFAULT_STROKE_MITER_LIMIT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  deriveBoundsFromPoints,
  EMPTY_BOUNDS,
  hasVisibleStroke,
  normalize,
  renderWithTransform,
  resolveStrokeOutwardOffset,
  resolveTransformState,
  setContextGlobals,
  transformPoint,
} from "../common";
import type {
  ArcProps,
  Bounds,
  ClosedPathDescriptor,
  EllipticalRadius,
} from "../types";

type CircularArcProps = ArcProps & { radius: number };
type EllipticalArcProps = ArcProps & { radiusX: number; radiusY: number };

interface ArcComputedValues extends EllipticalRadius {
  bounds: Bounds;
  isCircle: boolean;
}

const hasCircularRadius = (props: ArcProps): props is CircularArcProps => {
  const { radius } = props as CircularArcProps;
  return typeof radius === "number" && radius > 0;
};

const hasEllipticalRadii = (props: ArcProps): props is EllipticalArcProps => {
  const { radiusX, radiusY } = props as EllipticalArcProps;

  return (
    typeof radiusX === "number" &&
    radiusX > 0 &&
    typeof radiusY === "number" &&
    radiusY > 0
  );
};

const getComputedValuesFromProps = (
  props: ArcProps,
): ArcComputedValues | null => {
  const { cx, cy } = props;

  if (hasCircularRadius(props)) {
    if (props.radius <= 0) {
      return null;
    }

    const clampedRadius = clampNonNegativeValue(props.radius);

    const bounds = {
      x: cx - clampedRadius,
      y: cy - clampedRadius,
      width: clampedRadius * 2,
      height: clampedRadius * 2,
    };

    return {
      bounds,
      radiusX: clampedRadius,
      radiusY: clampedRadius,
      isCircle: true,
    };
  }

  if (hasEllipticalRadii(props)) {
    if (props.radiusX <= 0 || props.radiusY <= 0) {
      return null;
    }

    const clampedRadiusX = clampNonNegativeValue(props.radiusX);
    const clampedRadiusY = clampNonNegativeValue(props.radiusY);

    const bounds = {
      x: cx - clampedRadiusX,
      y: cy - clampedRadiusY,
      width: clampedRadiusX * 2,
      height: clampedRadiusY * 2,
    };

    return {
      bounds,
      radiusX: clampedRadiusX,
      radiusY: clampedRadiusY,
      isCircle: false,
    };
  }

  return null;
};

const tracePath = (
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  startAngle: number,
  endAngle: number,
  shouldClosePath = false,
): void => {
  context.ellipse(cx, cy, radiusX, radiusY, 0, startAngle, endAngle);

  if (shouldClosePath) {
    context.closePath();
  }
};

const getEllipsePoint = (
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  angle: number,
): Point2D => ({
  x: cx + radiusX * Math.cos(angle),
  y: cy + radiusY * Math.sin(angle),
});

const getEllipseTangent = (
  radiusX: number,
  radiusY: number,
  angle: number,
): Point2D => ({
  x: -radiusX * Math.sin(angle),
  y: radiusY * Math.cos(angle),
});

// Exact local-space miter tip for one corner. Canvas computes stroke
// geometry (joins, caps, miter spikes included) entirely in user-space from
// the raw path + lineWidth, THEN applies the active transform to the whole
// result -- so this stays in local (untransformed) coordinates throughout,
// matching that model exactly; only the final tip point needs transforming
// (see the call site). `strokeWidth` here is always the real, undoubled
// width -- arc's render function never doubles lineWidth for any
// strokeAlignment (unlike polygon/bezier), so this is the same value for
// "inside"/"center"/"outside" alike; only the vertex position differs.
//
// `edgeDirection1`/`edgeDirection2` must each point AWAY FROM the vertex,
// out along their own edge (e.g. for a corner where a curve arrives and a
// chord departs, that's -tangent and +chordDirection respectively -- NOT
// "arriving" and "departing" directions taken as-is, which measure the
// path's turning angle, not the corner's own interior angle, and differ by
// theta vs. 180-theta). Verified against an independent offset-line
// intersection derivation for both a symmetric (rect, 90 degree) and a
// sharp (triangle apex) corner; an earlier version of this function used
// arriving/departing directions directly and a separate outward-normal-via-
// reference-point step, which happened to cancel out correctly for one
// specific case but was wrong in general (see stroke-width-aware-bounds-
// plan.md Step 4's writeup for the full story). With both edges correctly
// pointing away from the vertex, the tip direction is simply the negated
// sum of their unit vectors (away from the small wedge the two edges form,
// no reference point needed at all) -- valid for the convex corners a
// closed shape's own seam always is.
const getMiterTipLocal = (
  vertex: Point2D,
  edgeDirection1: Point2D,
  edgeDirection2: Point2D,
  strokeWidth: number,
  miterLimit: number,
): Point2D => {
  const unitEdge1 = normalize(edgeDirection1);
  const unitEdge2 = normalize(edgeDirection2);
  const theta = angleBetweenVectors(unitEdge1, unitEdge2);
  const halfStrokeWidth = strokeWidth / 2;

  // theta -> 0 is a degenerate corner reversing back on itself; canvas
  // caps the real miter length via the bevel-fallback threshold in any
  // case, so clamp there directly rather than dividing by ~0.
  const rawMiterLength =
    theta <= 0 ? Infinity : halfStrokeWidth / Math.sin(theta / 2);
  const miterLength = Math.min(rawMiterLength, strokeWidth * miterLimit);

  const wedgeDirection = normalize({
    x: unitEdge1.x + unitEdge2.x,
    y: unitEdge1.y + unitEdge2.y,
  });

  return {
    x: vertex.x - miterLength * wedgeDirection.x,
    y: vertex.y - miterLength * wedgeDirection.y,
  };
};

const getArcAnglesInRadians = (props: ArcProps) => {
  const clampedStart = clampWithinRange(props.start, 0, 360);
  const clampedEnd = clampWithinRange(props.end, 0, 360);

  return {
    startInRadians: degreesToRadians(clampedStart - 90),
    endInRadians: degreesToRadians(clampedEnd - 90),
  };
};

export const arc = (
  context: CanvasRenderingContext2D,
  props: ArcProps,
): void => {
  const {
    cx,
    cy,
    closePath = false,
    fillStyle = "transparent",
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

  const { radiusX, radiusY, bounds } = computedValues;

  const angles = getArcAnglesInRadians(props);
  const { startInRadians: strokeStart, endInRadians: strokeEnd } = angles;

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.beginPath();
      tracePath(
        context,
        cx,
        cy,
        radiusX,
        radiusY,
        strokeStart,
        strokeEnd,
        closePath,
      );
      context.fill();
    }

    if (hasVisibleStroke({ strokeStyle, strokeWidth })) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
      context.lineJoin = lineJoin;
      context.miterLimit = miterLimit;
      context.lineCap = lineCap;

      const halfStrokeWidth = strokeWidth / 2;

      let strokeRadiusX = radiusX;
      let strokeRadiusY = radiusY;

      if (strokeAlignment === "inside") {
        strokeRadiusX = clampNonNegativeValue(radiusX - halfStrokeWidth);
        strokeRadiusY = clampNonNegativeValue(radiusY - halfStrokeWidth);
      } else if (strokeAlignment === "outside") {
        strokeRadiusX = radiusX + halfStrokeWidth;
        strokeRadiusY = radiusY + halfStrokeWidth;
      }

      context.beginPath();
      tracePath(
        context,
        cx,
        cy,
        strokeRadiusX,
        strokeRadiusY,
        strokeStart,
        strokeEnd,
        closePath,
      );
      context.stroke();
    }

    context.restore();
  });
};

export const arcPathDescriptor = (props: ArcProps): ClosedPathDescriptor => {
  const computedValues = getComputedValuesFromProps(props);

  if (!computedValues) {
    return {
      bounds: EMPTY_BOUNDS,
      isValid: false,
      tracePath: () => {
        // no-op for invalid clip descriptors
      },
    };
  }

  const { cx, cy } = props;
  const { radiusX, radiusY, bounds } = computedValues;
  const angles = getArcAnglesInRadians(props);

  return {
    bounds,
    isValid: radiusX >= 0.5 && radiusY >= 0.5,
    tracePath: (context: CanvasRenderingContext2D): void => {
      tracePath(
        context,
        cx,
        cy,
        radiusX,
        radiusY,
        angles.startInRadians,
        angles.endInRadians,
        true,
      );
    },
  };
};

export const getArcTransformedAABB = (props: ArcProps) => {
  const computedArcValues = getComputedValuesFromProps(props);

  if (!computedArcValues) return EMPTY_BOUNDS;

  const {
    cx,
    cy,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    closePath,
    lineJoin,
    miterLimit = DEFAULT_STROKE_MITER_LIMIT,
  } = props;

  const { startInRadians, endInRadians } = getArcAnglesInRadians(props);

  if (!hasVisibleStroke({ strokeStyle, strokeWidth })) {
    return computeTransformedEllipticalAABB(
      {
        cx,
        cy,
        radiusX: computedArcValues.radiusX,
        radiusY: computedArcValues.radiusY,
        startInRadians,
        endInRadians,
      },
      props,
    );
  }

  const strokeOutwardOffset = resolveStrokeOutwardOffset(
    strokeWidth,
    strokeAlignment,
  );

  const radiusX = computedArcValues.radiusX + strokeOutwardOffset;
  const radiusY = computedArcValues.radiusY + strokeOutwardOffset;

  const bounds = computeTransformedEllipticalAABB(
    {
      cx,
      cy,
      radiusX,
      radiusY,
      startInRadians,
      endInRadians,
    },
    props,
  );

  const hasMiteredClosedCorners =
    closePath && lineJoin === "miter" && strokeWidth > 0;

  if (!hasMiteredClosedCorners) {
    return bounds;
  }

  const halfStrokeWidth = strokeWidth / 2;
  const pathRadiusX =
    strokeAlignment === "inside"
      ? clampNonNegativeValue(computedArcValues.radiusX - halfStrokeWidth)
      : strokeAlignment === "outside"
        ? computedArcValues.radiusX + halfStrokeWidth
        : computedArcValues.radiusX;
  const pathRadiusY =
    strokeAlignment === "inside"
      ? clampNonNegativeValue(computedArcValues.radiusY - halfStrokeWidth)
      : strokeAlignment === "outside"
        ? computedArcValues.radiusY + halfStrokeWidth
        : computedArcValues.radiusY;

  const startPoint = getEllipsePoint(
    cx,
    cy,
    pathRadiusX,
    pathRadiusY,
    startInRadians,
  );
  const endPoint = getEllipsePoint(
    cx,
    cy,
    pathRadiusX,
    pathRadiusY,
    endInRadians,
  );
  const startTangent = getEllipseTangent(
    pathRadiusX,
    pathRadiusY,
    startInRadians,
  );
  const endTangent = getEllipseTangent(pathRadiusX, pathRadiusY, endInRadians);
  // "Away from start, toward end" -- the chord's own physical direction as
  // it extends from the start vertex.
  const chordAwayFromStart = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y,
  };

  const startTip = getMiterTipLocal(
    startPoint,
    chordAwayFromStart,
    startTangent,
    strokeWidth,
    miterLimit,
  );
  const endTip = getMiterTipLocal(
    endPoint,
    { x: -endTangent.x, y: -endTangent.y },
    { x: -chordAwayFromStart.x, y: -chordAwayFromStart.y },
    strokeWidth,
    miterLimit,
  );

  const transformState = resolveTransformState(props, bounds);
  const transformedTips = [startTip, endTip].map((tip) =>
    transformPoint(tip, transformState),
  );

  const boundsCorners: Point2D[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];

  return deriveBoundsFromPoints([...boundsCorners, ...transformedTips]);
};
