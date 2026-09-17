import {
  computeTransformedMultipointAABB,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_LINE_CAP,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  deriveBoundsFromPoints,
  getLinearPartOfTransform,
  getRowNorms,
  hasVisibleStroke,
  renderWithTransform,
  resolveStrokeOutwardOffset,
  resolveTransformState,
  setContextGlobals,
} from "../common";
import type { Bounds, LineProps } from "../types";

export const line = (
  context: CanvasRenderingContext2D,
  props: LineProps,
): void => {
  const {
    start: { x: startX = 0, y: startY = 0 },
    end: { x: endX = 0, y: endY = 0 },
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    lineCap = DEFAULT_STROKE_LINE_CAP,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

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
    context.lineCap = lineCap;

    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    context.restore();
  });
};

export const getLineTransformedAABB = (props: LineProps): Bounds => {
  const {
    start,
    end,
    strokeStyle = DEFAULT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    lineCap = DEFAULT_STROKE_LINE_CAP,
  } = props;

  const bounds = computeTransformedMultipointAABB([start, end], props);

  if (!hasVisibleStroke({ strokeStyle, strokeWidth })) return bounds;

  // LineProps has no strokeAlignment -- always the "center" case (Section
  // 3) -- and no lineJoin (a single segment has no corners), so strokeWidth
  // and lineCap are the only relevant inputs.
  const extent = resolveStrokeOutwardOffset(strokeWidth, "center");

  // A "square" cap extends the stroke past each endpoint along the line's
  // own tangent direction, not just perpendicular to it -- since tangent
  // and perpendicular are orthonormal, the corner offset
  // tangent*(strokeWidth/2) + perpendicular*(strokeWidth/2) can reach up to
  // (strokeWidth/2)*sqrt(2) on either axis (Cauchy-Schwarz), exceeding the
  // plain round-pen pad for some orientations. Applied as a conservative,
  // orientation-independent multiplier rather than deriving the line's
  // actual tangent direction -- same spirit as the miter overshoot bound
  // for joinable shapes.
  const capMultiplier = lineCap === "square" ? Math.SQRT2 : 1;
  const outwardReach = extent * capMultiplier;

  const transformState = resolveTransformState(props, bounds);
  const { columnX, columnY } = getLinearPartOfTransform(start, transformState);
  const { rowNormX, rowNormY } = getRowNorms(columnX, columnY);
  const padX = outwardReach * rowNormX;
  const padY = outwardReach * rowNormY;

  return deriveBoundsFromPoints([
    { x: bounds.x - padX, y: bounds.y - padY },
    { x: bounds.x + bounds.width + padX, y: bounds.y + bounds.height + padY },
  ]);
};
