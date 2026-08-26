import AnimatableRegistry from "../core/AnimatableRegistry";
import { imageAssetCache } from "../core/ImageAssetCache";
import AppliedStylesManager from "./AppliedStylesManager";
import ClipManager from "./ClipManager";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import DrawGroupManager from "./DrawGroupManager";
import { createClipScope, createGroupScope } from "./clipping";

import type Animatable from "../core/Animatable";
import type { PartialDrawStyles } from "../types";
import type { ClipScope, RenderContextController } from "./types";

import {
  centerOf,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
} from "./common";
import {
  arc,
  arcPathDescriptor,
  background,
  bezier,
  bezierPathDescriptor,
  circle,
  circlePathDescriptor,
  createTextMaskScope,
  ellipse,
  ellipsePathDescriptor,
  getTextBounds,
  image,
  line,
  polygon,
  polygonPathDescriptor,
  rect,
  rectPathDescriptor,
  resolveTextProps,
  text,
} from "./primitives";
import { groupPathDescriptor } from "./primitives/group";
import type {
  ArcProps,
  BackgroundProps,
  BezierProps,
  Bounds,
  CircleProps,
  CoordinateContextProps,
  DrawContext,
  DrawMethods,
  DrawPrimitives,
  DynamicMeasurementContext,
  EllipseProps,
  FrameCallback,
  FrameContext,
  GroupOptions,
  ImageProps,
  LayerOptions,
  LineProps,
  MeasurementContext,
  Measurements,
  PolygonProps,
  RectProps,
  StaticFrameCallback,
  StaticMeasurementContext,
  TextProps,
  TransformProps,
} from "./types";

interface BoundsCollector {
  includeBounds: (bounds: Bounds | null) => void;
  getBounds: () => Bounds | null;
}

const createBoundsCollector = (): BoundsCollector => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  return {
    includeBounds: (bounds: Bounds | null): void => {
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    },
    getBounds: (): Bounds | null => {
      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
      ) {
        return null;
      }

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    },
  };
};

