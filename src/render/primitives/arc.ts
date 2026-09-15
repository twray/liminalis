import {
  clampNonNegativeValue,
  clampWithinRange,
  degreesToRadians,
} from "../../util";
import {
  computeTransformedEllipticalAABB,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_ALIGNMENT,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  EMPTY_BOUNDS,
  renderWithTransform,
  setContextGlobals,
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

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
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

  const { radiusX, radiusY } = computedArcValues;
  const { cx, cy } = props;
  // Same start/end used for actual rendering (tracePath), so the AABB's
  // sweep window can never drift out of sync with what's drawn.
  const { startInRadians, endInRadians } = getArcAnglesInRadians(props);

  return computeTransformedEllipticalAABB(
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
};
