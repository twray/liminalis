import { createVisualisation } from "../../core";
import { springRectangle } from "./animatable/springRectangle";

createVisualisation
  .withSettings({
    width: 1080,
    height: 1920,
  })
  .setup(({ onNoteDown, onNoteUp, visualisation, width, height }) => {
    const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];
    const numBars = mappableBaseNotes.length;
    const squareSize = width * 0.8;
    const barWidth = squareSize / (numBars * 2 - 1);

    mappableBaseNotes.forEach((mappableBaseNote, index) => {
      visualisation
        .add(
          mappableBaseNote,
          springRectangle().withProps({
            x: (width - squareSize) / 2 + index * barWidth * 2,
            y: (height - squareSize) / 2,
            width: barWidth,
            height: squareSize,
            fill: "#333333",
          })
        )
        .setIsPermanent(true);
    });

    onNoteDown(({ note, attack }) => {
      visualisation.get(note[0])?.attack(attack);
    });

    onNoteUp(({ note }) => {
      visualisation.get(note[0])?.release(2000);
    });
  })
  .render();
