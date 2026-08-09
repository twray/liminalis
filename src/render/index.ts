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

    const queueDraw = <T extends PartialDrawStyles>(
      props: T,
      renderFn: (props: T) => void,
    ): Animatable<T> => {
      const mergedProps = mergeStyles(props);
      const clipScopes = clipManager.captureScopes();

      return registry.queue(mergedProps, (p) => {
        clipManager.renderWithScopes(clipScopes, () => renderFn(p));
      });
    };

    const createFramedMethod = <
      T extends PartialDrawStyles &
        TransformProps & { newCoordinateSpace?: boolean },
    >(
      renderFn: (props: T) => void,
      getPathDescriptor: (props: T) => ClosedPathDescriptor,
    ): ((props: T, frame?: FrameCallback) => Animatable<T>) => {
      return (props: T, frame?: FrameCallback): Animatable<T> => {
        if (!frame) {
          return queueDraw(props, renderFn);
        }

        const mergedProps = mergeStyles(props);
        const frameDescriptor = getPathDescriptor(mergedProps);
        const frameContext = toFrameContext(
          frameDescriptor.bounds,
          !!mergedProps.newCoordinateSpace,
        );
        let currentClipProps = mergedProps;

        const clipAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentClipProps = animatedProps;
        });

        const clipScope = createClipScope(
          () => currentClipProps,
          getPathDescriptor,
        );

        clipManager.withScope(clipScope, () => frame(frameContext));

        return clipAnimatable;
      };
    };

    const rectFramedMethod = createFramedMethod(
      (p: RectProps) => rect(context, p),
      rectPathDescriptor,
    );

    const methods: DrawMethods = {
      width,
      height,
      withStyles,
      background: (props: BackgroundProps) => background(context, props),
      center: { x: width / 2, y: height / 2 },
      centerOf,
      line: (props: LineProps) => queueDraw(props, (p) => line(context, p)),
      polygon: createFramedMethod(
        (p: PolygonProps) => polygon(context, p),
        polygonPathDescriptor,
      ),
      bezier: createFramedMethod(
        (p: BezierProps) => bezier(context, p),
        bezierPathDescriptor,
      ),
      circle: createFramedMethod(
        (p: CircleProps) => circle(context, p),
        circlePathDescriptor,
      ),
      ellipse: createFramedMethod(
        (p: EllipseProps) => ellipse(context, p),
        ellipsePathDescriptor,
      ),
      arc: createFramedMethod(
        (p: ArcProps) => arc(context, p),
        arcPathDescriptor,
      ),
      rect: rectFramedMethod,
      frame: (props: FrameProps, frame: FrameCallback) =>
        rectFramedMethod({ ...props, newCoordinateSpace: true }, frame),
      text: (textValue: string, props: TextProps = {}) =>
        queueDraw(props, (p) => text(context, textValue, p)),
      image: (imageSrc: string, props: ImageProps = {}) =>
        queueDraw(props, (p) => {
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
