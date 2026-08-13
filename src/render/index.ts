import AnimatableRegistry from "../core/AnimatableRegistry";
import { imageAssetCache } from "../core/ImageAssetCache";
import ClipManager from "./ClipManager";
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

  const executeDrawCallback = (
    callback: (methods: DrawMethods) => void,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeInMs: number,
  ): void => {
    registry.beginFrame(timeInMs);

    let appliedStyles: PartialDrawStyles = {
      strokeStyle: DEFAULT_STROKE_STYLE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      blend: DEFAULT_BLEND_MODE,
    };

    const clipManager = new ClipManager(context);
    let renderContext: CanvasRenderingContext2D = context;

    const renderContextController: RenderContextController = {
      getContext: () => renderContext,
      setContext: (nextContext: CanvasRenderingContext2D): void => {
        renderContext = nextContext;
      },
    };

    const mergeStyles = <T extends PartialDrawStyles>(props: T): T => ({
      ...appliedStyles,
      ...props,
    });

    const withStyles = (
      styles: PartialDrawStyles,
      callbackFn: () => void,
    ): void => {
      const previousStyles = appliedStyles;
      appliedStyles = { ...appliedStyles, ...styles };

      try {
        return callbackFn();
      } finally {
        appliedStyles = previousStyles;
      }
    };

    // Queues a standard animatable draw operation.
    // Use for primitives that only need deferred animation + style resolution.
    //
    // - props: public primitive props captured for this frame
    // - renderFn: receives animated props during registry.flush() and performs drawing
    //
    // The queued closure also snapshots active clip scopes so nested clipping remains stable.
    const queueAnimatable = <T extends PartialDrawStyles>(
      props: T,
      renderFn: (context: CanvasRenderingContext2D, props: T) => void,
    ): Animatable<T> => {
      const mergedProps = mergeStyles(props);
      const clipScopes = clipManager.captureScopes();

      return registry.queue(mergedProps, (p) => {
        clipManager.renderWithScopes(
          clipScopes,
          () => renderFn(renderContextController.getContext(), p),
          renderContextController,
        );
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
          return queueAnimatable(props, (currentContext, drawProps) =>
            renderFn(currentContext, normalizeProps(drawProps)),
          );
        }

        const mergedProps = mergeStyles(props);
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
        clipManager.withScope(clipScope, () => frameCallback(frameContext));

        return clipAnimatable;
      };
    };

    const drawProperties = {
      sceneWidth: width,
      sceneHeight: height,
      sceneCenter: { x: width / 2, y: height / 2 },
    };

    const drawPrimitives = {
      withStyles,
      background: (props: BackgroundProps) => background(context, props),
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable(props, (currentContext, p) => line(currentContext, p)),
      polygon: queueAnimatableWithFrame(
        (currentContext, p: PolygonProps) => polygon(currentContext, p),
        (p: PolygonProps) => polygonPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, polygonPathDescriptor),
        (p: PolygonProps) => p,
      ),
      bezier: queueAnimatableWithFrame(
        (currentContext, p: BezierProps) => bezier(currentContext, p),
        (p: BezierProps) => bezierPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, bezierPathDescriptor),
        (p: BezierProps) => p,
      ),
      circle: queueAnimatableWithFrame(
        (currentContext, p: CircleProps) => circle(currentContext, p),
        (p: CircleProps) => circlePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, circlePathDescriptor),
        (p: CircleProps) => p,
      ),
      ellipse: queueAnimatableWithFrame(
        (currentContext, p: EllipseProps) => ellipse(currentContext, p),
        (p: EllipseProps) => ellipsePathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, ellipsePathDescriptor),
        (p: EllipseProps) => p,
      ),
      arc: queueAnimatableWithFrame(
        (currentContext, p: ArcProps) => arc(currentContext, p),
        (p: ArcProps) => arcPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, arcPathDescriptor),
        (p: ArcProps) => p,
      ),
      rect: queueAnimatableWithFrame(
        (currentContext, p: RectProps) => rect(currentContext, p),
        (p: RectProps) => rectPathDescriptor(p).bounds,
        (getProps) => createClipScope(getProps, rectPathDescriptor),
        (p: RectProps) => p,
      ),
      frame: queueAnimatableWithFrame(
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
          (currentContext, p: TextProps) => text(currentContext, textValue, p),
          (p: TextProps) => getTextBounds(context, textValue, p),
          (getProps) =>
            createTextMaskScope({
              textValue,
              getProps,
            }),
          (p: TextProps) => p,
        )(props, frameCallback),
      getTextBounds: (textValue: string, props: TextProps = {}) => {
        const mergedProps = mergeStyles(props);
        return getTextBounds(context, textValue, mergedProps);
      },
      image: (imageSrc: string, props: ImageProps = {}) =>
        queueAnimatable(props, (currentContext, p) => {
          const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

          if (readyImageAsset) {
            image(currentContext, readyImageAsset, p);
          }
        }),
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
  };

  return { executeDrawCallback };
};

export type * from "./types";
