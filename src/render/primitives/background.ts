import { DEFAULT_BACKGROUND_COLOR } from "../common";
import type { BackgroundProps } from "../types";
import { devicePixelRatio } from "../../util";

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
    context.canvas.width * devicePixelRatio,
    context.canvas.height * devicePixelRatio,
  );
  context.restore();
};
