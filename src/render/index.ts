import type Animatable from "../core/Animatable";
import AnimatableRegistry from "../core/AnimatableRegistry";
import { imageAssetCache } from "../core/ImageAssetCache";
import type { PartialDrawStyles } from "../types";
import ClipManager, { type ClipScope } from "./ClipManager";

import {
  applyForwardTransform,
  centerOf,
  clipToEmptyRegion,
  DEFAULT_BLEND_MODE,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  undoForwardTransform,
} from "./common";
import {
  arc,
  arcPathDescriptor,
  background,
  bezier,
  bezierPathDescriptor,
  circle,
  circlePathDescriptor,
  ellipse,
  ellipsePathDescriptor,
  frame,
  framePathDescriptor,
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
  ClosedPathDescriptor,
  DrawContext,
  DrawMethods,
  EllipseProps,
  FrameCallback,
  FrameContext,
  FrameProps,
  ImageProps,
  LineProps,
  PolygonProps,
  RectProps,
  TextProps,
  TransformProps,
} from "./types";

const toFrameContext = (
  bounds: Bounds,
  newCoordinateSpace: boolean,
): FrameContext => {
  const center = newCoordinateSpace
    ? { x: bounds.width / 2, y: bounds.height / 2 }
    : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

  return {
    width: bounds.width,
    height: bounds.height,
    center,
  };
};

const createClipScope = <
  T extends TransformProps & { newCoordinateSpace?: boolean },
>(
  getProps: () => T,
  getPathDescriptor: (props: T) => ClosedPathDescriptor,
): ClipScope => {
  return {
    apply: (context: CanvasRenderingContext2D): void => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);

      if (!descriptor.isValid) {
        clipToEmptyRegion(context);
        return;
      }

      const transformState = applyForwardTransform(
        context,
        props,
        descriptor.bounds,
      );

      context.beginPath();
      descriptor.tracePath(context);
      context.clip();

      undoForwardTransform(context, transformState);

      if (props.newCoordinateSpace) {
        context.translate(descriptor.bounds.x, descriptor.bounds.y);
      }
    },
  };
};

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
    // - props: public primitive props captured for this frame
    // - renderFn: receives animated props during registry.flush() and performs drawing
    // The queued closure also snapshots active clip scopes so nested clipping remains stable.
    const queueAnimatable = <T extends PartialDrawStyles>(
      props: T,
      renderFn: (props: T) => void,
    ): Animatable<T> => {
      const mergedProps = mergeStyles(props);
      const clipScopes = clipManager.captureScopes();

      return registry.queue(mergedProps, (p) => {
        clipManager.renderWithScopes(clipScopes, () => renderFn(p));
      });
    };

    // Queues a clippable + animatable operation that can also create a frame scope.
    // Use for primitives that may be invoked with a frame callback (rect/circle/arc/etc).
    // - renderFn: draws the primitive from lifecycle props (possibly normalized)
    // - getPathDescriptor: builds the closed path used for clip masking and frame metrics
    // - normalizeProps: maps public props to lifecycle props (for example, frame injects
    //   newCoordinateSpace before frame context + clip scope are derived)
    // Without a frame callback, this behaves like queueDraw with lifecycle normalization.
    // With a frame callback, it computes frame context, queues clip animation state, and
    // applies the clip scope to nested deferred draws.
    const queueAnimatableAndClippable = <
      TPublic extends PartialDrawStyles & TransformProps,
      TLifecycle extends TPublic & ClippableFrameProps,
    >(
      renderFn: (props: TLifecycle) => void,
      getPathDescriptor: (props: TLifecycle) => ClosedPathDescriptor,
      normalizeProps: (props: TPublic) => TLifecycle,
    ): ((props: TPublic, frame?: FrameCallback) => Animatable<TPublic>) => {
      return (
        props: TPublic,
        frameCallback?: FrameCallback,
      ): Animatable<TPublic> => {
        if (!frameCallback) {
          return queueAnimatable(props, (drawProps) =>
            renderFn(normalizeProps(drawProps)),
          );
        }

        const mergedProps = mergeStyles(props);
        const lifecycleProps = normalizeProps(mergedProps);
        const frameDescriptor = getPathDescriptor(lifecycleProps);
        const frameContext = toFrameContext(
          frameDescriptor.bounds,
          !!lifecycleProps.newCoordinateSpace,
        );
        let currentClipProps = lifecycleProps;

        const clipAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentClipProps = normalizeProps(animatedProps);
        });

        const clipScope = createClipScope(
          () => currentClipProps,
          getPathDescriptor,
        );

        clipManager.withScope(clipScope, () => frameCallback(frameContext));

        return clipAnimatable;
      };
    };

    const methods: DrawMethods = {
      width,
      height,
      withStyles,
      background: (props: BackgroundProps) => background(context, props),
      center: { x: width / 2, y: height / 2 },
      centerOf,
      line: (props: LineProps) =>
        queueAnimatable(props, (p) => line(context, p)),
      polygon: queueAnimatableAndClippable(
        (p: PolygonProps) => polygon(context, p),
        polygonPathDescriptor,
        (p: PolygonProps) => p,
      ),
      bezier: queueAnimatableAndClippable(
        (p: BezierProps) => bezier(context, p),
        bezierPathDescriptor,
        (p: BezierProps) => p,
      ),
      circle: queueAnimatableAndClippable(
        (p: CircleProps) => circle(context, p),
        circlePathDescriptor,
        (p: CircleProps) => p,
      ),
      ellipse: queueAnimatableAndClippable(
        (p: EllipseProps) => ellipse(context, p),
        ellipsePathDescriptor,
        (p: EllipseProps) => p,
      ),
      arc: queueAnimatableAndClippable(
        (p: ArcProps) => arc(context, p),
        arcPathDescriptor,
        (p: ArcProps) => p,
      ),
      rect: queueAnimatableAndClippable(
        (p: RectProps) => rect(context, p),
        rectPathDescriptor,
        (p: RectProps) => p,
      ),
      frame: queueAnimatableAndClippable(
        (p: FrameProps) => frame(context, p),
        framePathDescriptor,
        (p: FrameProps) => ({ ...p, newCoordinateSpace: true }),
      ),
      text: (textValue: string, props: TextProps = {}) =>
        queueAnimatable(props, (p) => text(context, textValue, p)),
      image: (imageSrc: string, props: ImageProps = {}) =>
        queueAnimatable(props, (p) => {
          const readyImageAsset = imageAssetCache.getReadyAsset(imageSrc);

          if (readyImageAsset) {
            image(context, readyImageAsset, p);
          }
        }),
    };

    callback(methods);
    registry.flush();
    registry.endFrame();
  };

  return { executeDrawCallback };
};

export type * from "./types";
