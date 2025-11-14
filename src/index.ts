import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";

createVisualisation<{ mappableBaseNotes: string[]; index: number }>(
  ({ onNoteDown, onNoteUp, setup }) => {
    setup(() => {
      return {
        mappableBaseNotes: ["C", "D", "E", "F", "G", "A", "B"],
        index: 5,
      };
    });

    onNoteDown(({ note, attack, visualisation, data }) => {
      const positionIndex = data.mappableBaseNotes.indexOf(note[0]) ?? 0;
      visualisation.add(
        note[0],
        bouncyCuboid()
          .withProps({ positionIndex })
          .attack(attack)
          .sustain(10000)
      );

      data.index += 1;
    });

    onNoteUp(({ note, visualisation }) => {
      visualisation.get(note[0])?.decay(2000);
    });
  }
);
