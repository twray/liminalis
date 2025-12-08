import { pianoKey } from "./animatable/pianoKey";
import { createVisualisation } from "./core";

const canvasDimensions = {
  width: 1080,
  height: 1920,
};

const windowDimensions = { width: 800, height: 500 };

const titleBarHeight = 70;

createVisualisation
  .withSettings({
    width: canvasDimensions.width,
    height: canvasDimensions.height,
  })
  .withData({
    windowDimensions,
    windowOrigin: {
      x: (canvasDimensions.width - windowDimensions.width) / 2,
      y: (canvasDimensions.height - windowDimensions.height) / 2,
    },
    innerWindowOrigin: {
      x: (canvasDimensions.width - windowDimensions.width) / 2,
      y:
        (canvasDimensions.height - windowDimensions.height) / 2 +
        titleBarHeight,
    },
    titleBarHeight,
  })
  .setup(({ onNoteDown, onNoteUp, visualisation, data }) => {
    const { innerWindowOrigin, windowDimensions } = data;
    const keyDimensions = { width: 60, height: 200 };

    const mappableNotes = [
      "C4",
      "C#4",
      "D4",
      "D#4",
      "E4",
      "F4",
      "F#4",
      "G",
      "G#4",
      "A4",
      "A#4",
      "B4",
      "C5",
    ];

    const keyboardDimensions = {
      width: keyDimensions.width * 8,
      height: keyDimensions.height,
    };

    const keyboardOrigin = {
      x:
        innerWindowOrigin.x +
        (windowDimensions.width - keyboardDimensions.width) / 2,
      y:
        innerWindowOrigin.y +
        (windowDimensions.height - titleBarHeight - keyboardDimensions.height) /
          2,
    };

    let xOffset = 0;

    for (let i = 0; i < mappableNotes.length; i++) {
      const keyType = mappableNotes[i].includes("#") ? "black" : "white";

      visualisation.addPermanently(
        mappableNotes[i],
        pianoKey().withProps({
          x: keyboardOrigin.x + xOffset * keyDimensions.width,
          y: keyboardOrigin.y,
          width: keyDimensions.width,
          height: keyDimensions.height,
          keyType,
        })
      );

      if (i < mappableNotes.length - 1) {
        xOffset +=
          mappableNotes[i].includes("#") || mappableNotes[i + 1].includes("#")
            ? 0.5
            : 1;
      }
    }

    onNoteDown(({ note, attack }) => {
      visualisation.get(note)?.attack(attack);
    });

    onNoteUp(({ note }) => {
      visualisation.get(note)?.release(500);
    });
  })
  .render(({ background, rect, line, withStyles, translate, circle, data }) => {
    const { windowDimensions, windowOrigin, titleBarHeight } = data;

    const windowBorderRadius = 30;

    const buttonColors = ["#FF605C", "#FFBD44", "#00CA4E"];
    const buttonRadius = 15;

    background({ color: "#F7F2E7" });

    withStyles({ strokeColor: "#666", strokeWidth: 3 }, () => {
      translate({ x: windowOrigin.x, y: windowOrigin.y }, () => {
        rect({
          width: windowDimensions.width,
          height: windowDimensions.height,
          cornerRadius: windowBorderRadius,
        });

        line({
          start: { y: titleBarHeight },
          end: {
            x: windowDimensions.width,
            y: titleBarHeight,
          },
        });

        for (let i = 0; i < buttonColors.length; i++) {
          const cx = titleBarHeight / 2;
          const cy = titleBarHeight / 2;

          circle({
            cx: cx + i * (buttonRadius * 3),
            cy,
            radius: 15,
            fillColor: buttonColors[i],
            strokeColor: buttonColors[i],
          });
        }
      });
    });
  });

// Consider adding APIs
// - Make a way for eadh key to be persisently renderable rather than just visible.
// - onEachFrame: use that to 'replace' the render method, expose the drawing, APIs
// - this is so that local variables can be contained wihin the same scope without
// - the need to use the 'data' or 'state' property excessively to share information
