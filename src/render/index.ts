import { imageAssetCache } from "../core/ImageAssetCache";
import ActiveMeasurementsManager from "./ActiveMeasurementsManager";
import AnimatableRegistry from "./AnimatableRegistry";
import AppliedStylesManager from "./AppliedStylesManager";
import BoundsCollectionManager from "./BoundsCollectionManager";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import DrawGroupManager from "./DrawGroupManager";
import FrameMeasurementPassManager from "./FrameMeasurementPassManager";
import RenderWarningManager from "./RenderWarningManager";
import { createIsometricPrimitive } from "./primitives/isometric";

import { createClipScope, withClipScopedGroup } from "./clipping";

import type { PartialDrawStyles } from "../types";
import type { IAnimatableLike } from "./Animatable";
import type { ClipScope } from "./types";

import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  centerOf,
  createNoopAnimatable,
} from "./common";

import { devicePixelRatio } from "../util/";

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
  place,
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
  const renderWarningManager = new RenderWarningManager();

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): void => {
    registry.beginFrame(timeInMs);
    drawGroupBitmapCache.beginFrame({ width, height, devicePixelRatio });
    renderWarningManager.beginFrame();

    const drawGroupManager = new DrawGroupManager();
    const frameMeasurementPassManager = new FrameMeasurementPassManager();
    const boundsCollectionManager = new BoundsCollectionManager();
    const activeMeasurementsManager = new ActiveMeasurementsManager();

    const appliedStylesManager = new AppliedStylesManager({
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      blend: DEFAULT_BLEND_MODE,
    });

    // Queues a standard animatable draw operation.
    // Use for primitives that only need deferred animation + style resolution.
    //
    // - primitiveType: the type of the primitive being drawn, used for signature
    //   and identity generation
    // - props: public primitive props captured for this frame
    // - renderFn: receives animated props during registry.flush() and performs drawing
    // - hooks: optional functions to provide e.g. extra signature and bounds information
    //
    // The queued closure also snapshots active clip scopes so nested clipping remains stable.
    const queueAnimatable = <T extends PartialDrawStyles>(
      primitiveType: string,
      props: T,
      renderFn: (context: CanvasRenderingContext2D, props: T) => void,
      hooks?: {
        getExtraSignature?: (props: T) => string;
        getBounds?: (props: T) => Bounds | null;
      },
    ): IAnimatableLike<T> => {
      const { getExtraSignature, getBounds } = hooks ?? {};

      renderWarningManager.warnIfOverlayPrimitiveInsideIsometric();

      const mergedProps = appliedStylesManager.mergeStyles(props);
      const targetGroupHandle = drawGroupManager.captureCurrentGroupHandle();
      const activeBoundsCollector =
        boundsCollectionManager.getActiveCollector();
      const shouldCollectBounds = boundsCollectionManager.shouldCollectBounds();

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

        const extraSignatureFromProps = getExtraSignature?.(p);

        const signature = DrawGroupManager.createPrimitiveSignature(
          primitiveType,
          p,
          extraSignatureFromProps,
        );

        targetGroupHandle.pushPrimitiveOperation({
          signature,
          render: (targetContext) => renderFn(targetContext, p),
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
    ): ((props: TProps, frame?: FrameCallback) => IAnimatableLike<TProps>) => {
      return (
        props: TProps,
        frameCallback?: FrameCallback,
      ): IAnimatableLike<TProps> => {
        renderWarningManager.warnIfOverlayPrimitiveInsideIsometric();

        if (!frameCallback) {
          return queueAnimatable(
            primitiveType,
            props,
            (currentContext, drawProps) =>
              renderFn(currentContext, normalizeProps(drawProps)),
            {
              getBounds: (drawProps) =>
                getFrameBounds(normalizeProps(drawProps)),
            },
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
        const activeBoundsCollector =
          boundsCollectionManager.getActiveCollector();

        activeBoundsCollector?.includeBounds(getFrameBounds(currentClipProps));

        if (frameMeasurementPassManager.isMeasuringFrameBounds()) {
          if (frameCallback) {
            boundsCollectionManager.withSuppressedBounds(() => {
              frameCallback(frameContext);
            });
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

        withClipScopedGroup({
          drawGroupManager,
          clipScope,
          primitiveType: `${primitiveType}:frame`,
          getSignatureProps: () => currentClipProps,
          run: () => {
            boundsCollectionManager.withSuppressedBounds(() => {
              frameCallback(frameContext);
            });
          },
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

    const renderCollaborators = {
      registry,
      drawGroupManager,
    };

    const containerPrimitiveCommonParams = {
      ...renderCollaborators,
      createMeasurementContext:
        frameMeasurementPassManager.createMeasurementContext.bind(
          frameMeasurementPassManager,
        ),
      boundsCollectionManager,
      withFrameBoundsMeasurementPass:
        frameMeasurementPassManager.withFrameBoundsMeasurementPass.bind(
          frameMeasurementPassManager,
        ),
      isMeasuringFrameBounds:
        frameMeasurementPassManager.isMeasuringFrameBounds.bind(
          frameMeasurementPassManager,
        ),
      activeMeasurementsManager,
    };

    // Forward-declared so place() can close over the *complete* DrawMethods
    // object below, even though place() itself is built as part of
    // drawPrimitives (before drawMethods is assembled). Safe because
    // place()'s closure only reads drawMethods when actually invoked from
    // inside the user's callback, which happens strictly after the
    // assignment below.
    let drawMethods!: DrawMethods;

    const drawPrimitives = {
      isometric: createIsometricPrimitive({
        ...renderCollaborators,
        drawProperties,
        timeInMs,
        appliedStylesManager,
        renderWarningManager,
        activeMeasurementsManager,
      }),
      withStyles: appliedStylesManager.withStyles.bind(appliedStylesManager),
      background: (props: BackgroundProps) => background(context, props),
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable(
          "line",
          props,
          (currentContext, p) => line(currentContext, p),
          { getBounds: getLineBounds },
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
      group: group(containerPrimitiveCommonParams),
      layer: layer(containerPrimitiveCommonParams),
      place: place(containerPrimitiveCommonParams, () => drawMethods),
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
          `image:${imageSrc}`,
          props,
          (currentContext, p) => {
            const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

            if (readyImageAsset) {
              image(currentContext, readyImageAsset, p);
            }
          },
          {
            getExtraSignature: () =>
              `ready:${imageAssetCache.getReadyAsset(imageSrc) ? 1 : 0}`,
            getBounds: (p) => getImageBounds(imageSrc, p),
          },
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

    drawMethods = {
      ...drawProperties,
      ...drawPrimitives,
      ...drawPrimitivePropHelpers,
    };

    // Seeds the ambient-measurements stack with the canvas's own size for
    // the whole callback, so a top-level isometric() (or any primitive that
    // consults it) without an enclosing container still defaults correctly.
    activeMeasurementsManager.withMeasurements(
      () => drawProperties.measurements,
      () => callback(drawMethods),
    );

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
