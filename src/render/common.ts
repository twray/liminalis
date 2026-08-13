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
