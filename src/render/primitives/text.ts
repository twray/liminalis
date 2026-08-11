import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_WIDTH,
  getTextBounds,
  renderWithTransform,
  setContextGlobals,
} from "../common";

import type { FontFamily, FontSize, FontStyle, FontWeight } from "../../types";
import type { TextProps } from "../types";

const DEFAULT_TEXT_FILL_STYLE = "#333";
const DEFAULT_TEXT_STROKE_STYLE = "transparent";
const DEFAULT_TEXT_FONT_STYLE: FontStyle = "normal";
const DEFAULT_TEXT_FONT_SIZE: FontSize = "12px";
const DEFAULT_TEXT_FONT_WEIGHT: FontWeight = "normal";
const DEFAULT_TEXT_FONT_FAMILY: FontFamily = "Arial, sans-serif";

export const text = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  const {
    x = 0,
    y = 0,
    fontStyle = DEFAULT_TEXT_FONT_STYLE,
    fontSize = DEFAULT_TEXT_FONT_SIZE,
    fontWeight = DEFAULT_TEXT_FONT_WEIGHT,
    fontFamily = DEFAULT_TEXT_FONT_FAMILY,
    fillStyle = DEFAULT_TEXT_FILL_STYLE,
    strokeStyle = DEFAULT_TEXT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  const bounds = getTextBounds(context, textValue, x, y, font);

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
