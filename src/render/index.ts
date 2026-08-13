import AnimatableRegistry from "../core/AnimatableRegistry";
import { imageAssetCache } from "../core/ImageAssetCache";
import AppliedStylesManager from "./AppliedStylesManager";
import ClipManager from "./ClipManager";
import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import DrawGroupManager from "./DrawGroupManager";
import { createClipScope } from "./clipping";

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
  frame,
  framePathDescriptor,
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
import type {
  ArcProps,
  BackgroundProps,
  BezierProps,
  Bounds,
  CircleProps,
  ClippableFrameProps,
  DrawContext,
  DrawMethods,
  EllipseProps,
  FrameCallback,
  FrameProps,
  ImageProps,
  LineProps,
  PolygonProps,
  RectProps,
  TextProps,
  TransformProps,
} from "./types";

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
    ): Animatable<T> => {
      const mergedProps = appliedStylesManager.mergeStyles(props);
      const clipScopes = clipManager.captureScopes();

      return registry.queue(mergedProps, (p) => {
        const signature = DrawGroupManager.createPrimitiveSignature(
          primitiveType,
          p,
          clipScopes.length,
          getExtraSignature?.(p),
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
    // - normalizeProps: maps public props to lifecycle props (for example, frame injects
    //   useLocalCoordinateContext before frame context + clip scope are derived)
    //
    // Without a frame callback, this behaves like queueAnimatable with lifecycle
    // normalization. With a frame callback, it computes frame context, queues
    // clip animation state, and applies the clip scope to nested deferred draws.
    const queueAnimatableWithFrame = <
      TPublic extends PartialDrawStyles & TransformProps,
      TLifecycle extends TPublic & ClippableFrameProps,
    >(
      primitiveType: string,
      renderFn: (context: CanvasRenderingContext2D, props: TLifecycle) => void,
      getFrameBounds: (props: TLifecycle) => Bounds,
      createScope: (getProps: () => TLifecycle) => ClipScope,
      normalizeProps: (props: TPublic) => TLifecycle,
    ): ((props: TPublic, frame?: FrameCallback) => Animatable<TPublic>) => {
      return (
        props: TPublic,
        frameCallback?: FrameCallback,
      ): Animatable<TPublic> => {
        if (!frameCallback) {
          return queueAnimatable(
            primitiveType,
            props,
            (currentContext, drawProps) =>
              renderFn(currentContext, normalizeProps(drawProps)),
          );
        }

        const mergedProps = appliedStylesManager.mergeStyles(props);
        const lifecycleProps = normalizeProps(mergedProps);
        const frameBounds = getFrameBounds(lifecycleProps);

        const frameContext = {
          contextWidth: frameBounds.width,
          contextHeight: frameBounds.height,
          contextCenter: lifecycleProps.useLocalCoordinateContext
            ? { x: frameBounds.width / 2, y: frameBounds.height / 2 }
            : {
                x: frameBounds.x + frameBounds.width / 2,
                y: frameBounds.y + frameBounds.height / 2,
              },
        };

        let currentClipProps = lifecycleProps;

        const clipAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentClipProps = normalizeProps(animatedProps);
        });

        const clipScope = createScope(() => currentClipProps);
        clipManager.withScope(clipScope, () => {
          drawGroupManager.withNestedGroup(
            () =>
              DrawGroupManager.createPrimitiveSignature(
                `${primitiveType}:frame`,
                currentClipProps,
                clipManager.captureScopes().length,
              ),
            () => frameCallback(frameContext),
          );
        });

        return clipAnimatable;
      };
    };

    const drawProperties = {
      sceneWidth: width,
      sceneHeight: height,
      sceneCenter: { x: width / 2, y: height / 2 },
    };

    const drawPrimitives = {
      withStyles: appliedStylesManager.withStyles.bind(appliedStylesManager),
      background: (props: BackgroundProps) => background(context, props),
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable("line", props, (currentContext, p) =>
          line(currentContext, p),
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
      frame: queueAnimatableWithFrame(
        "frame",
        (currentContext, p: FrameProps) => frame(currentContext, p),
        (p: FrameProps) => framePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, framePathDescriptor),
        (p: FrameProps) => ({ ...p, useLocalCoordinateContext: true }),
      ),
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
      defineFrameProps: (props: FrameProps) => props,
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
