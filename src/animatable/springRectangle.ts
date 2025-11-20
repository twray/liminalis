import { color } from "canvas-sketch-util";
import { easeInCubic } from "easing-utils";
import { animatable } from "../core";

export const springRectangle = () => {
  return animatable<{
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  }>().withRenderer(({ props, attackValue, decayFactor, drawRectangle }) => {
    const { x, y, width, height, fill } = props;

    const easedDecayFactor = easeInCubic(decayFactor);

    const [r, g, b] = color.parse(fill).rgb;

    const fillWithAlpha = `rgba(${r}, ${g}, ${b}, ${easedDecayFactor})`;
    const renderedHeight = attackValue * height * easedDecayFactor;
    const yOffset = height - renderedHeight;

    drawRectangle({
      x,
      y: y + yOffset,
      width,
      height: renderedHeight,
      fillColor: fillWithAlpha,
    });
  });
};
