import { animatable, createVisualisation } from "../../core";
import { toNormalizedFloat } from "../../util";

createVisualisation
  .setup(({ atStart, onNoteDown, onNoteUp, onRender }) => {
    atStart(({ visualisation }) => {
      visualisation.addPermanently(
        "note",
        animatable().withRenderer(
          ({
            center,
            circle,
            withStyles,
            animate,
            timeAttacked,
            timeReleased,
          }) => {
            const { x: cx, y: cy } = center;

            // Circle is animatable in response to attack and release
            // events, startTimes are provided dynamically

            withStyles({ strokeStyle: "#666666" }, () => {
              circle({
                cx,
                cy,
                radius: animate([
                  {
                    startTime: timeAttacked,
                    from: 50,
                    to: 100,
                    duration: 1000,
                  },
                  {
                    startTime: timeReleased,
                    from: 100,
                    to: 50,
                    duration: 1000,
                  },
                ]),
              });
            });
          }
        )
      );
    });

    onRender(({ center, circle, withStyles, animate }) => {
      const { x: cx, y: cy } = center;

      const startYPos = cy - 200;
      const endYPos = cy - 100;

      // Circles can also be animatable during onRender events

      withStyles({ strokeStyle: "#666666" }, () => {
        for (let i = 0; i < 3; i++) {
          circle({
            cx: cx + i * 40 - 40,
            cy: animate({
              from: startYPos,
              to: endYPos,
              duration: 1000,
              delay: 500 + i * 250,
            }),
            radius: 10,
          });
        }
      });
    });

    onNoteDown(({ visualisation }) => {
      visualisation.get("note")?.attack(toNormalizedFloat(1));
    });

    onNoteUp(({ visualisation }) => {
      visualisation.get("note")?.release();
    });
  })
  .render();
