import { createScene } from "../../core";
import { bouncyCuboid } from "./animatable/bouncyCuboid";

createScene
  .withSettings({
    width: 1080,
    height: 1920,
  })
  .setup(({ onNoteDown, onNoteUp }) => {
    const mappableBaseNotes = ["C", "D", "E", "F", "G", "A", "B"];

    onNoteDown(({ scene, note, attack }) => {
      const positionIndex = mappableBaseNotes.indexOf(note[0]) ?? 0;

      scene.addWithKey(
        note[0],
        bouncyCuboid({ positionIndex }).attack(attack).sustain(10000),
      );
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note[0])?.release(2000);
    });
  })
  .render();
