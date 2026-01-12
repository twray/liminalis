import { color as colorUtil } from "canvas-sketch-util";
import type {
  Corners,
  Dimensions2D,
  PartialDrawStyles,
  Point2D,
} from "../types";
import { isCorners, isNormalizedFloat } from "../util";
import Animatable from "./Animatable";

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

export interface CircleProps extends FillStyles, StrokeStyles, WithOpacity {
  cx?: number;
  cy?: number;
  radius: number;
}

export interface LineProps extends StrokeStyles, WithOpacity {
  start: Partial<Point2D>;
  end: Partial<Point2D>;
}

export interface RectProps
  extends Partial<Point2D>,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    WithOpacity {
  cornerRadius?: Corners | number;
}

export interface RotateProps {
  degrees: number;
  origin?: Point2D;
}

export interface ScaleProps {
  sx: number;
  sy: number;
  origin?: Point2D;
}

export interface DrawMethods {
  width: number;
  height: number;
  withStyles: (styles: PartialDrawStyles, callback: () => void) => void;
  translate: (props: Point2D, callback: () => void) => void;
  rotate: (props: RotateProps, callback: () => void) => void;
  scale: (props: ScaleProps, callback: () => void) => void;
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

  context.save();

  context.fillStyle = getColorWithOpacity(fillStyle, opacity);
  context.strokeStyle = getColorWithOpacity(strokeStyle, opacity);
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.arc(cx, cy, validatedRadius, 0, Math.PI * 2);

  context.fill();
  context.stroke();

  context.restore();
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

  const cornerRadiusForRoundRect = isCorners(cornerRadius)
    ? [
        cornerRadius.topLeft,
        cornerRadius.topRight,
        cornerRadius.bottomLeft,
        cornerRadius.bottomRight,
      ]
    : cornerRadius;

  context.save();

  context.fillStyle = getColorWithOpacity(fillColor, opacity);
  context.strokeStyle = getColorWithOpacity(strokeColor, opacity);
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.roundRect(x, y, width, height, cornerRadiusForRoundRect);

  context.fill();
  context.stroke();

  context.restore();
};

const line = (context: CanvasRenderingContext2D, props: LineProps) => {
  const {
    start: { x: startX = 0, y: startY = 0 },
    end: { x: endX = 0, y: endY = 0 },
    strokeStyle: strokeColor = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
  } = props;

  context.save();

  context.strokeStyle = getColorWithOpacity(strokeColor, opacity);
  context.lineWidth = strokeWidth;

  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);

  context.stroke();

  context.restore();
};

const translate = (
  context: CanvasRenderingContext2D,
  props: Point2D,
  callback: () => void
) => {
  const { x, y } = props;

  context.save();
  context.translate(x, y);

  try {
    return callback();
  } finally {
    context.restore();
  }
};

const rotate = (
  context: CanvasRenderingContext2D,
  props: RotateProps,
  callback: () => void
): void => {
  const { degrees, origin } = props;
  const radians = (degrees * Math.PI) / 180;

  context.save();

  if (origin) {
    context.translate(origin.x, origin.y);
    context.rotate(radians);
    context.translate(-origin.x, -origin.y);
  } else {
    context.rotate(radians);
  }

  try {
    return callback();
  } finally {
    context.restore();
  }
};

const scale = (
  context: CanvasRenderingContext2D,
  props: ScaleProps,
  callback: () => void
): void => {
  const { sx, sy, origin } = props;

  context.save();

  if (origin) {
    context.translate(origin.x, origin.y);
    context.scale(sx, sy);
    context.translate(-origin.x, -origin.y);
  } else {
    context.scale(sx, sy);
  }

  try {
    return callback();
  } finally {
    context.restore();
  }
};

interface PendingAnimatable {
  animatable: Animatable<any>;
  mergedStyles: any;
  renderFn: (props: any) => void;
}

/**
 * Entry in the shape registry.
 * Stores the Animatable instance directly, preserving all state across frames.
 */
