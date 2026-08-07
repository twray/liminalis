import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TEXT_FILL_STYLE,
  DEFAULT_TEXT_FONT_STYLE,
  DEFAULT_TEXT_STROKE_STYLE,
  getTextBounds,
  renderWithTransform,
  setContextGlobals,
} from "../common";
import type { TextProps } from "../types";

export const text = (
  context: CanvasRenderingContext2D,
  textValue: string,
  props: TextProps,
): void => {
  const {
    x = 0,
    y = 0,
    fontStyle = DEFAULT_TEXT_FONT_STYLE,
    fillStyle = DEFAULT_TEXT_FILL_STYLE,
    strokeStyle = DEFAULT_TEXT_STROKE_STYLE,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    opacity = 1,
    blend = DEFAULT_BLEND_MODE,
  } = props;

  const bounds = getTextBounds(context, textValue, x, y, fontStyle);

  renderWithTransform(context, props, bounds, () => {
    context.save();

    setContextGlobals(context, { opacity, blend });

    context.font = fontStyle;
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
