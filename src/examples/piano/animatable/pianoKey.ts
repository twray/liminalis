import { easeOutBack } from "easing-utils";
import { midiVisual } from "../../../core";

export const pianoKey = () => {
  return midiVisual<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    keyType?: "white" | "black";
  }>().withRenderer(({ props, draw, timeAttacked, timeReleased }) => {
    draw(({ rect, withStyles }) => {
      const { x, y, width = 60, height = 200, keyType = "white" } = props;

      const noteColor = "#666";

      const keyCornerRadii = {
        topLeft: 0,
        topRight: 0,
        bottomLeft: 12,
        bottomRight: 12,
      };

      const keyAnimationDuration = 500;

      withStyles({ strokeStyle: noteColor, strokeWidth: 3 }, () => {
        rect({
          x: keyType === "black" ? x + width * 0.125 : x,
          y,
          width: keyType === "black" ? width * 0.75 : width,
          height: keyType === "black" ? height * 0.66 : height,
          fillStyle: keyType === "black" ? noteColor : "transparent",
          strokeWidth: 4,
          cornerRadius: keyCornerRadii,
        })
          .animateTo(
            { height: (keyType === "black" ? height * 0.66 : height) + 20 },
            {
              at: timeAttacked,
              duration: keyAnimationDuration,
              easing: easeOutBack,
            }
          )
          .animateTo(
            { height: keyType === "black" ? height * 0.66 : height },
            {
              at: timeReleased,
              duration: keyAnimationDuration,
              delay: 100,
              easing: easeOutBack,
            }
          );
      });
    });
  });
};
