import { easeInCubic, easeOutBack } from "easing-utils";
import { midiVisual } from "../../../core";

export const springRectangle = () => {
  return midiVisual<{
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
  }>().withRenderer(({ props, draw, releaseFactor, timeAttacked }) => {
    const { x, y, width, height, fill } = props;

    const opacity = easeInCubic(releaseFactor);

    draw(({ rect }) => {
      rect({
        x,
        y: y + height - 100,
        width,
        height: 0,
        fillStyle: fill,
        opacity,
      }).animateTo(
        { height: height, y: y },
        { at: timeAttacked, duration: 1000, easing: easeOutBack }
      );
    });
  });
};
