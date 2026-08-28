import { degreesToRadians, stableSerialize } from "../util";
import { resolveTransformOrigin } from "./common";
import DrawGroupManager from "./DrawGroupManager";

import type { Point2D } from "../types";
import type {
  Bounds,
  ClippingOptionsProps,
  ClipScope,
  ClosedPathDescriptor,
  CoordinateContextProps,
  TransformProps,
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

export const createClipScope = <
  T extends TransformProps & CoordinateContextProps,
>(
  getProps: () => T,
  getPathDescriptor: (props: T) => ClosedPathDescriptor,
): ClipScope => {
  return {
    getSignature: (): string => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);

      return [
        "clip",
        `props:${stableSerialize(props)}`,
        `bounds:${stableSerialize(descriptor.bounds)}`,
        `valid:${descriptor.isValid ? 1 : 0}`,
      ].join("|");
    },
    getCompositeInfo: () => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);

      return {
        bounds: descriptor.bounds,
        isValid: descriptor.isValid,
        useLocalCoordinateContext: !!props.useLocalCoordinateContext,
      };
    },
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

export const createGroupScope = <
  T extends TransformProps & CoordinateContextProps & ClippingOptionsProps,
>(
  getProps: () => T,
  getPathDescriptor: (props: T) => ClosedPathDescriptor,
): ClipScope => {
  return {
    getSignature: (): string => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);

      return [
        "group",
        `props:${stableSerialize(props)}`,
        `bounds:${stableSerialize(descriptor.bounds)}`,
        `valid:${descriptor.isValid ? 1 : 0}`,
      ].join("|");
    },
    getCompositeInfo: () => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);

      return {
        bounds: descriptor.bounds,
        isValid: descriptor.isValid,
        useLocalCoordinateContext: !!props.useLocalCoordinateContext,
      };
    },
    apply: (context: CanvasRenderingContext2D): void => {
      const props = getProps();
      const descriptor = getPathDescriptor(props);
      const shouldClipContent = props.clipContent === true;
      const internalGroupProps = props as unknown as {
        groupOffsetX?: number;
        groupOffsetY?: number;
      };
      const groupOffsetX = internalGroupProps.groupOffsetX ?? 0;
      const groupOffsetY = internalGroupProps.groupOffsetY ?? 0;

      if (!descriptor.isValid) {
        if (shouldClipContent) {
          clipToEmptyRegion(context);
        }

        return;
      }

      applyForwardTransform(context, props, descriptor.bounds);

      if (shouldClipContent) {
        context.beginPath();
        descriptor.tracePath(context);
        context.clip();
      }

      if (groupOffsetX !== 0 || groupOffsetY !== 0) {
        context.translate(groupOffsetX, groupOffsetY);
      }

      if (props.useLocalCoordinateContext) {
        context.translate(descriptor.bounds.x, descriptor.bounds.y);
      }
    },
  };
};

interface WithClipScopedGroupParams {
  drawGroupManager: DrawGroupManager;
  clipScope: ClipScope;
  primitiveType: string;
  getSignatureProps: () => Record<string, any>;
  run: () => void;
}

// Opens a nested draw group carrying this clip scope, and runs `run` inside
// it. Shared by any primitive that can act as a clip-scoped container
// (shape-as-frame primitives in index.ts, group()/layer() in container.ts,
// text()'s mask frame) so the clip <-> cache-signature wiring exists in
// exactly one place. The scope is applied exactly once, by the compositor,
// when this group is composited into its parent — never replayed per
// descendant leaf (see DrawGroupManager.renderToContext).
export const withClipScopedGroup = ({
  drawGroupManager,
  clipScope,
  primitiveType,
  getSignatureProps,
  run,
}: WithClipScopedGroupParams): void => {
  drawGroupManager.withNestedGroup(
    {
      scope: clipScope,
      getInvalidationSignature: () =>
        DrawGroupManager.createPrimitiveSignature(
          primitiveType,
          getSignatureProps(),
        ),
    },
    run,
  );
};
