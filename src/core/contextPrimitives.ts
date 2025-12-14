import { color as colorUtil } from "canvas-sketch-util";
import type { Corners, Dimensions2D, Point2D } from "../types";
import { isCorners, isNormalizedFloat } from "../util";

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

  console.log({ fillStyle });

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

export const getContextPrimitives = (context: CanvasRenderingContext2D) => {
  let defaultStyles: Partial<FillStyles & StrokeStyles & WithOpacity> = {
    fillStyle: DEFAULT_FILL_STYLE,
    strokeStyle: DEFAULT_STROKE_STYLE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  };

  const mergedStyles = <
    T extends Partial<FillStyles & StrokeStyles & WithOpacity>
  >(
    props: T
  ): T =>
    ({
      ...defaultStyles,
      ...props,
    } as T);

  return {
    withStyles: <T>(
      styles: Partial<FillStyles & StrokeStyles & WithOpacity>,
      callback: () => T
    ): T => {
      const previousStyles = defaultStyles;
      defaultStyles = { ...defaultStyles, ...styles };
      try {
        return callback();
      } finally {
        defaultStyles = previousStyles;
      }
    },

    translate: <T>(props: Point2D, callback: () => T): T => {
      const { x, y } = props;
      context.save();
      context.translate(x, y);
      try {
        return callback();
      } finally {
        context.restore();
      }
    },

    rotate: <T>(props: RotateProps, callback: () => T): T => {
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
    },

    scale: <T>(props: ScaleProps, callback: () => T): T => {
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
    },

    background: (props: BackgroundProps) => background(context, props),
    centerOf,
    rect: (props: RectProps) => rect(context, mergedStyles(props)),
    circle: (props: CircleProps) => circle(context, mergedStyles(props)),
    line: (props: LineProps) => line(context, mergedStyles(props)),
  };
};

export interface ContextPrimitives {
  withStyles: <T>(
    styles: Partial<FillStyles & StrokeStyles & WithOpacity>,
    callback: () => T
  ) => T;
  translate: <T>(props: Point2D, callback: () => T) => T;
  rotate: <T>(props: RotateProps, callback: () => T) => T;
  scale: <T>(props: ScaleProps, callback: () => T) => T;
  background: (props: BackgroundProps) => void;
  centerOf: (props: Dimensions2D) => Point2D;
  rect: (props: RectProps) => void;
  circle: (props: CircleProps) => void;
  line: (props: LineProps) => void;
}
