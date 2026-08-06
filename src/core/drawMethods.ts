import type {
  Corners,
  Dimensions2D,
  FillStyles,
  OptionalDimensions2D,
  PartialDrawStyles,
  Point2D,
  Positioned2D,
  StrokeAlignment,
  StrokeStyles,
  WithBlend,
  WithOpacity,
  XOR,
} from "../types";
import {
  clampNonNegativeValue,
  clampWithinRange,
  degreesToRadians,
  isCorners,
} from "../util";
import type Animatable from "./Animatable";
import AnimatableRegistry from "./AnimatableRegistry";
import { imageAssetCache, type LoadedImageAsset } from "./ImageAssetCache";

const DEFAULT_BACKGROUND_COLOR = "#fff";
const DEFAULT_FILL_STYLE = "transparent";
const DEFAULT_STROKE_STYLE = "#333";
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_STROKE_ALIGNMENT = "center";
const DEFAULT_BLEND_MODE: GlobalCompositeOperation = "source-over";

const DEFAULT_TEXT_FILL_STYLE = "#333";
const DEFAULT_TEXT_STROKE_STYLE = "transparent";
const DEFAULT_TEXT_FONT_STYLE = "12pt sans-serif";

export interface BackgroundProps {
  color: string;
}

export type TransformOrigin = "center" | Point2D;

export interface TransformProps {
  rotate?: number;
  rotateOrigin?: TransformOrigin;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleOrigin?: TransformOrigin;
}

interface ContextGlobalProps extends WithOpacity, WithBlend {}

export interface LineProps
  extends StrokeStyles, WithOpacity, WithBlend, TransformProps {
  start: Point2D;
  end: Point2D;
}

export interface PolygonProps
  extends StrokeStyles, WithOpacity, WithBlend, TransformProps {
  points: Point2D[];
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

export interface BezierStartSegment {
  point: Point2D;
  control?: never;
}

export interface QuadraticBezierSegment {
  control: Point2D;
  point: Point2D;
}

export interface CubicBezierSegment {
  control: Point2D[];
  point: Point2D;
}

export type BezierCurveSegment = XOR<
  QuadraticBezierSegment,
  CubicBezierSegment
>;

export type BezierSegment = BezierStartSegment | BezierCurveSegment;

export type BezierSegments = BezierSegment[];

export interface BezierProps
  extends FillStyles, StrokeStyles, WithOpacity, WithBlend, TransformProps {
  segments: BezierSegments;
  closePath?: boolean;
  strokeAlignment?: StrokeAlignment;
}

interface EllipticGeometryProps
  extends FillStyles, StrokeStyles, WithOpacity, WithBlend, TransformProps {
  cx: number;
  cy: number;
}

interface CircularRadius {
  radius: number;
}

interface EllipticalRadius {
  radiusX: number;
  radiusY: number;
}

type ArcRadius = XOR<CircularRadius, EllipticalRadius>;

export type ArcProps = EllipticGeometryProps &
  ArcRadius & {
    start: number;
    end: number;
    strokeAlignment?: StrokeAlignment;
  };

export interface CircleProps extends EllipticGeometryProps {
  radius: number;
  strokeAlignment?: StrokeAlignment;
}

export interface EllipseProps extends EllipticGeometryProps {
  radiusX: number;
  radiusY: number;
  strokeAlignment?: StrokeAlignment;
}

export interface RectProps
  extends
    Positioned2D,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps {
  cornerRadius?: Corners | number;
  strokeAlignment?: StrokeAlignment;
}

export interface TextProps
  extends
    Positioned2D,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    WithBlend,
    TransformProps {
  fontStyle?: string;
}

export interface ImageProps
  extends
    Positioned2D,
    OptionalDimensions2D,
    WithOpacity,
    WithBlend,
    TransformProps {
  fit?: "cover" | "contain" | "stretch";
}

export interface DrawMethods {
  width: number;
  height: number;
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  background: (props: BackgroundProps) => void;
  center: Point2D;
  centerOf: (props: Dimensions2D) => Point2D;
  line: (props: LineProps) => Animatable<LineProps>;
  polygon: (props: PolygonProps) => Animatable<PolygonProps>;
  bezier: (props: BezierProps) => Animatable<BezierProps>;
  arc: (props: ArcProps) => Animatable<ArcProps>;
  circle: (props: CircleProps) => Animatable<CircleProps>;
  ellipse: (props: EllipseProps) => Animatable<EllipseProps>;
  rect: (props: RectProps) => Animatable<RectProps>;
  text: (text: string, props?: TextProps) => Animatable<TextProps>;
  image: (imageSrc: string, props?: ImageProps) => Animatable<ImageProps>;
}

const resolveTransformOrigin = (
  origin: TransformOrigin | undefined,
  bounds: { x: number; y: number; width: number; height: number },
): Point2D => {
  if (!origin || origin === "center") {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }
  // It's a Point2D in local coordinates - add to bounds position
  return { x: bounds.x + origin.x, y: bounds.y + origin.y };
};

const renderWithTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: { x: number; y: number; width: number; height: number },
  renderShape: () => void,
): void => {
  const { rotate, rotateOrigin, scale, scaleX, scaleY, scaleOrigin } = props;

  const hasRotate = rotate !== undefined && rotate !== 0;
  const effectiveScaleX = scaleX ?? scale ?? 1;
  const effectiveScaleY = scaleY ?? scale ?? 1;
  const hasScale = effectiveScaleX !== 1 || effectiveScaleY !== 1;

  if (!hasRotate && !hasScale) {
    // No transforms, just render directly
    renderShape();
    return;
  }

  context.save();

  // Apply scale first (so rotation happens in scaled space)
  if (hasScale) {
    const origin = resolveTransformOrigin(scaleOrigin, bounds);
    context.translate(origin.x, origin.y);
    context.scale(effectiveScaleX, effectiveScaleY);
    context.translate(-origin.x, -origin.y);
  }

  // Apply rotation
  if (hasRotate) {
    const origin = resolveTransformOrigin(rotateOrigin, bounds);
    const radians = degreesToRadians(rotate);
    context.translate(origin.x, origin.y);
    context.rotate(radians);
    context.translate(-origin.x, -origin.y);
  }

  renderShape();

  context.restore();
};

