import { createScene, logMessage } from "./core";

createScene
  .setup(({ atStart }) => {
    atStart(() => {
      logMessage("Welcome to Liminalis");
    });
  })
  .render();
