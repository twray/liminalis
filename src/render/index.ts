import { imageAssetCache } from "../core/ImageAssetCache";
import ActiveMeasurementsManager from "./ActiveMeasurementsManager";
import AnimatableRegistry from "./AnimatableRegistry";
import AppliedStylesManager from "./AppliedStylesManager";
import BoundsCollectionManager from "./BoundsCollectionManager";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import DrawGroupManager from "./DrawGroupManager";
import FrameMeasurementPassManager from "./FrameMeasurementPassManager";
import RenderWarningManager from "./RenderWarningManager";
import VideoTransportRegistry from "./VideoTransportRegistry";
import { createIsometricPrimitive } from "./primitives/isometric";

import {
  createClipScope,
  createGroupScope,
  withClipScopedGroup,
} from "./clipping";

import type {
  IAnimatableLike,
  PartialDrawStyles,
  RenderOptimisations,
} from "../types";
import type { ClipScope, DrawAPI, Measurements } from "./types";

import {
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  EMPTY_BOUNDS,
  centerOf,
  computeTransformedRectangularAABB,
  createNoopAnimatable,
  memoPropsMatch,
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
  getArcTransformedAABB,
  getBezierTransformedAABB,
  getCircleTransformedAABB,
  getEllipseTransformedAABB,
  getImageBounds,
  getLineTransformedAABB,
  getPolygonTransformedAABB,
  getRectTransformedAABB,
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
  video,
} from "./primitives";

import type {
  ArcProps,
  BackgroundProps,
  BezierProps,
  Bounds,
  CircleProps,
  CoordinateContextProps,
  DrawContext,
  EllipseProps,
  FrameCallback,
  FrameContext,
  GroupOptions,
  ImageProps,
  LayerOptions,
  LineProps,
  MemoizedSignature,
  PolygonProps,
  RectProps,
  TextProps,
  TransformProps,
  VideoProps,
} from "./types";

interface QueueAnimatableHooks<TProps> {
  getExtraSignature?: (props: TProps) => string;
  getBounds?: (props: TProps) => Bounds | null;
  getTransformedAABB?: (props: TProps) => Bounds;
  ownGroup?: {
    getScope: (props: TProps) => ClipScope;
    getInvalidationSignature: (props: TProps) => string;
  };
}

