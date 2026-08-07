import { DEFAULT_BACKGROUND_COLOR } from "../common";
import type { BackgroundProps } from "../types";

export const background = (
  context: CanvasRenderingContext2D,
  props: BackgroundProps,
): void => {
  const { color: backgroundColor = DEFAULT_BACKGROUND_COLOR } = props;

  context.save();
  context.fillStyle = backgroundColor;
  context.fillRect(
    0,
    0,
    context.canvas.width * window.devicePixelRatio,
    context.canvas.height * window.devicePixelRatio,
  );
  context.restore();
};
