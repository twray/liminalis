import { animatable } from "../core";
import { color } from "canvas-sketch-util";
import { easeInCubic } from "easing-utils";

export const springRectangle = () => {
  return animatable<{
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  }>().withRenderer(({ props, context, attackValue, decayFactor }) => {
    const { x, y, width, height, fill } = props;

    const easedDecayFactor = easeInCubic(decayFactor);

    const [r, g, b] = color.parse(fill).rgb;

    const fillWithAlpha = `rgba(${r}, ${g}, ${b}, ${easedDecayFactor})`;
    const renderedHeight = attackValue * height * easedDecayFactor;
    const yOffset = height - renderedHeight;

    context.save();
    context.fillStyle = fillWithAlpha;
    context.fillRect(x, y + yOffset, width, renderedHeight);
    context.restore();
  });
};
