import { color } from "canvas-sketch-util";
import { easeOutBounce } from "easing-utils";
import { animatable } from "../core";

export const springCircle = () => {
  return animatable<{ xOffset: number }>().withRenderer(
    ({ props, circle, center, decayFactor, attackValue, animate }) => {
      const { xOffset = 0 } = props;
      const { x: cx, y: cy } = center;
      const [r, g, b] = color.parse("#666").rgb;
      const strokeColor = `rgba(${r}, ${g}, ${b}, ${decayFactor})`;

      circle({
        cx: cx + xOffset,
        cy,
        radius: animate({
          from: 0,
          to: 100 * attackValue,
          duration: 1000 * attackValue,
          easing: easeOutBounce,
        }),
        strokeColor,
      });
    }
  );
};
