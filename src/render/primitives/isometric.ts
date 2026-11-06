import type {
  IsometricCuboid,
  IsometricTile,
  PartialDrawStyles,
  PartialIsometricStyles,
} from "../../types";
import ActiveMeasurementsManager from "../ActiveMeasurementsManager";
import type AnimatableRegistry from "../AnimatableRegistry";
import AppliedStylesManager from "../AppliedStylesManager";
import DrawGroupManager from "../DrawGroupManager";
import IsometricView from "../IsometricView";
import RenderWarningManager from "../RenderWarningManager";
import { toIsometricStyles } from "../common";
import { cuboid, tile } from "./isometricPrimitives/";

import type {
  DrawPrimitives,
  DrawUtilities,
  IsometricAPI,
  IsometricOptions,
  RenderCollaborators,
} from "../types";

interface CreateIsometricPrimitiveParams extends RenderCollaborators {
  timeInMs: number;
  drawUtilities: DrawUtilities;
  appliedStylesManager: AppliedStylesManager;
  renderWarningManager: RenderWarningManager;
  activeMeasurementsManager: ActiveMeasurementsManager;
  isMeasuringFrameBounds: () => boolean;
  isOverlayPrimitiveSuppressed: () => boolean;
}

// One resolved isometric primitive, ready to be laid onto the view. Produced
// at flush time (with animated props baked in) and replayed at paint time,
// once the IsometricView exists.
type IsometricDrawCommand = (isometricView: IsometricView) => void;

const createIsometricAPI = (
  registry: AnimatableRegistry,
  drawCommands: IsometricDrawCommand[],
  // The isometric family's defaults with any withStyles() applied over them,
  // resolved per primitive -- see AppliedStylesManager.
  resolveStyles: () => PartialIsometricStyles,
): IsometricAPI => {
  const mergeStyles = <T extends PartialIsometricStyles>(props: T): T => ({
    ...resolveStyles(),
    ...props,
  });

  // The isometric counterpart of queueAnimatable: registers the primitive's
  // declared props with the registry, and at flush time turns the animated
  // props into a draw command for the view. The concrete Animatable it
  // returns is narrowed to each primitive's animatable keys by the
  // IsometricPrimitives signatures.
  const queueIsometricPrimitive = <TProps extends PartialIsometricStyles>(
    primitiveType: string,
    props: TProps,
    draw: (isometricView: IsometricView, props: TProps) => void,
  ) =>
    registry.queue(
      mergeStyles(props),
      (animatedProps) => {
        drawCommands.push((isometricView) =>
          draw(isometricView, animatedProps),
        );
      },
      { primitiveType },
    );

  return {
    render: {
      tile: (props: IsometricTile) =>
        queueIsometricPrimitive("isometric:tile", props, tile),
      cuboid: (props: IsometricCuboid) =>
        queueIsometricPrimitive("isometric:cuboid", props, cuboid),
    },
  };
};

export const createIsometricPrimitive = ({
  timeInMs,
  registry,
  drawGroupManager,
  drawUtilities: drawProperties,
  appliedStylesManager,
  renderWarningManager,
  activeMeasurementsManager,
  isMeasuringFrameBounds,
  isOverlayPrimitiveSuppressed,
}: CreateIsometricPrimitiveParams): DrawPrimitives["isometric"] => {
  return (
    callback: (isometricAPI: IsometricAPI) => void,
    options: IsometricOptions = {},
  ) => {
    // An ancestor container's measurement pass re-invokes this same call for
    // real afterwards, so registering or reserving anything here would
    // duplicate the view (and give every tile two identities). An isometric
    // view contributes no bounds, so there is nothing to report either.
    if (isMeasuringFrameBounds() || isOverlayPrimitiveSuppressed()) {
      return;
    }

    // Defaults to the nearest enclosing container's measurements (the
    // group()/layer()/place() this isometric() is nested inside, if any),
    // falling back to the outer canvas's own measurements at the top level —
    // matching how every other implicitly-sized primitive derives its size
    // from its immediate context rather than the whole canvas.
    const ambientMeasurements =
      activeMeasurementsManager.getActiveMeasurements() ??
      drawProperties.sceneMeasurements;

    const viewportProps = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? ambientMeasurements.width,
      height: options.height ?? ambientMeasurements.height,
      ...(options.tileWidth !== undefined
        ? { tileWidth: options.tileWidth }
        : {}),
    };

    const targetGroupHandle = drawGroupManager.captureCurrentGroupHandle();
    const drawCommands: IsometricDrawCommand[] = [];

    // One identity scope for the view and everything declared inside it, so
    // a callback that declares a varying number of tiles cannot shift the
    // positional identity of the siblings that follow this isometric().
    registry.withScope(undefined, () => {
      // Queued BEFORE the callback runs, so flush resolves the view first and
      // its tiles after; the operation's render closure reads drawCommands
      // only at paint time, by which point every tile has pushed its command.
      registry.queue(
        // frameTime keeps the signature unique per frame, so the bitmap cache
        // never serves a stale view. The tiles' props resolve after this
        // signature is built, so they cannot take part in it.
        { ...viewportProps, frameTime: timeInMs },
        (queuedViewportProps) => {
          targetGroupHandle.pushPrimitiveOperation({
            // An isometric view composites its own contents; the viewport
            // itself is always source-over onto whatever sits beneath it.
            blendsWithBackdrop: false,
            signature: DrawGroupManager.createPrimitiveSignature(
              "isometric",
              queuedViewportProps,
            ),
            render: (targetContext) => {
              targetContext.save();

              try {
                targetContext.beginPath();
                targetContext.rect(
                  queuedViewportProps.x,
                  queuedViewportProps.y,
                  queuedViewportProps.width,
                  queuedViewportProps.height,
                );
                targetContext.clip();
                targetContext.translate(
                  queuedViewportProps.x,
                  queuedViewportProps.y,
                );

                const isometricView = new IsometricView(
                  targetContext,
                  queuedViewportProps.width,
                  queuedViewportProps.height,
                  queuedViewportProps.tileWidth,
                );

                drawCommands.forEach((drawCommand) =>
                  drawCommand(isometricView),
                );

                isometricView.render();
              } finally {
                targetContext.restore();
              }
            },
          });
        },
        { primitiveType: "isometric" },
      );

      // Runs at declare time, like every other primitive's callback, so the
      // tiles it declares are registered before flush. Inherited styles are
      // read per primitive, so a withStyles() wrapped around (or inside) the
      // callback applies exactly as it does to 2D primitives.
      renderWarningManager.withIsometricRenderCallback(() => {
        callback(
          createIsometricAPI(registry, drawCommands, () =>
            toIsometricStyles(
              appliedStylesManager.mergeStyles(
                {} as PartialDrawStyles,
                "isometric",
              ),
            ),
          ),
        );
      });
    });
  };
};
