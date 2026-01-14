import { color as colorUtil } from "canvas-sketch-util";
import type {
  Corners,
  Dimensions2D,
  PartialDrawStyles,
  Point2D,
} from "../types";
import { isCorners, isNormalizedFloat } from "../util";
import type Animatable from "./Animatable";
import AnimatableRegistry from "./AnimatableRegistry";

const DEFAULT_BACKGROUND_COLOR = "#fff";
const DEFAULT_FILL_STYLE = "transparent";
const DEFAULT_STROKE_STYLE = "#333";
const DEFAULT_STROKE_WIDTH = 1;

interface FillStyles {
  fillStyle?: string;
}

interface StrokeStyles {
  strokeStyle?: string;
  strokeWidth?: number;
}

interface WithOpacity {
  opacity?: number;
}

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

export interface CircleProps
  extends FillStyles,
    StrokeStyles,
    WithOpacity,
    TransformProps {
  cx?: number;
  cy?: number;
  radius: number;
}

export interface LineProps extends StrokeStyles, WithOpacity, TransformProps {
  start: Partial<Point2D>;
  end: Partial<Point2D>;
}

export interface RectProps
  extends Partial<Point2D>,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    WithOpacity,
    TransformProps {
  cornerRadius?: Corners | number;
}

export interface DrawMethods {
  width: number;
  height: number;
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  background: (props: BackgroundProps) => void;
  center: Point2D;
  centerOf: (props: Dimensions2D) => Point2D;
  rect: (props: RectProps) => Animatable<RectProps>;
  circle: (props: CircleProps) => Animatable<CircleProps>;
  line: (props: LineProps) => Animatable<LineProps>;
}

const getColorWithOpacity = (color: string, opacity: number) => {
  let validatedOpacity = 1;

  if (color === "transparent") return color;

  if (!isNormalizedFloat(opacity)) {
    console.warn("Opacity value must be between 0 and 1");
  } else {
    validatedOpacity = opacity;
  }

  try {
    const [r, g, b, a] = colorUtil.parse(color).rgba;
    return `rgba(${r}, ${g}, ${b}, ${a < 1 ? a : validatedOpacity})`;
  } catch {
    console.warn(`Invalid color: ${color}`);
    return DEFAULT_STROKE_STYLE;
  }
};

const background = (
  context: CanvasRenderingContext2D,
  props: BackgroundProps
) => {
  const { color: backgroundColor = DEFAULT_BACKGROUND_COLOR } = props;

  context.save();

  context.fillStyle = backgroundColor;

  context.fillRect(
    0,
    0,
    context.canvas.width * window.devicePixelRatio,
    context.canvas.height * window.devicePixelRatio
  );

  context.restore();
};

const centerOf = (dimensions: Dimensions2D): Point2D => {
  const { width, height } = dimensions;
  return { x: width / 2, y: height / 2 };
};

const resolveTransformOrigin = (
  origin: TransformOrigin | undefined,
  bounds: { x: number; y: number; width: number; height: number }
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
  renderShape: () => void
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
    const radians = (rotate * Math.PI) / 180;
    context.translate(origin.x, origin.y);
    context.rotate(radians);
    context.translate(-origin.x, -origin.y);
  }

  renderShape();

  context.restore();
};

const circle = (context: CanvasRenderingContext2D, props: CircleProps) => {
  const {
    cx = 0,
    cy = 0,
    radius,
    fillStyle = DEFAULT_FILL_STYLE,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
  } = props;

  const validatedRadius = radius >= 0 ? radius : 0;

  // Calculate bounds for transform origin (bounding box of the circle)
  const bounds = {
    x: cx - validatedRadius,
    y: cy - validatedRadius,
    width: validatedRadius * 2,
    height: validatedRadius * 2,
  };

  renderWithTransform(context, props, bounds, () => {
    context.save();

    context.fillStyle = getColorWithOpacity(fillStyle, opacity);
    context.strokeStyle = getColorWithOpacity(strokeStyle, opacity);
    context.lineWidth = strokeWidth;

    context.beginPath();
    context.arc(cx, cy, validatedRadius, 0, Math.PI * 2);

    context.fill();
    context.stroke();

    context.restore();
  });
};

const rect = (context: CanvasRenderingContext2D, props: RectProps) => {
  const {
    x = 0,
    y = 0,
    width,
    height,
    fillStyle: fillColor = DEFAULT_FILL_STYLE,
    strokeStyle: strokeColor = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
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

    context.fillStyle = getColorWithOpacity(fillColor, opacity);
    context.strokeStyle = getColorWithOpacity(strokeColor, opacity);
    context.lineWidth = strokeWidth;

    context.beginPath();
    context.roundRect(x, y, width, height, cornerRadiusForRoundRect);

    context.fill();
    context.stroke();

    context.restore();
  });
};

const line = (context: CanvasRenderingContext2D, props: LineProps) => {
  const {
    start: { x: startX = 0, y: startY = 0 },
    end: { x: endX = 0, y: endY = 0 },
    strokeStyle: strokeColor = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
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

    context.strokeStyle = getColorWithOpacity(strokeColor, opacity);
    context.lineWidth = strokeWidth;

    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);

    context.stroke();

    context.restore();
  });
};

export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number
  ) => void;
}

export const createDrawContext = (): DrawContext => {
  const registry = new AnimatableRegistry();

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number
  ): void => {
    registry.beginFrame(timeInMs);

    let appliedStyles: PartialDrawStyles = {
      fillStyle: DEFAULT_FILL_STYLE,
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
    };

    const mergeStyles = <T extends PartialDrawStyles>(
      props: T
    ): T & PartialDrawStyles =>
      ({
        ...appliedStyles,
        ...props,
      } as T & PartialDrawStyles);

    const withStyles = (
      styles: PartialDrawStyles,
      callback: () => void
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
      rect: (props: RectProps) =>
        registry.queue(mergeStyles(props), (p) => rect(context, p)),
      circle: (props: CircleProps) =>
        registry.queue(mergeStyles(props), (p) => circle(context, p)),
      line: (props: LineProps) =>
        registry.queue(mergeStyles(props), (p) => line(context, p)),
    };

    // Execute the user's callback (queues shapes and their .to() animations)
    callback(methods);
    registry.flush();
    registry.endFrame();
  };

  return { executeDrawCallback };
};
