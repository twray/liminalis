import { createScene, visual } from "../../core";
import { toNormalizedFloat } from "../../util";

createScene
  .setup(({ atStart, onNoteDown, onNoteUp, onRender }) => {
    const noteVisual = visual(({ draw, timeAttacked, timeReleased }) => {
      draw(({ center, circle, withStyles }) => {
        const { x: cx, y: cy } = center;

        // Circle animates in response to attack and release events
        withStyles({ strokeStyle: "#666666" }, () => {
          circle({
            cx,
            cy,
            radius: 50,
          })
            .animateTo({ radius: 100 }, { at: timeAttacked, duration: 1000 })
            .animateTo({ radius: 50 }, { at: timeReleased, duration: 1000 });
        });
      });
    });

    atStart(({ scene }) => {
      scene.addPermanentlyWithKey("note", noteVisual());
    });

    onRender(({ draw, center }) => {
      const { x: cx, y: cy } = center;

      const startYPos = cy - 200;
      const endYPos = cy - 100;

      // Static circles with staggered animations
      draw(({ circle, withStyles }) => {
        withStyles({ strokeStyle: "#666666" }, () => {
          for (let i = 0; i < 3; i++) {
            circle({
              cx: cx + i * 40 - 40,
              cy: startYPos,
              radius: 10,
            }).animateTo(
              { cy: endYPos },
              { duration: 1000, delay: 500 + i * 250 },
            );
          }
        });
      });
    });

    onNoteDown(({ scene }) => {
      scene.getByKey("note")?.attack(toNormalizedFloat(1));
    });

    onNoteUp(({ scene }) => {
      scene.getByKey("note")?.release();
    });
  })
  .render();
