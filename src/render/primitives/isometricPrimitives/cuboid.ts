import type { IsometricCuboid } from "../../../types";
import IsometricView from "../../IsometricView";

export const cuboid = (
  isometricView: IsometricView,
  props: IsometricCuboid,
) => {
  isometricView.addCuboidAt(props);
};
