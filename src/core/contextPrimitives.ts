import { color as colorUtil } from "canvas-sketch-util";
import type { Dimensions2D, Point2D } from "../types";
import { isNormalizedFloat } from "../util";

const DEFAULT_BACKGROUND_COLOR = "#fff";
const DEFAULT_FILL_STYLE = "transparent";
const DEFAULT_STROKE_STYLE = "#333";
const DEFAULT_STROKE_WIDTH = 0;

interface FillStyles {
  fillColor?: string;
}

interface StrokeStyles {
  strokeColor?: string;
  strokeWidth?: number;
}

interface WithOpacity {
  opacity?: number;
}

export interface BackgroundProps {
  color: string;
}

export interface CircleProps extends FillStyles, StrokeStyles, WithOpacity {
  cx: number;
  cy: number;
  radius: number;
}

export interface RectangleProps
  extends Point2D,
    Dimensions2D,
    FillStyles,
    StrokeStyles,
    WithOpacity {}

export interface LineProps extends StrokeStyles, WithOpacity {
  start: Point2D;
  end: Point2D;
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

const circle = (context: CanvasRenderingContext2D, props: CircleProps) => {
  const {
    cx,
    cy,
    radius,
    fillColor: fillStyle = DEFAULT_FILL_STYLE,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
  } = props;

  context.save();

  context.fillStyle = getColorWithOpacity(fillStyle, opacity);
  context.strokeStyle = getColorWithOpacity(strokeStyle, opacity);
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.arc(cx, cy, radius, 0, Math.PI * 2);

  context.fill();
  context.stroke();

  context.restore();
};

const rect = (context: CanvasRenderingContext2D, props: RectangleProps) => {
  const {
    x,
    y,
    width,
    height,
    fillColor: fillStyle = DEFAULT_FILL_STYLE,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
  } = props;

  context.save();

  context.fillStyle = getColorWithOpacity(fillStyle, opacity);
  context.strokeStyle = getColorWithOpacity(strokeStyle, opacity);
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.rect(x, y, width, height);

  context.fill();
  context.stroke();

  context.restore();
};

const line = (context: CanvasRenderingContext2D, props: LineProps) => {
  const {
    start,
    end,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
  } = props;

  context.save();

  context.strokeStyle = getColorWithOpacity(strokeStyle, opacity);
  context.lineWidth = strokeWidth;

  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);

  context.stroke();

  context.restore();
};

export const getContextPrimitives = (context: CanvasRenderingContext2D) => ({
  background: (props: BackgroundProps) => background(context, props),
  rect: (props: RectangleProps) => rect(context, props),
  circle: (props: CircleProps) => circle(context, props),
  line: (props: LineProps) => line(context, props),
});

export interface ContextPrimitives {
  background: (props: BackgroundProps) => void;
  rect: (props: RectangleProps) => void;
  circle: (props: CircleProps) => void;
  line: (props: LineProps) => void;
}
