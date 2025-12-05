import { easeOutBounce } from "easing-utils";
import { animatable } from "../../../core";

export const springCircle = () => {
  return animatable<{ xOffset: number }>().withRenderer(
    ({ props, circle, center, decayFactor, attackValue, animate }) => {
      const { xOffset = 0 } = props;
      const { x: cx, y: cy } = center;

      circle({
        cx: cx + xOffset,
        cy,
        radius: animate({
          from: 0,
          to: 100 * attackValue,
          duration: 1000 * attackValue,
          easing: easeOutBounce,
        }),
        strokeColor: "#666",
        opacity: decayFactor,
      });
    }
  );
};
