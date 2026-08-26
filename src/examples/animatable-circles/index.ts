import { createScene, visual } from "../../core";
import { toNormalizedFloat } from "../../util";

createScene
  .setup(({ atStart, onNoteDown, onNoteUp, onRender }) => {
    const noteVisual = visual(
      ({ center, circle, withStyles, timeAttacked, timeReleased }) => {
        const { x: cx, y: cy } = center;

        // Circle animates in response to attack and release events
        withStyles({ strokeStyle: "#666666" }, () => {
          circle({
            cx,
            cy,
            radius: 50,
          })
            .animateTo(
              { radius: 100 },
              { at: timeAttacked, duration: 1000, easing: "easeOutBounce" },
            )
            .animateTo(
              { radius: 50 },
              { at: timeReleased, duration: 1000, easing: "easeOutCubic" },
            );
        });
      },
    );

    const persistentNoteVisual = noteVisual();

    atStart(({ scene }) => {
      scene.addPermanently(persistentNoteVisual);
    });

    onRender(
      ({ center, circle, ellipse, arc, polygon, bezier, text, withStyles }) => {
        const { x: cx, y: cy } = center;

        const startYPos = cy - 200;
        const endYPos = cy - 100;

        // Static circles with staggered animations and extra primitives
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

          ellipse({
            cx,
            cy: cy + 120,
            radiusX: 150,
            radiusY: 45,
            strokeWidth: 3,
            opacity: 0.75,
            blend: "multiply",
          });

          arc({
            cx,
            cy: cy + 120,
            radius: 90,
            start: 200,
            end: 340,
            strokeWidth: 8,
            blend: "screen",
          });

          polygon({
            points: [
              { x: cx - 70, y: cy + 80 },
              { x: cx, y: cy + 40 },
              { x: cx + 70, y: cy + 80 },
              { x: cx, y: cy + 110 },
            ],
            closePath: true,
            strokeWidth: 3,
            strokeAlignment: "inside",
            blend: "overlay",
          });

          bezier({
            segments: [
              { point: { x: cx - 120, y: cy + 145 } },
              {
                control: { x: cx - 40, y: cy + 95 },
                point: { x: cx, y: cy + 145 },
              },
              {
                control: [
                  { x: cx + 40, y: cy + 195 },
                  { x: cx + 95, y: cy + 95 },
                ],
                point: { x: cx + 130, y: cy + 145 },
              },
            ],
            fillStyle: "transparent",
            strokeWidth: 3,
            opacity: 0.6,
            blend: "difference",
          });

          text("Use keys 1-9 or MIDI input", {
            x: cx - 130,
            y: cy + 175,
            fontStyle: "16px serif",
            blend: "source-over",
          });
        });
      },
    );

    onNoteDown(({ scene }) => {
      if (scene.has(persistentNoteVisual)) {
        persistentNoteVisual.attack(toNormalizedFloat(1));
      }
    });

    onNoteUp(({ scene }) => {
      if (scene.has(persistentNoteVisual)) {
        persistentNoteVisual.release();
      }
    });
  })
  .render();
