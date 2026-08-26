import { imageAssetCache } from "../core/ImageAssetCache";
import AnimatableRegistry from "./AnimatableRegistry";
import AppliedStylesManager from "./AppliedStylesManager";
import ClipManager from "./ClipManager";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import DrawGroupManager from "./DrawGroupManager";
import FrameMeasurementPassManager from "./FrameMeasurementPassManager";
import OverlayPrimitiveWarningManager from "./OverlayPrimitiveWarningManager";
import { createIsometricPrimitive } from "./isometric";

import { createClipScope } from "./clipping";

import type { PartialDrawStyles } from "../types";
import type { IAnimatableLike } from "./Animatable";
import type {
  BoundsCollector,
  ClipScope,
  RenderContextController,
} from "./types";

import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  centerOf,
  createNoopAnimatable,
  withOverlayPrimitiveWarning,
} from "./common";

import {
  OVERLAY_WARNING_NAMED_PRIMITIVES,
  PRIMITIVE_NAME,
  type PrimitiveName,
} from "./primitiveNames";

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
  getImageBounds,
  getLineBounds,
  getTextBounds,
  group,
  image,
  layer,
  line,
  polygon,
  polygonPathDescriptor,
  rect,
  rectPathDescriptor,
  resolveTextProps,
  text,
} from "./primitives";

import type {
  ArcProps,
  BackgroundProps,
  BezierProps,
  Bounds,
  CircleProps,
  CoordinateContextProps,
  DrawContext,
  DrawMethods,
  EllipseProps,
  FrameCallback,
  FrameContext,
  GroupOptions,
  ImageProps,
  LayerOptions,
  LineProps,
  PolygonProps,
  RectProps,
  TextProps,
  TransformProps,
} from "./types";

