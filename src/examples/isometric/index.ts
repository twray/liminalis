import { createVisualisation } from "../../core";
import { bouncyCuboid } from "./animatable/bouncyCuboid";

createVisualisation
  .setup(({ onNoteDown, onNoteUp, visualisation }) => {
    const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

    onNoteDown(({ note, attack }) => {
      const positionIndex = mappableBaseNotes.indexOf(note[0]) ?? 0;

      visualisation.add(
        note[0],
        bouncyCuboid()
          .withProps({ positionIndex })
          .attack(attack)
          .sustain(10000)
      );
    });

    onNoteUp(({ note }) => {
      visualisation.get(note[0])?.release(2000);
    });
  })
  .render();
