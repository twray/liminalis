import { createContainerPrimitive } from "../container";
import { rectPathDescriptor } from "./rect";

import type { ContainerPrimitiveCommonParams } from "../container";
import type { Bounds, DrawPrimitives, GroupOptions } from "../types";

export const groupPathDescriptor = rectPathDescriptor;

interface ResolveGroupBoundsStateParams {
  currentGroupProps: GroupOptions;
  derivedGroupBounds: Bounds;
  collectedBounds: Bounds | null;
}

interface GroupBoundsState {
  derivedBounds: Bounds;
  frameBounds: Bounds;
  frameCenter: { x: number; y: number };
}

export const resolveGroupBoundsState = ({
  currentGroupProps,
  derivedGroupBounds,
  collectedBounds,
}: ResolveGroupBoundsStateParams): GroupBoundsState => {
  const resolvedDerivedBounds = collectedBounds ?? derivedGroupBounds;

  const frameBounds = {
    x: currentGroupProps.x ?? resolvedDerivedBounds.x,
    y: currentGroupProps.y ?? resolvedDerivedBounds.y,
    width: currentGroupProps.width ?? resolvedDerivedBounds.width,
    height: currentGroupProps.height ?? resolvedDerivedBounds.height,
  };

  return {
    derivedBounds: resolvedDerivedBounds,
    frameBounds,
    frameCenter: {
      x: frameBounds.x + frameBounds.width / 2,
      y: frameBounds.y + frameBounds.height / 2,
    },
  };
};

export const group = (
  params: ContainerPrimitiveCommonParams,
): DrawPrimitives["group"] =>
  createContainerPrimitive({
    containerType: "group",
    frameSignatureType: "group:frame",
    ...params,
    resolveState: ({ currentProps, derivedBounds, collectedBounds }) =>
      resolveGroupBoundsState({
        currentGroupProps: currentProps,
        derivedGroupBounds: derivedBounds,
        collectedBounds,
      }),
    buildScopeProps: ({ currentProps, state }) => ({
      ...currentProps,
      ...state.frameBounds,
      groupOffsetX: state.frameBounds.x - state.derivedBounds.x,
      groupOffsetY: state.frameBounds.y - state.derivedBounds.y,
      clipContent: false,
    }),
    buildShowBoundsRect: ({ state }) => ({
      x: state.derivedBounds.x,
      y: state.derivedBounds.y,
      width: state.frameBounds.width,
      height: state.frameBounds.height,
    }),
    pathDescriptor: groupPathDescriptor,
    seedInitialProps: ({
      mergedProps,
      currentProps,
      setCurrentProps,
      animatable,
      resolveFrameBounds,
    }) => {
      if (mergedProps.x !== undefined && mergedProps.y !== undefined) {
        return;
      }

      const inferredBounds = resolveFrameBounds();
      const seededInitialProps: GroupOptions = {
        ...currentProps,
      };

      if (mergedProps.x === undefined) {
        seededInitialProps.x = inferredBounds.x;
      }

      if (mergedProps.y === undefined) {
        seededInitialProps.y = inferredBounds.y;
      }

      setCurrentProps(seededInitialProps);
      animatable.updateInitialProps(seededInitialProps);
    },
  }) as DrawPrimitives["group"];