export const createDrawContext = (
  optimisations: Partial<RenderOptimisations> = {},
): DrawContext => {
  const { enableBitmapBasedCaching = true } = optimisations;

  // Keyed by the Animatable, which is the only per-primitive identity that
  // survives between frames here (props objects and group handles are
  // rebuilt every frame). Weak so entries disappear with the animatable
  // when registry.endFrame() drops it.
  const signatureMemo = new WeakMap<object, MemoizedSignature>();

  const resolveSignature = (
    owner: object | null,
    primitiveType: string,
    props: Record<string, unknown>,
    extraSignature: string | undefined,
  ): string => {
    const cached = owner ? signatureMemo.get(owner) : undefined;

    if (
      cached &&
      !cached.skipComparison &&
      cached.primitiveType === primitiveType &&
      cached.extraSignature === extraSignature &&
      memoPropsMatch(cached, props)
    ) {
      return cached.signature;
    }

    const signature = DrawGroupManager.createPrimitiveSignature(
      primitiveType,
      props,
      extraSignature,
    );

    if (owner) {
      // Recomputing and getting the SAME string back means the props were
      // stable after all, so resume comparing next frame -- that is how a
      // primitive returns to the cheap path once its animation settles, at
      // a cost of one frame's lag.
      const skipComparison = cached ? cached.signature !== signature : false;

      signatureMemo.set(owner, {
        primitiveType,
        props,
        propKeys:
          skipComparison && cached ? cached.propKeys : Object.keys(props),
        extraSignature,
        signature,
        skipComparison,
      });
    }

    return signature;
  };

  const registry = new AnimatableRegistry();
  // Holds one <video> element per declaration site for this scene's lifetime.
  // Runs alongside the animatable registry rather than through it: playback
  // state is reconciled synchronously at declare time, while the container's
  // geometry still goes through queueAnimatable so it can be animated.
  const videoTransportRegistry = new VideoTransportRegistry();
  const drawGroupBitmapCache = new DrawGroupBitmapCache({
    enabled: enableBitmapBasedCaching,
  });
  const renderWarningManager = new RenderWarningManager();

  const executeDrawCallback = (
    callback: (methods: DrawAPI) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): void => {
    registry.beginFrame(timeInMs);
    videoTransportRegistry.beginFrame();
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
    const queueAnimatable = <TProps extends PartialDrawStyles & TransformProps>(
      primitiveType: string,
      props: TProps,
      renderFn: (context: CanvasRenderingContext2D, props: TProps) => void,
      hooks?: QueueAnimatableHooks<TProps>,
    ): IAnimatableLike<TProps> => {
      const {
        getExtraSignature,
        getBounds,
        getTransformedAABB: getTransformedBounds,
      } = hooks ?? {};

      renderWarningManager.warnIfOverlayPrimitiveInsideIsometric();

      const mergedProps = appliedStylesManager.mergeStyles(props);
      // Opt-in stable identity. Read off the public props rather than the
      // hooks so every primitive gets it for free.
      const identityKey = (props as { key?: string }).key;
      const targetGroupHandle = drawGroupManager.captureCurrentGroupHandle();
      const activeBoundsCollector =
        boundsCollectionManager.getActiveCollector();
      const shouldCollectBounds = boundsCollectionManager.shouldCollectBounds();

      const resolveTransformedBounds = (
        currentProps: TProps,
      ): Bounds | null => {
        if (getTransformedBounds) {
          return getTransformedBounds(currentProps);
        }

        const bounds = getBounds?.(currentProps) ?? null;
        return bounds
          ? computeTransformedRectangularAABB(bounds, currentProps)
          : null;
      };

      if (shouldCollectBounds) {
        activeBoundsCollector?.includeBounds(
          resolveTransformedBounds(mergedProps),
        );
      }

      if (frameMeasurementPassManager.isMeasuringFrameBounds()) {
        return createNoopAnimatable(mergedProps);
      }

      // Assigned immediately below; the closure only runs at flush time, by
      // which point it is set. Needed because the memo is keyed on the
      // animatable, which queue() returns rather than provides.
      let signatureOwner: object | null = null;

      const queuedAnimatable = registry.queue(
        mergedProps,
        (props) => {
          if (shouldCollectBounds) {
            // Current bounds collected per-frame of animation
            activeBoundsCollector?.includeBounds(
              resolveTransformedBounds(props),
            );
          }

          const signature = resolveSignature(
            signatureOwner,
            primitiveType,
            props as Record<string, unknown>,
            getExtraSignature?.(props),
          );

          if (hooks?.ownGroup) {
            targetGroupHandle.withNestedGroup(
              {
                scope: hooks.ownGroup.getScope(props),
                getInvalidationSignature: () =>
                  hooks.ownGroup!.getInvalidationSignature(props),
              },
              () => {
                drawGroupManager.pushPrimitiveOperation({
                  signature,
                  render: (targetContext) => renderFn(targetContext, props),
                });
              },
            );
          } else {
            targetGroupHandle.pushPrimitiveOperation({
              signature,
              render: (targetContext) => renderFn(targetContext, props),
            });
          }
        },
        {
          primitiveType,
          ...(identityKey !== undefined ? { key: identityKey } : {}),
        },
      );

      signatureOwner = queuedAnimatable;

      return queuedAnimatable;
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
      propsFn: (props: TProps) => TProps,
      getFrameBounds: (props: TProps) => Bounds,
      createScope: (getProps: () => TProps) => ClipScope,
      hooks?: QueueAnimatableHooks<TProps>,
    ): ((props: TProps, frame?: FrameCallback) => IAnimatableLike<TProps>) => {
      const { getTransformedAABB } = hooks ?? {};

      const resolveTransformedAABB = (currentProps: TProps): Bounds =>
        getTransformedAABB
          ? getTransformedAABB(currentProps)
          : computeTransformedRectangularAABB(
              getFrameBounds(currentProps),
              currentProps,
            );

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
              renderFn(currentContext, propsFn(drawProps)),
            {
              getBounds: (drawProps) => getFrameBounds(propsFn(drawProps)),
              ...(getTransformedAABB
                ? {
                    getTransformedAABB: (drawProps: TProps) =>
                      getTransformedAABB(propsFn(drawProps)),
                  }
                : {}),
            },
          );
        }

        const mergedProps = appliedStylesManager.mergeStyles(props);
        const lifecycleProps = propsFn(mergedProps);
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

        activeBoundsCollector?.includeBounds(
          resolveTransformedAABB(currentClipProps),
        );

        if (frameMeasurementPassManager.isMeasuringFrameBounds()) {
          if (frameCallback) {
            boundsCollectionManager.withSuppressedBounds(() => {
              frameCallback(frameContext);
            });
          }

          return createNoopAnimatable(mergedProps);
        }

        const clipAnimatable = registry.queue(
          mergedProps,
          (animatedProps) => {
            currentClipProps = propsFn(animatedProps);
            activeBoundsCollector?.includeBounds(
              resolveTransformedAABB(currentClipProps),
            );
          },
          {
            primitiveType: `${primitiveType}:frame`,
            ...((mergedProps as { key?: string }).key !== undefined
              ? { key: (mergedProps as { key?: string }).key }
              : {}),
          },
        );

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

    // Root-level measurements are always known before a frame renders — no
    // "might not have a size yet" ambiguity like a container can have — so
    // this is built directly as a plain StaticMeasurementContext rather than
    // through FrameMeasurementPassManager, which exists specifically to
    // manage that ambiguity for containers and can no longer produce a
    // static shape at all.
    const measurements: Measurements = {
      width,
      height,
      center: { x: width / 2, y: height / 2 },
    };

    const sceneMeasurements = measurements;

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

    // Forward-declared so place() can close over the *complete* DrawApi
    // object below, even though place() itself is built as part of
    // drawPrimitives (before drawApi is assembled). Safe because
    // place()'s closure only reads drawApi when actually invoked from
    // inside the user's callback, which happens strictly after the
    // assignment below.
    let drawApi!: DrawAPI;

    const drawProperties = { sceneMeasurements };

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
          { getTransformedAABB: getLineTransformedAABB },
        ),
      polygon: queueAnimatableWithFrame(
        "polygon",
        (currentContext, p: PolygonProps) => polygon(currentContext, p),
        (p: PolygonProps) => p,
        (p: PolygonProps) => polygonPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, polygonPathDescriptor),
        { getTransformedAABB: getPolygonTransformedAABB },
      ),
      bezier: queueAnimatableWithFrame(
        "bezier",
        (currentContext, p: BezierProps) => bezier(currentContext, p),
        (p: BezierProps) => p,
        (p: BezierProps) => bezierPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, bezierPathDescriptor),
        { getTransformedAABB: getBezierTransformedAABB },
      ),
      circle: queueAnimatableWithFrame(
        "circle",
        (currentContext, p: CircleProps) => circle(currentContext, p),
        (p: CircleProps) => p,
        (p: CircleProps) => circlePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, circlePathDescriptor),
        { getTransformedAABB: getCircleTransformedAABB },
      ),
      ellipse: queueAnimatableWithFrame(
        "ellipse",
        (currentContext, p: EllipseProps) => ellipse(currentContext, p),
        (p: EllipseProps) => p,
        (p: EllipseProps) => ellipsePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, ellipsePathDescriptor),
        { getTransformedAABB: getEllipseTransformedAABB },
      ),
      arc: queueAnimatableWithFrame(
        "arc",
        (currentContext, p: ArcProps) => arc(currentContext, p),
        (p: ArcProps) => p,
        (p: ArcProps) => arcPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, arcPathDescriptor),
        { getTransformedAABB: getArcTransformedAABB },
      ),
      rect: queueAnimatableWithFrame(
        "rect",
        (currentContext, p: RectProps) => rect(currentContext, p),
        (p: RectProps) => p,
        (p: RectProps) => rectPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, rectPathDescriptor),
        { getTransformedAABB: getRectTransformedAABB },
      ),
      group: group(containerPrimitiveCommonParams),
      layer: layer(containerPrimitiveCommonParams),
      place: place(containerPrimitiveCommonParams, () => drawApi),
      text: (
        textValue: string,
        props: TextProps = {},
        frameCallback?: FrameCallback,
      ) =>
        queueAnimatableWithFrame(
          "text",
          (currentContext, p: TextProps) => text(currentContext, textValue, p),
          (p: TextProps) => ({ ...p, font: resolveTextProps(p).font }),
          (p: TextProps) => getTextBounds(context, textValue, p),
          (getProps) =>
            createTextMaskScope({
              textValue,
              getProps,
            }),
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
      video: (videoSrc: string, props: VideoProps = {}) => {
        const identity = {
          primitiveType: `video:${videoSrc}`,
          ...(props.key !== undefined ? { key: props.key } : {}),
        };

        const transport = videoTransportRegistry.getOrCreate(
          videoSrc,
          props,
          identity,
        );

        return queueAnimatable(
          `video:${videoSrc}`,
          props,
          (currentContext, animatedProps) => {
            const {
              rotate: _rotate,
              rotateOrigin: _rotateOrigin,
              scale: _scale,
              scaleX: _scaleX,
              scaleY: _scaleY,
              scaleOrigin: _scaleOrigin,
              ...untransformed
            } = animatedProps;

            video(currentContext, transport, untransformed);
          },
          {
            getExtraSignature: () => transport.getExtraSignature(),
            getBounds: (p) => transport.getBounds(p),
            // Its own cache boundary, so a paused or ended video can be
            // blitted from a cached surface the moment IT stabilises, rather
            // than being redrawn every frame because an unrelated sibling is
            // still animating.
            ownGroup: {
              getScope: (p) =>
                createGroupScope(
                  () => ({ ...p, ...(transport.getBounds(p) ?? EMPTY_BOUNDS) }),
                  rectPathDescriptor,
                ),
              getInvalidationSignature: () => transport.getExtraSignature(),
            },
          },
        );
      },
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

    drawApi = {
      ...drawProperties,
      ...drawPrimitives,
      ...drawPrimitivePropHelpers,
    };

    // Seeds the ambient-measurements stack with the canvas's own size for
    // the whole callback, so a top-level isometric() (or any primitive that
    // consults it) without an enclosing container still defaults correctly.
    activeMeasurementsManager.withMeasurements(
      () => measurements,
      () => callback(drawApi),
    );

    registry.flush();
    registry.endFrame();
    videoTransportRegistry.endFrame();

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