const getTextBounds = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontStyle: string,
): { x: number; y: number; width: number; height: number } => {
  context.save();
  context.font = fontStyle;

  const metrics = context.measureText(text);

  context.restore();

  const width = metrics.width ?? 0;

  const fallbackHeightMatch = fontStyle.match(/(\d+(?:\.\d+)?)px/);
  const fallbackHeight = fallbackHeightMatch
    ? Number(fallbackHeightMatch[1])
    : 12;

  const ascent = metrics.actualBoundingBoxAscent ?? fallbackHeight;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const height = Math.max(ascent + descent, fallbackHeight);

  return {
    x,
    // Text is rendered using textBaseline="top", so y is already the top edge.
    y,
    width,
    height,
  };
};

const setContextGlobals = (
  context: CanvasRenderingContext2D,
  props: ContextGlobalProps,
) => {
  const { opacity = 0, blend = DEFAULT_BLEND_MODE } = props;

  context.globalAlpha = opacity;
  context.globalCompositeOperation = blend;
};

const background = (
  context: CanvasRenderingContext2D,
  props: BackgroundProps,
) => {
  const { color: backgroundColor = DEFAULT_BACKGROUND_COLOR } = props;

  context.save();

  context.fillStyle = backgroundColor;

  context.fillRect(
    0,
    0,
    context.canvas.width * window.devicePixelRatio,
    context.canvas.height * window.devicePixelRatio,
  );

  context.restore();
};

const centerOf = (dimensions: Dimensions2D): Point2D => {
  const { width, height } = dimensions;
  return { x: width / 2, y: height / 2 };
};

const line = (context: CanvasRenderingContext2D, props: LineProps) => {
  const {
    start: { x: startX = 0, y: startY = 0 },
    end: { x: endX = 0, y: endY = 0 },
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  // Bounds for transform origin (bounding box of the line)
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

const polygon = (context: CanvasRenderingContext2D, props: PolygonProps) => {
  const {
    points,
    closePath = false,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  if (points.length < 2) {
    return;
  }

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

  const tracePolygonPath = (isClosedPath: boolean): void => {
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index++) {
      const point = points[index];
      context.lineTo(point.x, point.y);
    }

    if (isClosedPath) {
      context.closePath();
    }
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      const canApplyStrokeAlignment = shouldClosePath;

      if (canApplyStrokeAlignment && strokeAlignment === "inside") {
        // Draw at 2x width and keep only the inner half so visible width
        // matches the requested strokeWidth.
        context.lineWidth = strokeWidth * 2;

        context.save();
        context.beginPath();
        tracePolygonPath(true);
        context.clip();

        context.beginPath();
        tracePolygonPath(true);
        context.stroke();
        context.restore();
      } else if (canApplyStrokeAlignment && strokeAlignment === "outside") {
        // Draw at 2x width and keep only the outer half so visible width
        // matches the requested strokeWidth.
        context.lineWidth = strokeWidth * 2;

        // Clip to everything outside the polygon to keep only the outer half.
        const clipPadding = strokeWidth * 2;

        context.save();
        context.beginPath();
        context.rect(
          minX - clipPadding,
          minY - clipPadding,
          bounds.width + clipPadding * 2,
          bounds.height + clipPadding * 2,
        );
        tracePolygonPath(true);
        context.clip("evenodd");

        context.beginPath();
        tracePolygonPath(true);
        context.stroke();
        context.restore();
      } else {
        context.beginPath();
        tracePolygonPath(shouldClosePath);
        context.stroke();
      }
    }

    context.restore();
  });
};

