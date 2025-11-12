import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";
import { toNormalizedFloat } from "./types";

createVisualisation(({ onNoteUp, onNoteDown }) => {
  const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

  onNoteDown(({ note, attack, visualisation }) => {
    const positionIndex = mappableBaseNotes.indexOf(note[0]);

    visualisation.add(
      note[0],
      bouncyCuboid()
        .withProps({ positionIndex })
        .attack(toNormalizedFloat(attack ?? 1))
        .sustain(10000)
    );
  });

  onNoteUp(({ note, visualisation }) => {
    visualisation.get(note[0])?.decay(2000);
  });
});
