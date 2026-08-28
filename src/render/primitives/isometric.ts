import type {
  IsometricCuboid,
  IsometricTile,
  PartialDrawStyles,
  PartialIsometricStyles,
} from "../../types";
import ActiveMeasurementsManager from "../ActiveMeasurementsManager";
import AppliedStylesManager from "../AppliedStylesManager";
import ClipManager from "../ClipManager";
import DrawGroupManager from "../DrawGroupManager";
import IsometricView from "../IsometricView";
import RenderWarningManager from "../RenderWarningManager";
import { getClipScopesSignature, toIsometricStyles } from "../common";
import { cuboid, tile } from "./isometricPrimitives/";

import type {
  DrawPrimitives,
  DrawProperties,
  IsometricOptions,
  RenderCollaborators,
  RenderContextController,
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
  clipManager,
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

    const clipScopes = clipManager.captureScopes();
    const scopeSignature = getClipScopesSignature(clipScopes);

    registry.queue(
      {
        ...viewportProps,
        ...inheritedBaseStyles,
        frameTime: timeInMs,
      },
      (queuedIsometricProps) => {
        drawGroupManager.pushPrimitiveOperation({
          signature: DrawGroupManager.createPrimitiveSignature(
            "isometric",
            queuedIsometricProps,
            clipScopes.length,
            `scope-signature:${scopeSignature}`,
          ),
          render: (targetContext) => {
            const targetClipManager = new ClipManager(targetContext);
            let activeTargetContext = targetContext;

            const targetContextController: RenderContextController = {
              getContext: () => activeTargetContext,
              setContext: (nextContext: CanvasRenderingContext2D): void => {
                activeTargetContext = nextContext;
              },
            };

            const inheritedStylesFromQueue =
              toIsometricStyles(queuedIsometricProps);

            targetClipManager.renderWithScopes(
              clipScopes,
              () => {
                appliedStylesManager.withStyles(
                  inheritedStylesFromQueue,
                  () => {
                    const currentContext = targetContextController.getContext();

                    currentContext.save();

                    try {
                      currentContext.beginPath();
                      currentContext.rect(
                        queuedIsometricProps.x,
                        queuedIsometricProps.y,
                        queuedIsometricProps.width,
                        queuedIsometricProps.height,
                      );
                      currentContext.clip();
                      currentContext.translate(
                        queuedIsometricProps.x,
                        queuedIsometricProps.y,
                      );

                      const isometricView = new IsometricView(
                        currentContext,
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
                      currentContext.restore();
                    }
                  },
                );
              },
              targetContextController,
            );
          },
        });
      },
    );
  };
};
