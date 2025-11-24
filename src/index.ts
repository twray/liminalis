import { bouncyCuboid } from "./animatable/bouncyCuboid";
import { createVisualisation } from "./core";

createVisualisation
  .withData({
    mappableBaseNotes: ["C", "D", "E", "F", "G", "A", "B"],
    index: 5,
    colors: ["red", "orange", "yellow", "green", "blue"],
  })
  .setup(({ onNoteDown, onNoteUp, visualisation, data }) => {
    onNoteDown(({ note, attack }) => {
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

    onNoteUp(({ note }) => {
      visualisation.get(note[0])?.decay(2000);
    });
  })
  .render(
    ({
      drawCircle,
      center,
      setBackground,
      whileNotesDown,
      duringTimeInterval,
    }) => {
      const { x: cx, y: cy } = center;

      setBackground({ backgroundColor: "beige" });

      for (let i = 0; i < 10; i++) {
        drawCircle({
          cx,
          cy,
          radius: 50 + i * 5,
          fillColor: "transparent",
          strokeColor: "#999",
        });
      }

      whileNotesDown(() => {
        drawCircle({ cx, cy, radius: 25, fillColor: "pink" });
      });

      duringTimeInterval("0:01", "0:04", () => {
        drawCircle({ cx, cy, radius: 20, fillColor: "orange" });
      });
    }
  );