const bezier = (context: CanvasRenderingContext2D, props: BezierProps) => {
  const {
    segments,
    closePath = false,
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  if (segments.length < 2) {
    return;
  }

  const isPoint2D = (value: unknown): value is Point2D =>
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number";

  const isBezierStartSegment = (
    value: unknown,
  ): value is BezierStartSegment => {
    if (typeof value !== "object" || value === null || !("point" in value)) {
      return false;
    }

    if ("control" in value) {
      return false;
    }

    return isPoint2D(value.point);
  };

  const isBezierCurveSegment = (
    value: unknown,
  ): value is BezierCurveSegment => {
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

  const [startSegment, ...curveSegments] = segments;

  const validatedCurveSegments = curveSegments.filter(isBezierCurveSegment);

  if (
    !isBezierStartSegment(startSegment) ||
    validatedCurveSegments.length !== curveSegments.length
  ) {
    return;
  }

  const startPoint = startSegment.point;

  const pathEnd =
    validatedCurveSegments[validatedCurveSegments.length - 1].point;
  const pathAlreadyClosed =
    startPoint.x === pathEnd.x && startPoint.y === pathEnd.y;
  const shouldClosePath = closePath || pathAlreadyClosed;

  const points: Point2D[] = [startPoint];

  const isCubicBezierSegment = (
    segment: BezierCurveSegment,
  ): segment is CubicBezierSegment => Array.isArray(segment.control);

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

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const traceBezierPath = (isClosedPath: boolean): void => {
    context.moveTo(startPoint.x, startPoint.y);

    for (const segment of validatedCurveSegments) {
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

    if (isClosedPath) {
      context.closePath();
    }
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.beginPath();
      traceBezierPath(shouldClosePath);
      context.fill();
    }

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      const canApplyStrokeAlignment = shouldClosePath;

      if (canApplyStrokeAlignment && strokeAlignment === "inside") {
        // Draw at 2x width and keep only the inner half so visible width
        // matches the requested strokeWidth.
        context.lineWidth = strokeWidth * 2;

        context.save();
        context.beginPath();
        traceBezierPath(true);
        context.clip();

        context.beginPath();
        traceBezierPath(true);
        context.stroke();
        context.restore();
      } else if (canApplyStrokeAlignment && strokeAlignment === "outside") {
        // Draw at 2x width and keep only the outer half so visible width
        // matches the requested strokeWidth.
        context.lineWidth = strokeWidth * 2;

        // Clip to everything outside the shape to keep only the outer half.
        const clipPadding = strokeWidth * 2;

        context.save();
        context.beginPath();
        context.rect(
          minX - clipPadding,
          minY - clipPadding,
          bounds.width + clipPadding * 2,
          bounds.height + clipPadding * 2,
        );
        traceBezierPath(true);
        context.clip("evenodd");

        context.beginPath();
        traceBezierPath(true);
        context.stroke();
        context.restore();
      } else {
        context.beginPath();
        traceBezierPath(shouldClosePath);
        context.stroke();
      }
    }

    context.restore();
  });
};

