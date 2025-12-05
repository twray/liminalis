import { color } from "canvas-sketch-util";
import { easeInCubic, easeOutBack } from "easing-utils";
import { animatable } from "../../../core";

export const springRectangle = () => {
  return animatable<{
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  }>().withRenderer(({ props, attackValue, decayFactor, rect, animate }) => {
    const { x, y, width, height, fill } = props;

    const opacity = easeInCubic(decayFactor);

    const [r, g, b] = color.parse(fill).rgb;
    const fillWithAlpha = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    const renderedHeight = animate({
      from: 0,
      to: height * attackValue,
      duration: 1000 - attackValue * 1000,
      easing: easeOutBack,
    });

    const verticalMovementDistance = 100;
    const yOffset = height - renderedHeight;

    rect({
      x,
      y:
        y +
        yOffset -
        animate({
          duration: 1000 * attackValue,
          from: -verticalMovementDistance,
          to:
            -verticalMovementDistance + attackValue * verticalMovementDistance,
          easing: easeOutBack,
        }),
      width,
      height: renderedHeight,
      fillColor: fillWithAlpha,
    });
  });
};
