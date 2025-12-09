import { createVisualisation, logMessage } from "./core";

createVisualisation
  .setup(({ atStart }) => {
    atStart(() => {
      logMessage("Welcome to Liminalis");
    });
  })
  .render();
