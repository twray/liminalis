import type Animatable from "../../core/Animatable";
import AnimatableRegistry from "../../core/AnimatableRegistry";
import { imageAssetCache } from "../../core/ImageAssetCache";
import type { PartialDrawStyles } from "../../types";
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
  CircleProps,
  ClosedPathDescriptor,
  DrawContext,
  DrawMethods,
  EllipseProps,
  ImageProps,
  LineProps,
  PolygonProps,
  RectProps,
  TextProps,
  TransformProps,
} from "./types";

const createClipScope = <T extends TransformProps>(
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

    const createFramedMethod = <T extends PartialDrawStyles & TransformProps>(
      renderFn: (props: T) => void,
      getPathDescriptor: (props: T) => ClosedPathDescriptor,
    ): ((props: T, frame?: () => void) => Animatable<T>) => {
      return (props: T, frame?: () => void): Animatable<T> => {
        if (!frame) {
          return queueDraw(props, renderFn);
        }

        const mergedProps = mergeStyles(props);
        let currentClipProps = mergedProps;

        const clipAnimatable = registry.queue(mergedProps, (animatedProps) => {
          currentClipProps = animatedProps;
        });

        const clipScope = createClipScope(
          () => currentClipProps,
          getPathDescriptor,
        );

        clipManager.withScope(clipScope, frame);

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
      rect: createFramedMethod(
        (p: RectProps) => rect(context, p),
        rectPathDescriptor,
      ),
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