export const createDrawContext = (): DrawContext => {
  const registry = new AnimatableRegistry();
  const drawGroupBitmapCache = new DrawGroupBitmapCache();
  const overlayPrimitiveWarningManager = new OverlayPrimitiveWarningManager();

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
    const frameMeasurementPassManager = new FrameMeasurementPassManager();
    const appliedStylesManager = new AppliedStylesManager({
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      blend: DEFAULT_BLEND_MODE,
    });

    const boundsCollectorStack: BoundsCollector[] = [];
    let suppressedPrimitiveBoundsDepth = 0;

    overlayPrimitiveWarningManager.beginFrame();

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
      primitiveType: PrimitiveName,
      props: T,
      renderFn: (context: CanvasRenderingContext2D, props: T) => void,
      getExtraSignature?: (props: T) => string,
      getBounds?: (props: T) => Bounds | null,
    ): IAnimatableLike<T> => {
      overlayPrimitiveWarningManager.warnIfOverlayPrimitiveInsideIsometric(
        primitiveType,
      );

      const mergedProps = appliedStylesManager.mergeStyles(props);
      const clipScopes = clipManager.captureScopes();
      const activeBoundsCollector = getActiveBoundsCollector();
      const shouldCollectBounds = suppressedPrimitiveBoundsDepth === 0;

      if (shouldCollectBounds) {
        activeBoundsCollector?.includeBounds(getBounds?.(mergedProps) ?? null);
      }

      if (frameMeasurementPassManager.isMeasuringFrameBounds()) {
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
      primitiveType: PrimitiveName,
      renderFn: (context: CanvasRenderingContext2D, props: TProps) => void,
      getFrameBounds: (props: TProps) => Bounds,
      createScope: (getProps: () => TProps) => ClipScope,
      normalizeProps: (props: TProps) => TProps,
    ): ((props: TProps, frame?: FrameCallback) => IAnimatableLike<TProps>) => {
      return (
        props: TProps,
        frameCallback?: FrameCallback,
      ): IAnimatableLike<TProps> => {
        overlayPrimitiveWarningManager.warnIfOverlayPrimitiveInsideIsometric(
          primitiveType,
        );

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

        const frameContext =
          frameMeasurementPassManager.createMeasurementContext(
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

        if (frameMeasurementPassManager.isMeasuringFrameBounds()) {
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

    const drawProperties = frameMeasurementPassManager.createMeasurementContext(
      () => ({
        width,
        height,
        center: { x: width / 2, y: height / 2 },
      }),
      true,
      false,
    );

    const containerPrimitiveCommonParams = {
      registry,
      clipManager,
      drawGroupManager,
      getClipScopesSignature,
      getActiveBoundsCollector,
      createMeasurementContext:
        frameMeasurementPassManager.createMeasurementContext.bind(
          frameMeasurementPassManager,
        ),
      boundsCollectorStack,
      withFrameBoundsMeasurementPass:
        frameMeasurementPassManager.withFrameBoundsMeasurementPass.bind(
          frameMeasurementPassManager,
        ),
    };

    const drawPrimitives = {
      withStyles: appliedStylesManager.withStyles.bind(appliedStylesManager),
      isometric: createIsometricPrimitive({
        width,
        height,
        timeInMs,
        registry,
        clipManager,
        drawGroupManager,
        appliedStylesManager,
        overlayPrimitiveWarningManager,
        getClipScopesSignature,
      }),
      background: (props: BackgroundProps) => background(context, props),
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable(
          PRIMITIVE_NAME.LINE,
          props,
          (currentContext, p) => line(currentContext, p),
          undefined,
          getLineBounds,
        ),
      polygon: queueAnimatableWithFrame(
        PRIMITIVE_NAME.POLYGON,
        (currentContext, p: PolygonProps) => polygon(currentContext, p),
        (p: PolygonProps) => polygonPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, polygonPathDescriptor),
        (p: PolygonProps) => p,
      ),
      bezier: queueAnimatableWithFrame(
        PRIMITIVE_NAME.BEZIER,
        (currentContext, p: BezierProps) => bezier(currentContext, p),
        (p: BezierProps) => bezierPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, bezierPathDescriptor),
        (p: BezierProps) => p,
      ),
      circle: queueAnimatableWithFrame(
        PRIMITIVE_NAME.CIRCLE,
        (currentContext, p: CircleProps) => circle(currentContext, p),
        (p: CircleProps) => circlePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, circlePathDescriptor),
        (p: CircleProps) => p,
      ),
      ellipse: queueAnimatableWithFrame(
        PRIMITIVE_NAME.ELLIPSE,
        (currentContext, p: EllipseProps) => ellipse(currentContext, p),
        (p: EllipseProps) => ellipsePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, ellipsePathDescriptor),
        (p: EllipseProps) => p,
      ),
      arc: queueAnimatableWithFrame(
        PRIMITIVE_NAME.ARC,
        (currentContext, p: ArcProps) => arc(currentContext, p),
        (p: ArcProps) => arcPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, arcPathDescriptor),
        (p: ArcProps) => p,
      ),
      rect: queueAnimatableWithFrame(
        PRIMITIVE_NAME.RECT,
        (currentContext, p: RectProps) => rect(currentContext, p),
        (p: RectProps) => rectPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, rectPathDescriptor),
        (p: RectProps) => p,
      ),
      group: group(containerPrimitiveCommonParams),
      layer: layer(containerPrimitiveCommonParams),
      text: (
        textValue: string,
        props: TextProps = {},
        frameCallback?: FrameCallback,
      ) =>
        queueAnimatableWithFrame(
          PRIMITIVE_NAME.TEXT,
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
          PRIMITIVE_NAME.IMAGE,
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

    const wrapOverlayWarningForNamedPrimitives = <
      T extends Record<string, (...args: any[]) => any>,
      K extends keyof T,
    >(
      primitives: T,
      keys: readonly K[],
    ): void => {
      keys.forEach((key) => {
        const primitiveName = key as PrimitiveName;
        const primitiveFn = primitives[key];

        primitives[key] = withOverlayPrimitiveWarning(primitiveFn, () =>
          overlayPrimitiveWarningManager.warnIfOverlayPrimitiveInsideIsometric(
            primitiveName,
          ),
        ) as T[K];
      });
    };

    wrapOverlayWarningForNamedPrimitives(
      drawPrimitives,
      OVERLAY_WARNING_NAMED_PRIMITIVES,
    );

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

export * from "./primitiveNames";
export type * from "./types";
