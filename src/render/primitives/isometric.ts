import type {
  IsometricCuboid,
  IsometricTile,
  PartialDrawStyles,
  PartialIsometricStyles,
} from "../../types";
import ActiveMeasurementsManager from "../ActiveMeasurementsManager";
import AppliedStylesManager from "../AppliedStylesManager";
import DrawGroupManager from "../DrawGroupManager";
import IsometricView from "../IsometricView";
import RenderWarningManager from "../RenderWarningManager";
import { toIsometricStyles } from "../common";
import { cuboid, tile } from "./isometricPrimitives/";

import type {
  DrawPrimitives,
  DrawProperties,
  IsometricOptions,
  RenderCollaborators,
} from "../types";

interface CreateIsometricPrimitiveParams extends RenderCollaborators {
  timeInMs: number;
  drawProperties: DrawProperties;
  appliedStylesManager: AppliedStylesManager;
  renderWarningManager: RenderWarningManager;
  activeMeasurementsManager: ActiveMeasurementsManager;
}

const DEFAULT_FILL_STYLE = "#333";
const DEFAULT_STROKE_STYLE = "transparent";
const DEFAULT_STROKE_WIDTH = 1;

const getIsometricMethods = (
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

export const createIsometricPrimitive = ({
  timeInMs,
  registry,
  drawGroupManager,
  drawProperties,
  appliedStylesManager,
  renderWarningManager,
  activeMeasurementsManager,
}: CreateIsometricPrimitiveParams): DrawPrimitives["isometric"] => {
  return (
    callback: (methods: ReturnType<typeof getIsometricMethods>) => void,
    options: IsometricOptions = {},
  ) => {
    // Defaults to the nearest enclosing container's measurements (the
    // group()/layer()/place() this isometric() is nested inside, if any),
    // falling back to the outer canvas's own measurements at the top level —
    // matching how every other implicitly-sized primitive derives its size
    // from its immediate context rather than the whole canvas.
    const ambientMeasurements =
      activeMeasurementsManager.getActiveMeasurements() ??
      drawProperties.measurements;

    const viewportProps = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? ambientMeasurements.width,
      height: options.height ?? ambientMeasurements.height,
      ...(options.tileWidth !== undefined
        ? { tileWidth: options.tileWidth }
        : {}),
    };

    const inheritedBaseStyles = toIsometricStyles(
      appliedStylesManager.mergeStyles({} as PartialDrawStyles),
    );

    const targetGroupHandle = drawGroupManager.captureCurrentGroupHandle();

    registry.queue(
      {
        ...viewportProps,
        ...inheritedBaseStyles,
        frameTime: timeInMs,
      },
      (queuedIsometricProps) => {
        targetGroupHandle.pushPrimitiveOperation({
          signature: DrawGroupManager.createPrimitiveSignature(
            "isometric",
            queuedIsometricProps,
          ),
          render: (targetContext) => {
            const inheritedStylesFromQueue =
              toIsometricStyles(queuedIsometricProps);

            appliedStylesManager.withStyles(inheritedStylesFromQueue, () => {
              targetContext.save();

              try {
                targetContext.beginPath();
                targetContext.rect(
                  queuedIsometricProps.x,
                  queuedIsometricProps.y,
                  queuedIsometricProps.width,
                  queuedIsometricProps.height,
                );
                targetContext.clip();
                targetContext.translate(
                  queuedIsometricProps.x,
                  queuedIsometricProps.y,
                );

                const isometricView = new IsometricView(
                  targetContext,
                  queuedIsometricProps.width,
                  queuedIsometricProps.height,
                  queuedIsometricProps.tileWidth,
                );

                renderWarningManager.withIsometricRenderCallback(() => {
                  callback(
                    getIsometricMethods(isometricView, timeInMs, () =>
                      toIsometricStyles(
                        appliedStylesManager.mergeStyles(
                          {} as PartialDrawStyles,
                        ),
                      ),
                    ),
                  );
                });

                isometricView.render();
              } finally {
                targetContext.restore();
              }
            });
          },
        });
      },
    );
  };
};
