import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";

createVisualisation(({ onNoteDown, onNoteUp }) => {
  const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

  onNoteDown(({ note, attack, visualisation }) => {
    const positionIndex = mappableBaseNotes.indexOf(note[0]);

    visualisation.add(
      note[0],
      bouncyCuboid().withProps({ positionIndex }).attack(attack).sustain(10000)
    );
  });

  onNoteUp(({ note, visualisation }) => {
    visualisation.get(note[0])?.decay(2000);
  });
});
