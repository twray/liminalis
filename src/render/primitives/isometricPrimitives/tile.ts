import type { IsometricTile } from "../../../types";
import IsometricView from "../../IsometricView";

export const tile = (isometricView: IsometricView, props: IsometricTile) => {
  isometricView.addTileAt(props);
};