const arc = (context: CanvasRenderingContext2D, props: ArcProps) => {
  const {
    cx,
    cy,
    radius,
    radiusX,
    radiusY,
    start,
    end,
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    strokeAlignment = DEFAULT_STROKE_ALIGNMENT,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const isCircle = radius !== undefined;

  const { validatedRadiusX, validatedRadiusY } = isCircle
    ? {
        validatedRadiusX: clampNonNegativeValue(radius),
        validatedRadiusY: clampNonNegativeValue(radius),
      }
    : {
        validatedRadiusX: clampNonNegativeValue(radiusX),
        validatedRadiusY: clampNonNegativeValue(radiusY),
      };

  const clampedStart = clampWithinRange(start, 0, 360);
  const clampedEnd = clampWithinRange(end, 0, 360);
  const strokeStart = degreesToRadians(clampedStart - 90);
  const strokeEnd = degreesToRadians(clampedEnd - 90);

  const drawArcPath = (
    radiusForX: number,
    radiusForY: number,
    startAngle: number,
    endAngle: number,
  ) => {
    context.beginPath();

    if (isCircle) {
      context.arc(cx, cy, radiusForX, startAngle, endAngle);
      return;
    }

    context.ellipse(cx, cy, radiusForX, radiusForY, 0, startAngle, endAngle);
  };

  // Calculate bounds for transform origin (bounding box of the arc shape)
  const bounds = {
    x: cx - validatedRadiusX,
    y: cy - validatedRadiusY,
    width: validatedRadiusX * 2,
    height: validatedRadiusY * 2,
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    // Draw fill
    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      drawArcPath(validatedRadiusX, validatedRadiusY, 0, Math.PI * 2);
      context.fill();
    }

    // Draw stroke with alignment
    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
      const halfStrokeWidth = strokeWidth / 2;

      let strokeRadiusX = validatedRadiusX;
      let strokeRadiusY = validatedRadiusY;

      if (strokeAlignment === "inside") {
        // Inset the stroke by half its width
        strokeRadiusX = clampNonNegativeValue(
          validatedRadiusX - halfStrokeWidth,
        );
        strokeRadiusY = clampNonNegativeValue(
          validatedRadiusY - halfStrokeWidth,
        );
      } else if (strokeAlignment === "outside") {
        // Outset the stroke by half its width
        strokeRadiusX = validatedRadiusX + halfStrokeWidth;
        strokeRadiusY = validatedRadiusY + halfStrokeWidth;
      }

      // For "center", use the original radius (default canvas behavior)

      if (strokeRadiusX > 0 && strokeRadiusY > 0) {
        drawArcPath(strokeRadiusX, strokeRadiusY, strokeStart, strokeEnd);
        context.stroke();
      }
    }

    context.restore();
  });
};

const circle = (context: CanvasRenderingContext2D, props: CircleProps) => {
  arc(context, { ...props, start: 0, end: 360 });
};

const ellipse = (context: CanvasRenderingContext2D, props: EllipseProps) => {
  arc(context, { ...props, start: 0, end: 360 });
};

const rect = (context: CanvasRenderingContext2D, props: RectProps) => {
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

  // If width or height is zero, or rounds to zero, then render nothing
  if (width < 0.5 || height < 0.5) return;

  const cornerRadiusForRoundRect = isCorners(cornerRadius)
    ? [
        cornerRadius.topLeft,
        cornerRadius.topRight,
        cornerRadius.bottomLeft,
        cornerRadius.bottomRight,
      ]
    : cornerRadius;

  // Bounds for transform origin
  const bounds = { x, y, width, height };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    // Draw fill
    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.beginPath();
      context.roundRect(x, y, width, height, cornerRadiusForRoundRect);
      context.fill();
    }

    // Draw stroke with alignment
    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;

      let strokeX = x;
      let strokeY = y;
      let strokeWidth_dim = width;
      let strokeHeight = height;

      if (strokeAlignment === "inside") {
        // Inset the stroke by half its width
        const inset = strokeWidth / 2;
        strokeX = x + inset;
        strokeY = y + inset;
        strokeWidth_dim = width - strokeWidth;
        strokeHeight = height - strokeWidth;
      } else if (strokeAlignment === "outside") {
        // Outset the stroke by half its width
        const outset = strokeWidth / 2;
        strokeX = x - outset;
        strokeY = y - outset;
        strokeWidth_dim = width + strokeWidth;
        strokeHeight = height + strokeWidth;
      }
      // For "center", use the original bounds (default canvas behavior)

      if (strokeWidth_dim > 0 && strokeHeight > 0) {
        context.beginPath();
        context.roundRect(
          strokeX,
          strokeY,
          strokeWidth_dim,
          strokeHeight,
          cornerRadiusForRoundRect,
        );
        context.stroke();
      }
    }

    context.restore();
  });
};

const text = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
) => {
  const {
    x = 0,
    y = 0,
    fontStyle = DEFAULT_TEXT_FONT_STYLE,
    fillStyle = DEFAULT_TEXT_FILL_STYLE,
    strokeStyle = DEFAULT_TEXT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const bounds = getTextBounds(context, textValue, x, y, fontStyle);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    context.font = fontStyle;
    context.textBaseline = "top";

    if (fillStyle !== "transparent") {
      context.fillStyle = fillStyle;
      context.fillText(textValue, x, y);
    }

    if (strokeStyle !== "transparent" && strokeWidth > 0) {
      context.strokeStyle = strokeStyle;
      context.lineWidth = strokeWidth;
      context.strokeText(textValue, x, y);
    }

    context.restore();
  });
};

