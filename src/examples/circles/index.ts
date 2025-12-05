import { createVisualisation } from "../../core";

createVisualisation
  .withData({
    index: 0,
    colors: ["red", "orange", "yellow", "green", "blue"],
  })
  .setup(({ onNoteDown, data }) => {
    onNoteDown(() => {
      const { index, colors } = data;
      data.index = index < colors.length ? index + 1 : 0;
    });
  })
  .render(
    ({
      data,
      circle,
      center,
      background: setBackground,
      whileNotesDown,
      duringTimeInterval,
    }) => {
      const { x: cx, y: cy } = center;
      const { colors, index } = data;

      setBackground({ color: "beige" });

      for (let i = 0; i < 10; i++) {
        circle({
          cx,
          cy,
          radius: 50 + i * 5,
          fillColor: "transparent",
          strokeColor: "#999",
        });
      }

      whileNotesDown(() => {
        circle({ cx, cy, radius: 25, fillColor: colors[index] });
      });

      duringTimeInterval("0:01", "0:04", () => {
        circle({ cx, cy, radius: 20, fillColor: "orange" });
      });
    }
  );
