import { stableSerialize } from "../util";
import DrawGroupManager from "./DrawGroupManager";

import { resolveTransformState } from "./common";
import type {
  Bounds,
  ClipScope,
  ClosedPathDescriptor,
  CoordinateContextProps,
  TransformProps,
  TransformState,
} from "./types";

const applyForwardTransform = (
  context: CanvasRenderingContext2D,
  props: TransformProps,
  bounds: Bounds,
): TransformState => {
  const {
    hasRotate,
    hasScale,
    scaleX: effectiveScaleX,
    scaleY: effectiveScaleY,
    scaleOrigin,
    rotateOrigin,
    rotateRadians,
  } = resolveTransformState(props, bounds);

  if (hasScale) {
    context.translate(scaleOrigin.x, scaleOrigin.y);
    context.scale(effectiveScaleX, effectiveScaleY);
    context.translate(-scaleOrigin.x, -scaleOrigin.y);
  }

  if (hasRotate) {
    context.translate(rotateOrigin.x, rotateOrigin.y);
    context.rotate(rotateRadians);
    context.translate(-rotateOrigin.x, -rotateOrigin.y);
  }

  return {
    hasScale,
    hasRotate,
    scaleX: effectiveScaleX,
    scaleY: effectiveScaleY,
    scaleOrigin,
    rotateOrigin,
    rotateRadians,
  };
};

const undoForwardTransform = (
  context: CanvasRenderingContext2D,
  transformState: TransformState,
): void => {
  const {
    hasRotate,
    hasScale,
    rotateOrigin,
    rotateRadians,
    scaleOrigin,
    scaleX,
    scaleY,
  } = transformState;

  if (hasRotate) {
    context.translate(rotateOrigin.x, rotateOrigin.y);
    context.rotate(-rotateRadians);
    context.translate(-rotateOrigin.x, -rotateOrigin.y);
  }

  if (hasScale) {
    context.translate(scaleOrigin.x, scaleOrigin.y);
    context.scale(1 / scaleX, 1 / scaleY);
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
      const internalGroupProps = props as unknown as {
        groupOffsetX?: number;
        groupOffsetY?: number;
      };
      const groupOffsetX = internalGroupProps.groupOffsetX ?? 0;
      const groupOffsetY = internalGroupProps.groupOffsetY ?? 0;

      if (!descriptor.isValid) {
        return;
      }

      applyForwardTransform(context, props, descriptor.bounds);

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
