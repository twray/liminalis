import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";

createVisualisation
  .withData({
    mappableBaseNotes: ["C", "D", "E", "F", "G", "A", "B"],
    index: 5,
    colors: ["red", "orange", "yellow", "green", "blue"],
  })
  .render(({ setBackgroundColor, onNoteDown, onNoteUp }) => {
    setBackgroundColor("beige");

    onNoteDown(({ note, attack, visualisation, data }) => {
      const positionIndex = data.mappableBaseNotes.indexOf(note[0]) ?? 0;

      visualisation.add(
        note[0],
        bouncyCuboid()
          .withProps({ positionIndex })
          .attack(attack)
          .sustain(10000)
      );

      setBackgroundColor("red");

      data.index += 1;
    });

    onNoteUp(({ note, visualisation }) => {
      visualisation.get(note[0])?.decay(2000);

      setBackgroundColor("orange");
    });
  });
