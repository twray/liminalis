import { degreesToRadians } from "../util";
import { resolveTransformOrigin } from "./common";

import type { Point2D } from "../types";
import type {
  ClipScope,
  Bounds,
  ClippableFrameProps,
  TransformProps,
  ClosedPathDescriptor,
} from "./types";

const applyForwardTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: Bounds,
): {
  hasScale: boolean;
  hasRotate: boolean;
  effectiveScaleX: number;
  effectiveScaleY: number;
  scaleOrigin: Point2D;
  rotateOrigin: Point2D;
  radians: number;
} => {
  const { rotate, rotateOrigin, scale, scaleX, scaleY, scaleOrigin } = props;

  const hasRotate = rotate !== undefined && rotate !== 0;
  const effectiveScaleX = scaleX ?? scale ?? 1;
  const effectiveScaleY = scaleY ?? scale ?? 1;
  const isInvertibleScale = effectiveScaleX !== 0 && effectiveScaleY !== 0;
  const hasScale =
    isInvertibleScale && (effectiveScaleX !== 1 || effectiveScaleY !== 1);

  const resolvedScaleOrigin = resolveTransformOrigin(scaleOrigin, bounds);
  const resolvedRotateOrigin = resolveTransformOrigin(rotateOrigin, bounds);
  const radians = degreesToRadians(rotate ?? 0);

  if (hasScale) {
    context.translate(resolvedScaleOrigin.x, resolvedScaleOrigin.y);
    context.scale(effectiveScaleX, effectiveScaleY);
    context.translate(-resolvedScaleOrigin.x, -resolvedScaleOrigin.y);
  }

  if (hasRotate) {
    context.translate(resolvedRotateOrigin.x, resolvedRotateOrigin.y);
    context.rotate(radians);
    context.translate(-resolvedRotateOrigin.x, -resolvedRotateOrigin.y);
  }

  return {
    hasScale,
    hasRotate,
    effectiveScaleX,
    effectiveScaleY,
    scaleOrigin: resolvedScaleOrigin,
    rotateOrigin: resolvedRotateOrigin,
    radians,
  };
};

const undoForwardTransform = (
  context: CanvasRenderingContext2D,
  transformState: ReturnType<typeof applyForwardTransform>,
): void => {
  const {
    hasRotate,
    hasScale,
    radians,
    rotateOrigin,
    scaleOrigin,
    effectiveScaleX,
    effectiveScaleY,
  } = transformState;

  if (hasRotate) {
    context.translate(rotateOrigin.x, rotateOrigin.y);
    context.rotate(-radians);
    context.translate(-rotateOrigin.x, -rotateOrigin.y);
  }

  if (hasScale) {
    context.translate(scaleOrigin.x, scaleOrigin.y);
    context.scale(1 / effectiveScaleX, 1 / effectiveScaleY);
    context.translate(-scaleOrigin.x, -scaleOrigin.y);
  }
};

const clipToEmptyRegion = (context: CanvasRenderingContext2D): void => {
  context.beginPath();
  context.rect(0, 0, 0, 0);
  context.clip();
};

export const createClipScope = <T extends TransformProps & ClippableFrameProps>(
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

      if (props.useLocalCoordinateContext) {
        context.translate(descriptor.bounds.x, descriptor.bounds.y);
      }
    },
  };
};
