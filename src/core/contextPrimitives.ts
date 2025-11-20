const DEFAULT_BACKGROUND_COLOR = "#fff";
const DEFAULT_FILL_STYLE = "#333";
const DEFAULT_STROKE_STYLE = "transparent";
const DEFAULT_STROKE_WIDTH = 0;

interface Coordinates {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

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
  extends Coordinates,
    Size,
    FillStyles,
    StrokeStyles {}

export interface LineProps extends StrokeStyles {
  start: Coordinates;
  end: Coordinates;
}

const setBackground = (
  context: CanvasRenderingContext2D,
  props: BackgroundProps
) => {
  const { backgroundColor = DEFAULT_BACKGROUND_COLOR } = props;

  context.save();

  context.fillStyle = backgroundColor;

  context.fillRect(0, 0, context.canvas.width, context.canvas.height);

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

const getCentre = (context: CanvasRenderingContext2D) => ({
  x: context.canvas.width / 2,
  y: context.canvas.height / 2,
});

export interface ContextPrimitives {}

export const getContextPrimitives = (context: CanvasRenderingContext2D) => ({
  getCentre: () => getCentre(context),
  setBackground: (props: BackgroundProps) => setBackground(context, props),
  drawRectangle: (props: RectangleProps) => drawRectangle(context, props),
  drawCircle: (props: CircleProps) => drawCircle(context, props),
  drawLine: (props: LineProps) => drawLine(context, props),
});

export interface ContextPrimitives {
  getCentre: () => Coordinates;
  setBackground: (props: BackgroundProps) => void;
  drawRectangle: (props: RectangleProps) => void;
  drawCircle: (props: CircleProps) => void;
  drawLine: (props: LineProps) => void;
}
