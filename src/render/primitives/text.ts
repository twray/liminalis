import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_WIDTH,
  renderWithTransform,
  setContextGlobals,
} from "../common";

import type { Bounds, ClipScope, TextProps } from "../types";

const DEFAULT_TEXT_FILL_STYLE = "#333";
const DEFAULT_TEXT_STROKE_STYLE = "transparent";
const DEFAULT_TEXT_FONT_STYLE = "normal";
const DEFAULT_TEXT_FONT_SIZE = "12px";
const DEFAULT_TEXT_FONT_WEIGHT = "normal";
const DEFAULT_TEXT_FONT_FAMILY = "Arial, sans-serif";

const resolveTextProps = (props: TextProps) => {
  const {
    x = 0,
    y = 0,
    fontStyle = DEFAULT_TEXT_FONT_STYLE,
    fontSize = DEFAULT_TEXT_FONT_SIZE,
    fontWeight = DEFAULT_TEXT_FONT_WEIGHT,
    fontFamily = DEFAULT_TEXT_FONT_FAMILY,
    strokeStyle = DEFAULT_TEXT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    fillStyle = DEFAULT_TEXT_FILL_STYLE,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
    font,
  } = props;

  return {
    x,
    y,
    strokeStyle,
    strokeWidth,
    fillStyle,
    opacity,
    blend,
    font: font ?? `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`,
  };
};

export const getTextBounds = (
  context: CanvasRenderingContext2D,
  text: string,
  props: TextProps,
): Bounds => {
  const { x, y, font } = resolveTextProps(props);

  context.save();

  context.font = font;
  const metrics = context.measureText(text);

  context.restore();

  const width = metrics.width ?? 0;

  const fallbackHeightMatch = font.match(/(\d+(?:\.\d+)?)px/);
  const fallbackHeight = fallbackHeightMatch
    ? Number(fallbackHeightMatch[1])
    : 12;

  const ascent = metrics.actualBoundingBoxAscent ?? fallbackHeight;
  const descent = metrics.actualBoundingBoxDescent ?? 0;
  const height = Math.max(ascent + descent, fallbackHeight);

  const { strokeStyle = "transparent", strokeWidth = 0 } = props;
  const shouldInflateForStroke =
    strokeStyle !== "transparent" && strokeWidth > 0;

  if (!shouldInflateForStroke) {
    return { x, y, width, height };
  }

  const strokeInflation = strokeWidth / 2;

  return {
    x: x - strokeInflation,
    y: y - strokeInflation,
    width: width + strokeWidth,
    height: height + strokeWidth,
  };
};

export const createTextMaskScope = ({
  textValue,
  getProps,
}: {
  textValue: string;
  getProps: () => TextProps;
}): ClipScope => {
  return {
    renderWithScope: ({
      context,
      renderWithinScope,
      contextController,
    }): void => {
      const renderTarget =
        typeof document !== "undefined"
          ? document.createElement("canvas")
          : null;

      if (!renderTarget) {
        renderWithinScope();
        return;
      }

      renderTarget.width = context.canvas.width;
      renderTarget.height = context.canvas.height;

      const renderTargetContext = renderTarget.getContext("2d");

      if (!renderTargetContext) {
        renderWithinScope();
        return;
      }

      const sourceTransform =
        typeof context.getTransform === "function"
          ? context.getTransform()
          : null;

      if (
        sourceTransform &&
        typeof renderTargetContext.setTransform === "function"
      ) {
        renderTargetContext.setTransform(sourceTransform);
      }

      const props = getProps();
      const previousContext = contextController.getContext();

      contextController.setContext(renderTargetContext);

      if (props.useLocalCoordinateContext) {
        const bounds = getTextBounds(renderTargetContext, textValue, props);
        renderTargetContext.save();
        renderTargetContext.translate(bounds.x, bounds.y);
        renderWithinScope();
        renderTargetContext.restore();
      } else {
        renderWithinScope();
      }

      contextController.setContext(previousContext);

      renderTargetContext.save();
      renderTargetContext.globalCompositeOperation = "destination-in";
      drawTextMask(renderTargetContext, textValue, props);
      renderTargetContext.restore();

      context.save();

      if (typeof context.setTransform === "function") {
        context.setTransform(1, 0, 0, 1, 0, 0);
      }

      context.drawImage(renderTarget, 0, 0);
      context.restore();
    },
  };
};

export const drawTextMask = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  if (textValue.length === 0) {
    return;
  }

  const { x, y, font } = resolveTextProps(props);
  const bounds = getTextBounds(context, textValue, props);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    context.font = font;
    context.textBaseline = "top";
    context.fillStyle = "#000";
    context.fillText(textValue, x, y);

    context.restore();
  });
};

export const text = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  const { x, y, strokeStyle, strokeWidth, fillStyle, opacity, blend, font } =
    resolveTextProps(props);

  const bounds = getTextBounds(context, textValue, props);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    context.font = font;
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
