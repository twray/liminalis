import type { Dimensions2D, Point2D } from "../types";
import { degreesToRadians } from "../util";
import type {
  Bounds,
  ContextGlobalProps,
  TransformOrigin,
  TransformProps,
} from "./types";

export const DEFAULT_BACKGROUND_COLOR = "#fff";
export const DEFAULT_FILL_STYLE = "transparent";
export const DEFAULT_STROKE_STYLE = "#333";
export const DEFAULT_STROKE_WIDTH = 1;
export const DEFAULT_STROKE_ALIGNMENT = "center";
export const DEFAULT_BLEND_MODE: GlobalCompositeOperation = "source-over";

export const resolveTransformOrigin = (
  origin: TransformOrigin | undefined,
  bounds: Bounds,
): Point2D => {
  if (!origin || origin === "center") {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  return { x: bounds.x + origin.x, y: bounds.y + origin.y };
};

export const renderWithTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: Bounds,
  renderShape: () => void,
): void => {
  const { rotate, rotateOrigin, scale, scaleX, scaleY, scaleOrigin } = props;

  const hasRotate = rotate !== undefined && rotate !== 0;
  const effectiveScaleX = scaleX ?? scale ?? 1;
  const effectiveScaleY = scaleY ?? scale ?? 1;
  const isInvertibleScale = effectiveScaleX !== 0 && effectiveScaleY !== 0;
  const hasScale =
    isInvertibleScale && (effectiveScaleX !== 1 || effectiveScaleY !== 1);

  if (!hasRotate && !hasScale) {
    renderShape();
    return;
  }

  context.save();

  if (hasScale) {
    const origin = resolveTransformOrigin(scaleOrigin, bounds);
    context.translate(origin.x, origin.y);
    context.scale(effectiveScaleX, effectiveScaleY);
    context.translate(-origin.x, -origin.y);
  }

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

export const getTextBounds = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontStyle: string,
): Bounds => {
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

  return { x, y, width, height };
};

export const setContextGlobals = (
  context: CanvasRenderingContext2D,
  props: ContextGlobalProps,
): void => {
  const { opacity = 0, blend = DEFAULT_BLEND_MODE } = props;

  context.globalAlpha = opacity;
  context.globalCompositeOperation = blend;
};

export const centerOf = (dimensions: Dimensions2D): Point2D => {
  const { width, height } = dimensions;
  return { x: width / 2, y: height / 2 };
};

export const applyForwardTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: Bounds,
): {
  hasScale: boolean;
  hasRotate: boolean;
  effectiveScaleX: number;
  effectiveScaleY: number;
  scaleOrigin: Point2D;
  rotateOrigin: Point2D;
  radians: number;
} => {
  const { rotate, rotateOrigin, scale, scaleX, scaleY, scaleOrigin } = props;

  const hasRotate = rotate !== undefined && rotate !== 0;
  const effectiveScaleX = scaleX ?? scale ?? 1;
  const effectiveScaleY = scaleY ?? scale ?? 1;
  const isInvertibleScale = effectiveScaleX !== 0 && effectiveScaleY !== 0;
  const hasScale =
    isInvertibleScale && (effectiveScaleX !== 1 || effectiveScaleY !== 1);

  const resolvedScaleOrigin = resolveTransformOrigin(scaleOrigin, bounds);
  const resolvedRotateOrigin = resolveTransformOrigin(rotateOrigin, bounds);
  const radians = degreesToRadians(rotate ?? 0);

  if (hasScale) {
    context.translate(resolvedScaleOrigin.x, resolvedScaleOrigin.y);
    context.scale(effectiveScaleX, effectiveScaleY);
    context.translate(-resolvedScaleOrigin.x, -resolvedScaleOrigin.y);
  }

  if (hasRotate) {
    context.translate(resolvedRotateOrigin.x, resolvedRotateOrigin.y);
    context.rotate(radians);
    context.translate(-resolvedRotateOrigin.x, -resolvedRotateOrigin.y);
  }

  return {
    hasScale,
    hasRotate,
    effectiveScaleX,
    effectiveScaleY,
    scaleOrigin: resolvedScaleOrigin,
    rotateOrigin: resolvedRotateOrigin,
    radians,
  };
};

export const undoForwardTransform = (
  context: CanvasRenderingContext2D,
  transformState: ReturnType<typeof applyForwardTransform>,
): void => {
  const {
    hasRotate,
    hasScale,
    radians,
    rotateOrigin,
    scaleOrigin,
    effectiveScaleX,
    effectiveScaleY,
  } = transformState;

  if (hasRotate) {
    context.translate(rotateOrigin.x, rotateOrigin.y);
    context.rotate(-radians);
    context.translate(-rotateOrigin.x, -rotateOrigin.y);
  }

  if (hasScale) {
    context.translate(scaleOrigin.x, scaleOrigin.y);
    context.scale(1 / effectiveScaleX, 1 / effectiveScaleY);
    context.translate(-scaleOrigin.x, -scaleOrigin.y);
  }
};

export const clipToEmptyRegion = (context: CanvasRenderingContext2D): void => {
  context.beginPath();
  context.rect(0, 0, 0, 0);
  context.clip();
};
