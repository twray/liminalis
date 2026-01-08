import { easeOutBack } from "easing-utils";
import { midiVisual } from "../../../core";

export const pianoKey = () => {
  return midiVisual<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    keyType?: "white" | "black";
  }>().withRenderer(
    ({
      props,
      rect,
      withStyles,
      animate,
      status,
      timeAttacked,
      timeReleased,
    }) => {
      const { x, y, width = 60, height = 200, keyType = "white" } = props;

      const noteColor = "#666";

      const keyCornerRadii = {
        topLeft: 0,
        topRight: 0,
        bottomLeft: 12,
        bottomRight: 12,
      };

      const keyAnimationDuration = 500;

      let heightExtension = 0;

      switch (status) {
        case "sustained":
          heightExtension = animate({
            startTime: timeAttacked,
            from: 0,
            to: 20,
            duration: keyAnimationDuration,
            easing: easeOutBack,
          });
          break;
        case "releasing":
          heightExtension = animate({
            startTime: timeReleased,
            from: 20,
            to: 0,
            duration: keyAnimationDuration,
            delay: 100,
            easing: easeOutBack,
          });
          break;
      }

      withStyles({ strokeStyle: noteColor, strokeWidth: 3 }, () => {
        rect({
          x: keyType === "black" ? x + width * 0.125 : x,
          y,
          width: keyType === "black" ? width * 0.75 : width,
          height:
            (keyType === "black" ? height * 0.66 : height) + heightExtension,
          fillStyle: keyType === "black" ? noteColor : "transparent",
          strokeWidth: 4,
          cornerRadius: keyCornerRadii,
        });
      });
    }
  );
};
