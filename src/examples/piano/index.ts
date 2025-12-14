import { createVisualisation } from "../../core";
import { pianoKey } from "./animatable/pianoKey";

createVisualisation
  .withSettings({
    width: 1080,
    height: 1920,
  })
  .setup(({ atStart, onEachFrame, onNoteDown, onNoteUp, center }) => {
    // Setup computed properties of the window, which we can draw in each frame

    const windowDimensions = { width: 800, height: 500 };

    const windowOrigin = {
      x: center.x - windowDimensions.width / 2,
      y: center.y - windowDimensions.height / 2,
    };

    const titleBarHeight = 70;

    const innerWindowOrigin = {
      ...windowOrigin,
      y: windowOrigin.y + titleBarHeight,
    };

    // Setup data and computed properties of the keyboard

    const mappableNotes = [
      "C4",
      "C#4",
      "D4",
      "D#4",
      "E4",
      "F4",
      "F#4",
      "G4",
      "G#4",
      "A4",
      "A#4",
      "B4",
      "C5",
    ];

    const keyDimensions = { width: 60, height: 200 };

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

    // Render content on a per-frame basis that is not managed by
    // the visualisation

    onEachFrame(({ background, rect, line, withStyles, translate, circle }) => {
      const windowBorderRadius = 30;
      const buttonColors = ["#FF605C", "#FFBD44", "#00CA4E"];
      const buttonRadius = 15;

      background({ color: "#F7F2E7" });

      withStyles({ strokeStyle: "#666", strokeWidth: 3 }, () => {
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
              fillStyle: buttonColors[i],
              strokeStyle: buttonColors[i],
            });
          }
        });
      });
    });

    // Add interactive visualisation elements

    let xOffset = 0;

    atStart(({ visualisation }) => {
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
    });

    onNoteDown(({ visualisation, note, attack }) => {
      visualisation.get(note)?.attack(attack);
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release(1000);
    });
  })
  .render();
