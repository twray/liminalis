import type { Dimensions2D, Point2D } from "../types";

const DEFAULT_BACKGROUND_COLOR = "#fff";
const DEFAULT_FILL_STYLE = "#333";
const DEFAULT_STROKE_STYLE = "transparent";
const DEFAULT_STROKE_WIDTH = 0;

interface FillStyles {
  fillColor?: string;
}

interface StrokeStyles {
  strokeColor?: string;
  strokeWidth?: number;
}

export interface BackgroundProps {
  backgroundColor: string;
}

export interface CircleProps extends FillStyles, StrokeStyles {
  cx: number;
  cy: number;
  radius: number;
}

export interface RectangleProps
  extends Point2D,
    Dimensions2D,
    FillStyles,
    StrokeStyles {}

export interface LineProps extends StrokeStyles {
  start: Point2D;
  end: Point2D;
}

const setBackground = (
  context: CanvasRenderingContext2D,
  props: BackgroundProps
) => {
  const { backgroundColor = DEFAULT_BACKGROUND_COLOR } = props;

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

const drawCircle = (context: CanvasRenderingContext2D, props: CircleProps) => {
  const {
    cx,
    cy,
    radius,
    fillColor: fillStyle = DEFAULT_FILL_STYLE,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
  } = props;

  context.save();

  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.arc(cx, cy, radius, 0, Math.PI * 2);

  context.fill();
  context.stroke();

  context.restore();
};

const drawRectangle = (
  context: CanvasRenderingContext2D,
  props: RectangleProps
) => {
  const {
    x,
    y,
    width,
    height,
    fillColor: fillStyle = DEFAULT_FILL_STYLE,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
  } = props;

  context.save();

  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = strokeWidth;

  context.beginPath();

  context.rect(x, y, width, height);

  context.fill();
  context.stroke();

  context.restore();
};

const drawLine = (context: CanvasRenderingContext2D, props: LineProps) => {
  const {
    start,
    end,
    strokeColor: strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
  } = props;

  context.save();

  context.strokeStyle = strokeStyle;
  context.lineWidth = strokeWidth;

  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);

  context.stroke();

  context.restore();
};

export const getContextPrimitives = (context: CanvasRenderingContext2D) => ({
  setBackground: (props: BackgroundProps) => setBackground(context, props),
  drawRectangle: (props: RectangleProps) => drawRectangle(context, props),
  drawCircle: (props: CircleProps) => drawCircle(context, props),
  drawLine: (props: LineProps) => drawLine(context, props),
});

export interface ContextPrimitives {
  setBackground: (props: BackgroundProps) => void;
  drawRectangle: (props: RectangleProps) => void;
  drawCircle: (props: CircleProps) => void;
  drawLine: (props: LineProps) => void;
}
