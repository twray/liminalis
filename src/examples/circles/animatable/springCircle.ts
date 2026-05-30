import { visual } from "../../../core";

export const springCircle = visual<{ xOffset: number }>(
  ({ props, draw, center, releaseFactor, timeAttacked }) => {
    const { xOffset = 0 } = props;
    const { x: cx, y: cy } = center;

    draw(({ circle }) => {
      circle({
        cx: cx + xOffset,
        cy,
        radius: 0,
        strokeStyle: "#666",
        opacity: releaseFactor,
      }).animateTo(
        { radius: 100 },
        { at: timeAttacked, duration: 1000, easing: "easeOutBounce" },
      );
    });
  },
);
