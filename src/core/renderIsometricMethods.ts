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
  withStyles: (styles: PartialIsometricStyles, callback: () => void) => void;
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
  _timeInMs: number
) => {
  let appliedStyles: PartialIsometricStyles = {
    fillStyle: DEFAULT_FILL_STYLE,
    strokeStyle: DEFAULT_STROKE_STYLE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  };

  const mergeStyles = <T extends PartialIsometricStyles>(
    props: T
  ): T & PartialIsometricStyles =>
    ({
      ...appliedStyles,
      ...props,
    } as T & PartialIsometricStyles);

  const withStyles = (
    styles: PartialIsometricStyles,
    callback: () => void
  ): void => {
    const previousStyles = appliedStyles;
    appliedStyles = { ...appliedStyles, ...styles };

    try {
      return callback();
    } finally {
      appliedStyles = previousStyles;
    }
  };

  return {
    withStyles,
    tile: (props: IsometricTile) => tile(isometricView, mergeStyles(props)),
    cuboid: (props: IsometricCuboid) =>
      cuboid(isometricView, mergeStyles(props)),
  };
};
