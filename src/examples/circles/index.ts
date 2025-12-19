import { createVisualisation } from "../../core";
import { springCircle } from "./animatable/springCircle";

createVisualisation
  .withState({
    index: 0,
  })
  .setup(({ onNoteDown, onNoteUp, onRender: onEachFrame, state }) => {
    const numCircles = 7;

    onEachFrame(({ background }) => {
      background({ color: "beige" });
    });

    onNoteDown(({ visualisation, note, attack }) => {
      const { index } = state;

      state.index = state.index < numCircles ? (state.index += 1) : 0;
      const circleDistance = 50;
      const startXOffset = -((numCircles * circleDistance) / 2);

      visualisation.add(
        note,
        springCircle()
          .withProps({ xOffset: startXOffset + index * 50 })
          .attack(attack)
      );
    });

    onNoteUp(({ visualisation, note }) => {
      visualisation.get(note)?.release();
    });
  })
  .render();