const image = (
  context: CanvasRenderingContext2D,
  asset: LoadedImageAsset,
  props: ImageProps,
) => {
  const {
    x = 0,
    y = 0,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    width,
    height,
    fit = "cover",
  } = props;

  const hasScaledDimensions = width !== undefined && height !== undefined;

  if (hasScaledDimensions && (width <= 0 || height <= 0)) {
    return;
  }

  const renderedFrameWidth = hasScaledDimensions ? width : asset.width;
  const renderedFrameHeight = hasScaledDimensions ? height : asset.height;

  const bounds = {
    x,
    y,
    width: renderedFrameWidth,
    height: renderedFrameHeight,
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    if (!hasScaledDimensions) {
      context.drawImage(asset.source, x, y);
      context.restore();
      return;
    }

    switch (fit) {
      case "stretch": {
        context.drawImage(asset.source, x, y, width, height);
        context.restore();
        return;
      }
      case "contain": {
        const containScale = Math.min(
          width / asset.width,
          height / asset.height,
        );
        const containedWidth = asset.width * containScale;
        const containedHeight = asset.height * containScale;
        const dx = x + (width - containedWidth) / 2;
        const dy = y + (height - containedHeight) / 2;

        context.drawImage(
          asset.source,
          dx,
          dy,
          containedWidth,
          containedHeight,
        );
        context.restore();
        return;
      }
      default:
      case "cover": {
        // cover (default): crop source to frame aspect ratio, then fill frame.
        const frameAspect = width / height;
        const sourceAspect = asset.width / asset.height;

        let sx = 0;
        let sy = 0;
        let sourceWidth = asset.width;
        let sourceHeight = asset.height;

        if (sourceAspect > frameAspect) {
          sourceWidth = asset.height * frameAspect;
          sx = (asset.width - sourceWidth) / 2;
        } else if (sourceAspect < frameAspect) {
          sourceHeight = asset.width / frameAspect;
          sy = (asset.height - sourceHeight) / 2;
        }

        context.drawImage(
          asset.source,
          sx,
          sy,
          sourceWidth,
          sourceHeight,
          x,
          y,
          width,
          height,
        );

        context.restore();
      }
    }
  });
};

export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ) => void;
}

export const createDrawContext = (): DrawContext => {
  const registry = new AnimatableRegistry();

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): void => {
    registry.beginFrame(timeInMs);

    let appliedStyles: PartialDrawStyles = {
      fillStyle: DEFAULT_TEXT_FILL_STYLE,
      strokeStyle: DEFAULT_TEXT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      blend: DEFAULT_BLEND_MODE,
    };

    const mergeStyles = <T extends PartialDrawStyles>(
      props: T,
    ): T & PartialDrawStyles =>
      ({
        ...appliedStyles,
        ...props,
      }) as T & PartialDrawStyles;

    const withStyles = (
      styles: PartialDrawStyles,
      callback: () => void,
    ): void => {
      const previousStyles = appliedStyles;
      appliedStyles = { ...appliedStyles, ...styles };

      try {
        return callback();
      } finally {
        appliedStyles = previousStyles;
      }
    };

    // Build the draw methods
    const methods: DrawMethods = {
      width,
      height,
      withStyles,
      background: (props: BackgroundProps) => background(context, props),
      center: { x: width / 2, y: height / 2 },
      centerOf,
      line: (props: LineProps) =>
        registry.queue(mergeStyles(props), (p) => line(context, p)),
      polygon: (props: PolygonProps) =>
        registry.queue(mergeStyles(props), (p) => polygon(context, p)),
      bezier: (props: BezierProps) =>
        registry.queue(mergeStyles(props), (p) => bezier(context, p)),
      circle: (props: CircleProps) =>
        registry.queue(mergeStyles(props), (p) => circle(context, p)),
      ellipse: (props: EllipseProps) =>
        registry.queue(mergeStyles(props), (p) => ellipse(context, p)),
      arc: (props: ArcProps) =>
        registry.queue(mergeStyles(props), (p) => arc(context, p)),
      rect: (props: RectProps) =>
        registry.queue(mergeStyles(props), (p) => rect(context, p)),
      text: (textValue: string, props: TextProps = {}) =>
        registry.queue(mergeStyles(props), (p) => text(context, textValue, p)),
      image: (imageSrc: string, props: ImageProps = {}) =>
        registry.queue(mergeStyles(props), (p) => {
          const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

          if (readyImageAsset) {
            image(context, readyImageAsset, p);
          }
        }),
    };

    // Execute the user's callback (queues shapes and their .to() animations)
    callback(methods);
    registry.flush();
    registry.endFrame();
  };

  return { executeDrawCallback };
};
