import { easeOutBounce } from "easing-utils";
import { midiVisual } from "../../../core";

export const springCircle = () => {
  return midiVisual<{ xOffset: number }>().withRenderer(
    ({ props, circle, center, releaseFactor, attackValue, animate }) => {
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
        strokeStyle: "#666",
        opacity: releaseFactor,
      });
    }
  );
};