const getLineBounds = (props: LineProps): Bounds => {
  const minX = Math.min(props.start.x, props.end.x);
  const minY = Math.min(props.start.y, props.end.y);
  const maxX = Math.max(props.start.x, props.end.x);
  const maxY = Math.max(props.start.y, props.end.y);

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

const getImageBounds = (imageSrc: string, props: ImageProps): Bounds | null => {
  const { x = 0, y = 0, width, height } = props;

  if (typeof width === "number" && typeof height === "number") {
    return {
      x,
      y,
      width,
      height,
    };
  }

  const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

  if (!readyImageAsset) {
    return null;
  }

  return {
    x,
    y,
    width: readyImageAsset.width,
    height: readyImageAsset.height,
  };
};

export const createDrawContext = (): DrawContext => {
  const registry = new AnimatableRegistry();
  const drawGroupBitmapCache = new DrawGroupBitmapCache();

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): void => {
    registry.beginFrame(timeInMs);

    const devicePixelRatio =
      typeof window !== "undefined" &&
      typeof window.devicePixelRatio === "number" &&
      Number.isFinite(window.devicePixelRatio)
        ? window.devicePixelRatio
        : 1;
    drawGroupBitmapCache.beginFrame({ width, height, devicePixelRatio });

    const clipManager = new ClipManager(context);
    const drawGroupManager = new DrawGroupManager();
    const appliedStylesManager = new AppliedStylesManager({
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      blend: DEFAULT_BLEND_MODE,
    });
    const boundsCollectorStack: BoundsCollector[] = [];
    let suppressedPrimitiveBoundsDepth = 0;
    let frameBoundsMeasurementDepth = 0;

    const isMeasuringFrameBounds = (): boolean =>
      frameBoundsMeasurementDepth > 0;

    function createMeasurementContext(
      getMeasurements: () => Measurements,
      hasMeasurements: true,
      warnOnUnavailableRead: boolean,
    ): StaticMeasurementContext;
    function createMeasurementContext(
      getMeasurements: () => Measurements,
      hasMeasurements: false,
      warnOnUnavailableRead: boolean,
    ): DynamicMeasurementContext;
    function createMeasurementContext(
      getMeasurements: () => Measurements,
      hasMeasurements: boolean,
      warnOnUnavailableRead: boolean,
    ): MeasurementContext;
    function createMeasurementContext(
      getMeasurements: () => Measurements,
      hasMeasurements: boolean,
      warnOnUnavailableRead: boolean,
    ): MeasurementContext {
      let hasWarnedOnMeasureRead = false;

      const context: DynamicMeasurementContext = {
        hasMeasurements,
        getMeasurements: () => {
          if (
            !hasMeasurements &&
            warnOnUnavailableRead &&
            !hasWarnedOnMeasureRead
          ) {
            hasWarnedOnMeasureRead = true;
            console.warn(
              "getMeasurements() was called while dimensions are unknown, as liminalis " +
                "needs to know how big a frame is before measurements can be derived. " +
                "Use the hasMeasurements guard to check if measurements are available.",
            );
          }

          return getMeasurements();
        },
      };

      if (hasMeasurements) {
        const staticContext = context as StaticMeasurementContext;

        Object.defineProperty(staticContext, "measurements", {
          enumerable: true,
          configurable: false,
          get: () => getMeasurements(),
        });

        return staticContext;
      }

      return context;
    }

    const createNoopAnimatable = <TProps extends object>(
      initialProps: TProps,
    ): Animatable<TProps> => {
      let currentProps = initialProps;

      const noopAnimatable = {
        get currentProps() {
          return currentProps;
        },
        setCurrentFrameTime: () => undefined,
        updateInitialProps: (props: TProps): void => {
          currentProps = props;
        },
        captureCurrentProps: () => undefined,
        clearSegments: () => undefined,
        clearSnapshot: () => undefined,
        animateTo: () => noopAnimatable,
        withOptions: () => noopAnimatable,
        getCurrentProps: () => currentProps,
      };

      return noopAnimatable as unknown as Animatable<TProps>;
    };

    const getActiveBoundsCollector = (): BoundsCollector | undefined =>
      boundsCollectorStack[boundsCollectorStack.length - 1];

    const getClipScopesSignature = (scopes: ClipScope[]): string =>
      scopes
        .map(
          (scope, index) =>
            scope.getSignature?.() ?? `scope:${index}:no-signature`,
        )
        .join("||");

    // Queues a standard animatable draw operation.
    // Use for primitives that only need deferred animation + style resolution.
    //
    // - props: public primitive props captured for this frame
    // - renderFn: receives animated props during registry.flush() and performs drawing
    //
    // The queued closure also snapshots active clip scopes so nested clipping remains stable.
    const queueAnimatable = <T extends PartialDrawStyles>(
      primitiveType: string,
      props: T,
      renderFn: (context: CanvasRenderingContext2D, props: T) => void,
      getExtraSignature?: (props: T) => string,
      getBounds?: (props: T) => Bounds | null,
    ): Animatable<T> => {
      const mergedProps = appliedStylesManager.mergeStyles(props);
      const clipScopes = clipManager.captureScopes();
      const activeBoundsCollector = getActiveBoundsCollector();
      const shouldCollectBounds = suppressedPrimitiveBoundsDepth === 0;

      if (shouldCollectBounds) {
        activeBoundsCollector?.includeBounds(getBounds?.(mergedProps) ?? null);
      }

      if (isMeasuringFrameBounds()) {
        return createNoopAnimatable(mergedProps);
      }

      return registry.queue(mergedProps, (p) => {
        if (shouldCollectBounds) {
          activeBoundsCollector?.includeBounds(getBounds?.(p) ?? null);
        }

        const scopeSignature = getClipScopesSignature(clipScopes);
        const extraSignatureFromProps = getExtraSignature?.(p);
        const combinedExtraSignature = [
          `scope-signature:${scopeSignature}`,
          extraSignatureFromProps,
        ]
          .filter((signaturePart): signaturePart is string =>
            Boolean(signaturePart),
          )
          .join("|");

        const signature = DrawGroupManager.createPrimitiveSignature(
          primitiveType,
          p,
          clipScopes.length,
          combinedExtraSignature,
        );

        drawGroupManager.pushPrimitiveOperation({
          signature,
          render: (targetContext) => {
            const targetClipManager = new ClipManager(targetContext);
            let activeTargetContext = targetContext;

            const targetContextController: RenderContextController = {
              getContext: () => activeTargetContext,
              setContext: (nextContext: CanvasRenderingContext2D): void => {
                activeTargetContext = nextContext;
              },
            };

            targetClipManager.renderWithScopes(
              clipScopes,
              () => renderFn(targetContextController.getContext(), p),
              targetContextController,
            );
          },
        });
      });
    };

    // Queues a framable + animatable operation that can also create a frame scope.
    // Use for primitives that may be invoked with a frame callback (rect/circle/arc/etc).
    // Parametrs are as follows:
    //
    // - renderFn: draws the primitive from lifecycle props (possibly normalized)
    // - getFrameBounds: function that retrieves the bounds of a given primitive
    // - createScope: the clip scope required to render items within the frame bounds
    // - normalizeProps: maps public props to lifecycle props before frame context
    //   and clip scope are derived
    //
    // Without a frame callback, this behaves like queueAnimatable with lifecycle
    // normalization. With a frame callback, it computes frame context, queues
    // clip animation state, and applies the clip scope to nested deferred draws.
    const queueAnimatableWithFrame = <
      TProps extends PartialDrawStyles &
        TransformProps &
        CoordinateContextProps,
    >(
      primitiveType: string,
      renderFn: (context: CanvasRenderingContext2D, props: TProps) => void,
      getFrameBounds: (props: TProps) => Bounds,
      createScope: (getProps: () => TProps) => ClipScope,
      normalizeProps: (props: TProps) => TProps,
    ): ((props: TProps, frame?: FrameCallback) => Animatable<TProps>) => {
      return (
        props: TProps,
        frameCallback?: FrameCallback,
      ): Animatable<TProps> => {
        if (!frameCallback) {
          return queueAnimatable(
            primitiveType,
            props,
            (currentContext, drawProps) =>
              renderFn(currentContext, normalizeProps(drawProps)),
            undefined,
            (drawProps) => getFrameBounds(normalizeProps(drawProps)),
          );
        }

        const mergedProps = appliedStylesManager.mergeStyles(props);
        const lifecycleProps = normalizeProps(mergedProps);
        const frameBounds = getFrameBounds(lifecycleProps);

        const frameContext = createMeasurementContext(
          () => ({
            width: frameBounds.width,
            height: frameBounds.height,
            center: lifecycleProps.useLocalCoordinateContext
              ? { x: frameBounds.width / 2, y: frameBounds.height / 2 }
              : {
                  x: frameBounds.x + frameBounds.width / 2,
                  y: frameBounds.y + frameBounds.height / 2,
                },
          }),
          true,
          false,
        ) as FrameContext;

        let currentClipProps = lifecycleProps;
        const activeBoundsCollector = getActiveBoundsCollector();

        activeBoundsCollector?.includeBounds(getFrameBounds(currentClipProps));

        if (isMeasuringFrameBounds()) {
          if (frameCallback) {
            suppressedPrimitiveBoundsDepth++;

            try {
              frameCallback(frameContext);
            } finally {
              suppressedPrimitiveBoundsDepth--;
            }
          }

          return createNoopAnimatable(mergedProps);
        }

        const clipAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentClipProps = normalizeProps(animatedProps);
          activeBoundsCollector?.includeBounds(
            getFrameBounds(currentClipProps),
          );
        });

        const clipScope = createScope(() => currentClipProps);
        clipManager.withScope(clipScope, () => {
          const currentScopes = clipManager.captureScopes();

          drawGroupManager.withNestedGroup(
            () => {
              const scopeSignature = getClipScopesSignature(currentScopes);

              return DrawGroupManager.createPrimitiveSignature(
                `${primitiveType}:frame`,
                currentClipProps,
                currentScopes.length,
                `scope-signature:${scopeSignature}`,
              );
            },
            () => {
              suppressedPrimitiveBoundsDepth++;

              try {
                frameCallback(frameContext);
              } finally {
                suppressedPrimitiveBoundsDepth--;
              }
            },
          );
        });

        return clipAnimatable;
      };
    };

    const drawProperties = createMeasurementContext(
      () => ({
        width,
        height,
        center: { x: width / 2, y: height / 2 },
      }),
      true,
      false,
    );

    const drawPrimitives = {
      withStyles: appliedStylesManager.withStyles.bind(appliedStylesManager),
      background: (props: BackgroundProps) => background(context, props),
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable(
          "line",
          props,
          (currentContext, p) => line(currentContext, p),
          undefined,
          getLineBounds,
        ),
      polygon: queueAnimatableWithFrame(
        "polygon",
        (currentContext, p: PolygonProps) => polygon(currentContext, p),
        (p: PolygonProps) => polygonPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, polygonPathDescriptor),
        (p: PolygonProps) => p,
      ),
      bezier: queueAnimatableWithFrame(
        "bezier",
        (currentContext, p: BezierProps) => bezier(currentContext, p),
        (p: BezierProps) => bezierPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, bezierPathDescriptor),
        (p: BezierProps) => p,
      ),
      circle: queueAnimatableWithFrame(
        "circle",
        (currentContext, p: CircleProps) => circle(currentContext, p),
        (p: CircleProps) => circlePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, circlePathDescriptor),
        (p: CircleProps) => p,
      ),
      ellipse: queueAnimatableWithFrame(
        "ellipse",
        (currentContext, p: EllipseProps) => ellipse(currentContext, p),
        (p: EllipseProps) => ellipsePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, ellipsePathDescriptor),
        (p: EllipseProps) => p,
      ),
      arc: queueAnimatableWithFrame(
        "arc",
        (currentContext, p: ArcProps) => arc(currentContext, p),
        (p: ArcProps) => arcPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, arcPathDescriptor),
        (p: ArcProps) => p,
      ),
      rect: queueAnimatableWithFrame(
        "rect",
        (currentContext, p: RectProps) => rect(currentContext, p),
        (p: RectProps) => rectPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, rectPathDescriptor),
        (p: RectProps) => p,
      ),
      group: ((
        frameCallback: FrameCallback | StaticFrameCallback,
        options: GroupOptions = {},
      ) => {
        const mergedProps = { ...options };
        const contentBoundsCollector = createBoundsCollector();
        let derivedGroupBounds: Bounds = {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        };
        let currentGroupProps: GroupOptions = mergedProps;
        const activeBoundsCollector = getActiveBoundsCollector();

        const resolveGroupBoundsState = () => {
          const collectedBounds = contentBoundsCollector.getBounds();

          if (collectedBounds) {
            derivedGroupBounds = collectedBounds;
          }

          const frameBounds = {
            x: currentGroupProps.x ?? derivedGroupBounds.x,
            y: currentGroupProps.y ?? derivedGroupBounds.y,
            width: currentGroupProps.width ?? derivedGroupBounds.width,
            height: currentGroupProps.height ?? derivedGroupBounds.height,
          };

          return {
            derivedBounds: { ...derivedGroupBounds },
            frameBounds,
            frameCenter: {
              x: frameBounds.x + frameBounds.width / 2,
              y: frameBounds.y + frameBounds.height / 2,
            },
          };
        };

        const resolveGroupBounds = (): Bounds => {
          const { frameBounds } = resolveGroupBoundsState();

          return frameBounds;
        };

        const toScopeProps = () => {
          const { frameBounds, derivedBounds } = resolveGroupBoundsState();

          return {
            ...currentGroupProps,
            ...frameBounds,
            groupOffsetX: frameBounds.x - derivedBounds.x,
            groupOffsetY: frameBounds.y - derivedBounds.y,
            clipContent: false,
          };
        };

        const createGroupFrameContext = (
          hasMeasurements: boolean,
        ): FrameContext =>
          createMeasurementContext(
            () => {
              const { frameBounds, frameCenter } = resolveGroupBoundsState();

              return {
                width: frameBounds.width,
                height: frameBounds.height,
                center: frameCenter,
              };
            },
            hasMeasurements,
            !hasMeasurements,
          ) as FrameContext;

        if (
          mergedProps.width === undefined ||
          mergedProps.height === undefined
        ) {
          frameBoundsMeasurementDepth++;
          boundsCollectorStack.push(contentBoundsCollector);

          try {
            (frameCallback as FrameCallback)(createGroupFrameContext(false));
          } finally {
            boundsCollectorStack.pop();
            frameBoundsMeasurementDepth--;
          }
        }

        const renderGroupShowBounds = (): void => {
          if (currentGroupProps.showBounds !== true) {
            return;
          }

          const clipScopes = clipManager.captureScopes();
          const scopeSignature = getClipScopesSignature(clipScopes);

          drawGroupManager.pushPrimitiveOperation({
            signature: DrawGroupManager.createPrimitiveSignature(
              "group:show-bounds",
              {
                showBounds: true,
              },
              clipScopes.length,
              `scope-signature:${scopeSignature}`,
            ),
            render: (targetContext) => {
              const { derivedBounds, frameBounds } = resolveGroupBoundsState();

              const targetClipManager = new ClipManager(targetContext);
              targetClipManager.renderWithScopes(clipScopes, () => {
                targetContext.save();
                targetContext.beginPath();
                targetContext.rect(
                  derivedBounds.x,
                  derivedBounds.y,
                  frameBounds.width,
                  frameBounds.height,
                );
                targetContext.fillStyle = "rgba(255, 0, 0, 0.12)";
                targetContext.strokeStyle = "rgba(255, 0, 0, 0.7)";
                targetContext.lineWidth = 1;
                targetContext.fill();
                targetContext.stroke();
                targetContext.restore();
              });
            },
          });
        };

        const groupAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentGroupProps = animatedProps;
          activeBoundsCollector?.includeBounds(resolveGroupBounds());
        });

        const seedGroupAnimatablePositionFromDerivedBounds = (): void => {
          if (mergedProps.x !== undefined && mergedProps.y !== undefined) {
            return;
          }

          const inferredBounds = resolveGroupBounds();
          const seededInitialProps: GroupOptions = {
            ...currentGroupProps,
          };

          if (mergedProps.x === undefined) {
            seededInitialProps.x = inferredBounds.x;
          }

          if (mergedProps.y === undefined) {
            seededInitialProps.y = inferredBounds.y;
          }

          currentGroupProps = seededInitialProps;
          groupAnimatable.updateInitialProps(seededInitialProps);
        };

        const clipScope = createGroupScope(toScopeProps, groupPathDescriptor);

        clipManager.withScope(clipScope, () => {
          const currentScopes = clipManager.captureScopes();

          drawGroupManager.withNestedGroup(
            () => {
              const scopeSignature = getClipScopesSignature(currentScopes);

              return DrawGroupManager.createPrimitiveSignature(
                "group:frame",
                toScopeProps(),
                currentScopes.length,
                `scope-signature:${scopeSignature}`,
              );
            },
            () => {
              const frameContext = createGroupFrameContext(true);

              boundsCollectorStack.push(contentBoundsCollector);

              try {
                (frameCallback as FrameCallback)(frameContext);
              } finally {
                boundsCollectorStack.pop();
              }

              seedGroupAnimatablePositionFromDerivedBounds();

              renderGroupShowBounds();

              activeBoundsCollector?.includeBounds(resolveGroupBounds());
            },
          );
        });

        return groupAnimatable;
      }) as DrawPrimitives["group"],
      layer: ((
        frameCallback: FrameCallback | StaticFrameCallback,
        options: LayerOptions = {},
      ) => {
        const mergedProps = { ...options };
        const contentBoundsCollector = createBoundsCollector();
        let derivedLayerBounds: Bounds = {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        };
        let currentLayerProps: LayerOptions = mergedProps;
        const activeBoundsCollector = getActiveBoundsCollector();

        const resolveLayerBoundsState = () => {
          const collectedBounds = contentBoundsCollector.getBounds();

          if (collectedBounds) {
            derivedLayerBounds = collectedBounds;
          }

          const localFrameBounds = {
            x: Math.min(derivedLayerBounds.x, 0),
            y: Math.min(derivedLayerBounds.y, 0),
            width:
              Math.max(derivedLayerBounds.x + derivedLayerBounds.width, 0) -
              Math.min(derivedLayerBounds.x, 0),
            height:
              Math.max(derivedLayerBounds.y + derivedLayerBounds.height, 0) -
              Math.min(derivedLayerBounds.y, 0),
          };

          const frameBounds = {
            x: currentLayerProps.x ?? 0,
            y: currentLayerProps.y ?? 0,
            width: currentLayerProps.width ?? localFrameBounds.width,
            height: currentLayerProps.height ?? localFrameBounds.height,
          };

          return {
            derivedBounds: { ...derivedLayerBounds },
            localFrameBounds,
            frameBounds,
            frameCenter: {
              x: frameBounds.width / 2,
              y: frameBounds.height / 2,
            },
          };
        };

        const resolveLayerBounds = (): Bounds => {
          const { frameBounds } = resolveLayerBoundsState();

          return frameBounds;
        };

        const toScopeProps = () => {
          const { frameBounds } = resolveLayerBoundsState();

          return {
            ...currentLayerProps,
            ...frameBounds,
            useLocalCoordinateContext: true,
            clipContent: false,
          };
        };

        const createLayerFrameContext = (
          hasMeasurements: boolean,
        ): FrameContext =>
          createMeasurementContext(
            () => {
              const { frameBounds, frameCenter } = resolveLayerBoundsState();

              return {
                width: frameBounds.width,
                height: frameBounds.height,
                center: frameCenter,
              };
            },
            hasMeasurements,
            !hasMeasurements,
          ) as FrameContext;

        if (
          mergedProps.width === undefined ||
          mergedProps.height === undefined
        ) {
          frameBoundsMeasurementDepth++;
          boundsCollectorStack.push(contentBoundsCollector);

          try {
            (frameCallback as FrameCallback)(createLayerFrameContext(false));
          } finally {
            boundsCollectorStack.pop();
            frameBoundsMeasurementDepth--;
          }
        }

        const renderLayerShowBounds = (): void => {
          if (currentLayerProps.showBounds !== true) {
            return;
          }

          const clipScopes = clipManager.captureScopes();
          const scopeSignature = getClipScopesSignature(clipScopes);

          drawGroupManager.pushPrimitiveOperation({
            signature: DrawGroupManager.createPrimitiveSignature(
              "layer:show-bounds",
              {
                showBounds: true,
              },
              clipScopes.length,
              `scope-signature:${scopeSignature}`,
            ),
            render: (targetContext) => {
              const { localFrameBounds, frameBounds } =
                resolveLayerBoundsState();
              const hasExplicitWidth = currentLayerProps.width !== undefined;
              const hasExplicitHeight = currentLayerProps.height !== undefined;
              const debugX = hasExplicitWidth ? 0 : localFrameBounds.x;
              const debugY = hasExplicitHeight ? 0 : localFrameBounds.y;

              const targetClipManager = new ClipManager(targetContext);
              targetClipManager.renderWithScopes(clipScopes, () => {
                targetContext.save();
                targetContext.beginPath();
                targetContext.rect(
                  debugX,
                  debugY,
                  frameBounds.width,
                  frameBounds.height,
                );
                targetContext.fillStyle = "rgba(255, 0, 0, 0.12)";
                targetContext.strokeStyle = "rgba(255, 0, 0, 0.7)";
                targetContext.lineWidth = 1;
                targetContext.fill();
                targetContext.stroke();
                targetContext.restore();
              });
            },
          });
        };

        const layerAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentLayerProps = animatedProps;
          activeBoundsCollector?.includeBounds(resolveLayerBounds());
        });

        const clipScope = createGroupScope(toScopeProps, groupPathDescriptor);

        clipManager.withScope(clipScope, () => {
          const currentScopes = clipManager.captureScopes();

          drawGroupManager.withNestedGroup(
            () => {
              const scopeSignature = getClipScopesSignature(currentScopes);

              return DrawGroupManager.createPrimitiveSignature(
                "layer:frame",
                toScopeProps(),
                currentScopes.length,
                `scope-signature:${scopeSignature}`,
              );
            },
            () => {
              const frameContext = createLayerFrameContext(true);

              boundsCollectorStack.push(contentBoundsCollector);

              try {
                (frameCallback as FrameCallback)(frameContext);
              } finally {
                boundsCollectorStack.pop();
              }

              renderLayerShowBounds();

              activeBoundsCollector?.includeBounds(resolveLayerBounds());
            },
          );
        });

        return layerAnimatable;
      }) as DrawPrimitives["layer"],
      text: (
        textValue: string,
        props: TextProps = {},
        frameCallback?: FrameCallback,
      ) =>
        queueAnimatableWithFrame(
          "text",
          (currentContext, p: TextProps) => text(currentContext, textValue, p),
          (p: TextProps) => getTextBounds(context, textValue, p),
          (getProps) =>
            createTextMaskScope({
              textValue,
              getProps,
            }),
          (p: TextProps) => ({ ...p, font: resolveTextProps(p).font }),
        )(props, frameCallback),
      getTextBounds: (textValue: string, props: TextProps = {}) => {
        const mergedProps = appliedStylesManager.mergeStyles(props);
        return getTextBounds(context, textValue, mergedProps);
      },
      image: (imageSrc: string, props: ImageProps = {}) =>
        queueAnimatable(
          "image",
          props,
          (currentContext, p) => {
            const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

            if (readyImageAsset) {
              image(currentContext, readyImageAsset, p);
            }
          },
          () => {
            const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

            return `asset:${imageSrc}|ready:${readyImageAsset ? 1 : 0}`;
          },
          (p) => getImageBounds(imageSrc, p),
        ),
    };

    const drawPrimitivePropHelpers = {
      defineBackgroundProps: (props: BackgroundProps) => props,
      defineLineProps: (props: LineProps) => props,
      definePolygonProps: (props: PolygonProps) => props,
      defineBezierProps: (props: BezierProps) => props,
      defineArcProps: (props: ArcProps) => props,
      defineCircleProps: (props: CircleProps) => props,
      defineEllipseProps: (props: EllipseProps) => props,
      defineRectProps: (props: RectProps) => props,
      defineGroupProps: (props: GroupOptions) => props,
      defineLayerProps: (props: LayerOptions) => props,
      defineTextProps: (props: TextProps) => props,
    };

    const drawMethods: DrawMethods = {
      ...drawProperties,
      ...drawPrimitives,
      ...drawPrimitivePropHelpers,
    };

    callback(drawMethods);
    registry.flush();
    registry.endFrame();

    drawGroupManager.renderToContext({
      cache: drawGroupBitmapCache,
      targetContext: context,
      width,
      height,
    });
  };

  return { executeDrawCallback };
};

export type * from "./types";
