import { createContainerPrimitive } from "../container";

import type { ContainerPrimitiveCommonParams } from "../container";
import type { Bounds, DrawPrimitives, LayerOptions } from "../types";
import { rectPathDescriptor } from "./rect";

export const layerPathDescriptor = rectPathDescriptor;

interface ResolveLayerBoundsStateParams {
  currentLayerProps: LayerOptions;
  derivedLayerBounds: Bounds;
  collectedBounds: Bounds | null;
}

interface LayerBoundsState {
  derivedBounds: Bounds;
  localFrameBounds: Bounds;
  frameBounds: Bounds;
  frameCenter: { x: number; y: number };
}

export const resolveLayerBoundsState = ({
  currentLayerProps,
  derivedLayerBounds,
  collectedBounds,
}: ResolveLayerBoundsStateParams): LayerBoundsState => {
  const resolvedDerivedBounds = collectedBounds ?? derivedLayerBounds;

  const localFrameBounds = {
    x: Math.min(resolvedDerivedBounds.x, 0),
    y: Math.min(resolvedDerivedBounds.y, 0),
    width:
      Math.max(resolvedDerivedBounds.x + resolvedDerivedBounds.width, 0) -
      Math.min(resolvedDerivedBounds.x, 0),
    height:
      Math.max(resolvedDerivedBounds.y + resolvedDerivedBounds.height, 0) -
      Math.min(resolvedDerivedBounds.y, 0),
  };

  const frameBounds = {
    x: currentLayerProps.x ?? 0,
    y: currentLayerProps.y ?? 0,
    width: currentLayerProps.width ?? localFrameBounds.width,
    height: currentLayerProps.height ?? localFrameBounds.height,
  };

  return {
    derivedBounds: resolvedDerivedBounds,
    localFrameBounds,
    frameBounds,
    frameCenter: {
      x: frameBounds.width / 2,
      y: frameBounds.height / 2,
    },
  };
};

interface BuildLayerShowBoundsRectParams {
  currentProps: LayerOptions;
  state: LayerBoundsState;
}

// Shared by layer() and place() (which is positionally identical to layer(),
// just placing a reusable component's render function instead of a raw
// callback) so the two never drift on how the debug show-bounds rect is
// derived from explicit vs. implicit dimensions.
export const buildLayerShowBoundsRect = ({
  currentProps,
  state,
}: BuildLayerShowBoundsRectParams): Bounds => {
  const hasExplicitWidth = currentProps.width !== undefined;
  const hasExplicitHeight = currentProps.height !== undefined;

  return {
    x: hasExplicitWidth ? 0 : state.localFrameBounds.x,
    y: hasExplicitHeight ? 0 : state.localFrameBounds.y,
    width: state.frameBounds.width,
    height: state.frameBounds.height,
  };
};

export const layer = (
  params: ContainerPrimitiveCommonParams,
): DrawPrimitives["layer"] =>
  createContainerPrimitive({
    containerType: "layer",
    frameSignatureType: "layer:frame",
    ...params,
    resolveState: ({ currentProps, derivedBounds, collectedBounds }) =>
      resolveLayerBoundsState({
        currentLayerProps: currentProps,
        derivedLayerBounds: derivedBounds,
        collectedBounds,
      }),
    buildScopeProps: ({ currentProps, state }) => ({
      ...currentProps,
      ...state.frameBounds,
      useLocalCoordinateContext: true,
    }),
    buildShowBoundsRect: buildLayerShowBoundsRect,
    pathDescriptor: layerPathDescriptor,
  }) as DrawPrimitives["layer"];
