import { createVisualisation } from "../../core";
import { springCircle } from "./animatable/springCircle";

createVisualisation
  .withData({
    index: 0,
  })
  .setup(({ onNoteDown, onNoteUp, data, visualisation }) => {
    const numCircles = 7;

    onNoteDown(({ note, attack }) => {
      const { index } = data;

      data.index = data.index < numCircles ? (data.index += 1) : 0;
      const circleDistance = 50;
      const startXOffset = -((numCircles * circleDistance) / 2);

      visualisation.add(
        note,
        springCircle()
          .withProps({ xOffset: startXOffset + index * 50 })
          .attack(attack)
      );
    });

    onNoteUp(({ note }) => {
      visualisation.get(note)?.release();
    });
  })
  .render(({ background }) => {
    background({ color: "beige" });
  });
