import type {
  IsometricCuboid,
  IsometricTile,
  PartialIsometricStyles,
} from "../types";
import IsometricView from "../views/IsometricView";

const DEFAULT_FILL_STYLE = "#333";
const DEFAULT_STROKE_STYLE = "transparent";
const DEFAULT_STROKE_WIDTH = 1;

export interface RenderIsometricMethods {
  tile: (props: IsometricTile) => void;
  cuboid: (props: IsometricCuboid) => void;
}

const tile = (isometricView: IsometricView, props: IsometricTile) => {
  isometricView.addTileAt(props);
};

const cuboid = (isometricView: IsometricView, props: IsometricCuboid) => {
  isometricView.addCuboidAt(props);
};

export const getRenderIsometricMethods = (
  isometricView: IsometricView,
  _timeInMs: number,
  inheritedStyles: PartialIsometricStyles | (() => PartialIsometricStyles) = {},
) => {
  const resolveInheritedStyles = (): PartialIsometricStyles =>
    typeof inheritedStyles === "function" ? inheritedStyles() : inheritedStyles;

  const mergeStyles = <T extends PartialIsometricStyles>(
    props: T,
  ): T & PartialIsometricStyles =>
    ({
      fillStyle: DEFAULT_FILL_STYLE,
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      ...resolveInheritedStyles(),
      ...props,
    }) as T & PartialIsometricStyles;

  return {
    tile: (props: IsometricTile) => tile(isometricView, mergeStyles(props)),
    cuboid: (props: IsometricCuboid) =>
      cuboid(isometricView, mergeStyles(props)),
  };
};
