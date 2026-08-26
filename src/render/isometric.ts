import { getRenderIsometricMethods } from "../core/renderIsometricMethods";
import type { PartialDrawStyles } from "../types";
import IsometricView from "../views/IsometricView";
import AnimatableRegistry from "./AnimatableRegistry";
import AppliedStylesManager from "./AppliedStylesManager";
import ClipManager from "./ClipManager";
import DrawGroupManager from "./DrawGroupManager";
import OverlayPrimitiveWarningManager from "./OverlayPrimitiveWarningManager";
import { toIsometricStyles } from "./common";
import { PRIMITIVE_NAME } from "./primitiveNames";

import type {
  DrawPrimitives,
  IsometricOptions,
  RenderContextController,
} from "./types";

interface CreateIsometricPrimitiveParams {
  width: number;
  height: number;
  timeInMs: number;
  registry: AnimatableRegistry;
  clipManager: ClipManager;
  drawGroupManager: DrawGroupManager;
  appliedStylesManager: AppliedStylesManager;
  overlayPrimitiveWarningManager: OverlayPrimitiveWarningManager;
  getClipScopesSignature: (
    scopes: ReturnType<ClipManager["captureScopes"]>,
  ) => string;
}

export const createIsometricPrimitive = ({
  width,
  height,
  timeInMs,
  registry,
  clipManager,
  drawGroupManager,
  appliedStylesManager,
  overlayPrimitiveWarningManager,
  getClipScopesSignature,
}: CreateIsometricPrimitiveParams): DrawPrimitives["isometric"] => {
  return (
    callback: (methods: ReturnType<typeof getRenderIsometricMethods>) => void,
    options: IsometricOptions = {},
  ) => {
    const viewportProps = {
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? width,
      height: options.height ?? height,
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
            PRIMITIVE_NAME.ISOMETRIC,
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

                      overlayPrimitiveWarningManager.withIsometricRenderCallback(
                        () => {
                          callback(
                            getRenderIsometricMethods(
                              isometricView,
                              timeInMs,
                              () =>
                                toIsometricStyles(
                                  appliedStylesManager.mergeStyles(
                                    {} as PartialDrawStyles,
                                  ),
                                ),
                            ),
                          );
                        },
                      );

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
