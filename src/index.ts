import { createVisualisation } from "./core";

createVisualisation
  .withSettings({
    width: 1080,
    height: 1920,
  })
  .setup(({ atStart }) => {
    atStart(() => {
      console.log("Welcome to Liminalis");
    });
  })
  .render(({ background, circle, center }) => {
    background({ color: "beige" });

    const { x: cx, y: cy } = center;

    for (let i = 0; i < 25; i++) {
      circle({
        cx,
        cy,
        radius: 50 + 10 * i,
        strokeColor: "#333",
        opacity: 1 - i / 25,
      });
    }
  });
