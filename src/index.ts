import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";

createVisualisation<{
  mappableBaseNotes: string[];
  index: number;
  colors: string[];
}>(({ onNoteDown, onNoteUp, setup, context, width, height }) => {
  setup(() => {
    return {
      mappableBaseNotes: ["C", "D", "E", "F", "G", "A", "B"],
      index: 5,
      colors: ["red", "orange", "yellow", "green", "bluee"],
    };
  });

  context.fillStyle = "beige";
  context.fillRect(0, 0, width, height);

  onNoteDown(({ note, attack, visualisation, data }) => {
    const positionIndex = data.mappableBaseNotes.indexOf(note[0]) ?? 0;
    visualisation.add(
      note[0],
      bouncyCuboid().withProps({ positionIndex }).attack(attack).sustain(10000)
    );

    context.fillStyle = "red";
    context.fillRect(0, 0, width, height);

    data.index += 1;
  });

  onNoteUp(({ note, visualisation }) => {
    visualisation.get(note[0])?.decay(2000);

    context.fillStyle = "yellow";
    context.fillRect(0, 0, width, height);
  });
});