interface ShapeRegistryEntry {
  animatable: Animatable<any>;
  lastSeenFrame: number;
}

/**
 * Draw context with encapsulated state for shape timestamp tracking
 */
export interface DrawContext {
  executeDrawCallback: (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number
  ) => void;
}

/**
 * Creates a draw context with its own encapsulated shape registry.
 *
 * Each consumer (VisualisationAnimationLoopHandler, MidiVisual, etc.) should
 * create its own draw context to maintain isolated state.
 *
 * The registry stores Animatable instances directly, preserving all animation
 * state across frames. Each frame, segments are cleared and rebuilt (since
 * animations may be defined dynamically), but internal state is preserved.
 */
export const createDrawContext = (): DrawContext => {
  const shapeRegistry = new Map<string, ShapeRegistryEntry>();
  let frameCount = 0;

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number
  ): void => {
    frameCount++;
    let callIndex = 0;

    /**
     * Get or create the Animatable for a shape from the registry.
     * If existing, clears segments for fresh definition this frame.
     */
    const getOrCreateAnimatable = <T extends Record<string, any>>(
      shapeType: string,
      props: T
    ): Animatable<T> => {
      const shapeId = `${shapeType}:${callIndex++}`;

      const existing = shapeRegistry.get(shapeId);
      if (existing) {
        existing.lastSeenFrame = frameCount;
        // Update props and clear segments for fresh definition this frame
        existing.animatable.updateInitialProps(props);
        existing.animatable.clearSegments();
        return existing.animatable as Animatable<T>;
      }

      // Create new Animatable
      const animatable = new Animatable<T>(props, timeInMs);
      shapeRegistry.set(shapeId, {
        animatable,
        lastSeenFrame: frameCount,
      });
      return animatable;
    };

    // Queue of shapes pending render
    const pendingAnimatable: PendingAnimatable[] = [];

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

    /**
     * Queue a shape for deferred rendering and return its Animatable
     */
    const queueAnimatableForRendering = <T extends PartialDrawStyles>(
      shapeType: string,
      props: T,
      renderFn: (props: T) => void
    ): Animatable<T> => {
      const mergedStyles = mergeStyles(props);
      const animatable = getOrCreateAnimatable(shapeType, props);

      pendingAnimatable.push({
        animatable,
        mergedStyles,
        renderFn: renderFn as (props: any) => void,
      });

      return animatable;
    };

    // Build the draw methods
    const methods: DrawMethods = {
      width,
      height,
      withStyles,
      translate: (props: Point2D, cb: () => void) =>
        translate(context, props, cb),
      rotate: (props: RotateProps, cb: () => void): void =>
        rotate(context, props, cb),
      scale: (props: ScaleProps, cb: () => void): void =>
        scale(context, props, cb),
      background: (props: BackgroundProps) => background(context, props),
      center: { x: width / 2, y: height / 2 },
      centerOf,
      rect: (props: RectProps) =>
        queueAnimatableForRendering("rect", props, (p) => rect(context, p)),
      circle: (props: CircleProps) =>
        queueAnimatableForRendering("circle", props, (p) => circle(context, p)),
      line: (props: LineProps) =>
        queueAnimatableForRendering("line", props, (p) => line(context, p)),
    };

    // Execute the user's callback (queues shapes and their .to() animations)
    callback(methods);

    // Flush - render all queued shapes with their animated values
    for (const pending of pendingAnimatable) {
      const animatedProps = pending.animatable.getCurrentProps(timeInMs);
      const finalProps = { ...pending.mergedStyles, ...animatedProps };
      pending.renderFn(finalProps);
    }

    // Cleanup stale shapes not seen in this frame
    for (const [key, entry] of shapeRegistry) {
      if (entry.lastSeenFrame !== frameCount) {
        shapeRegistry.delete(key);
      }
    }
  };

  return { executeDrawCallback };
};
