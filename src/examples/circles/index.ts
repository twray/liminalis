import { createScene } from "../../core";
import { springCircle } from "./animatable/springCircle";

createScene
  .withState({
    index: 0,
  })
  .setup(({ onNoteDown, onNoteUp, onRender: onEachFrame, state }) => {
    const numCircles = 7;

    onEachFrame(({ background }) => {
      background({ color: "beige" });
    });

    onNoteDown(({ scene, note, attack }) => {
      const { index } = state;

      state.index = state.index < numCircles ? (state.index += 1) : 0;
      const circleDistance = 50;
      const startXOffset = -((numCircles * circleDistance) / 2);

      scene.addWithKey(
        note,
        springCircle({ xOffset: startXOffset + index * 50 }).attack(attack),
      );
    });

    onNoteUp(({ scene, note }) => {
      scene.getByKey(note)?.release();
    });
  })
  .render();
