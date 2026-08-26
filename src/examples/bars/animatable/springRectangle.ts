import { easeInCubic } from "easing-utils";
import { visual } from "../../../core";

export const springRectangle = visual<{
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}>(({ props, rect, releaseFactor, timeAttacked }) => {
  const { x, y, width, height, fill } = props;

  const opacity = easeInCubic(releaseFactor);

  rect({
    x,
    y: y + height - 100,
    width,
    height: 0,
    fillStyle: fill,
    opacity,
  }).animateTo(
    { height: height, y: y },
    { at: timeAttacked, duration: 1000, easing: "easeOutBack" },
  );
});
