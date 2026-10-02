import { createContainerPrimitive } from "../container";

import type { ContainerPrimitiveCommonParams } from "../container";
import { unionBounds } from "../common";
import type { Bounds, DrawPrimitives, LayerOptions } from "../types";
import { rectPathDescriptor } from "./rect";

export const layerPathDescriptor = rectPathDescriptor;

interface ResolveLayerBoundsStateParams {
  currentLayerProps: LayerOptions;
  derivedLayerBounds: Bounds;
  collectedBounds: Bounds | null;
  collectedPaintBounds: Bounds | null;
}

interface LayerBoundsState {
  derivedBounds: Bounds;
  localFrameBounds: Bounds;
  frameBounds: Bounds;
  frameCenter: { x: number; y: number };
  // Local-space extent that actually needs painting: the declared frame
  // union'd with any content overflowing it. Equal to {0, 0, frame width,
  // frame height} whenever content stays inside the frame, which is the
  // common case.
  paintLocalBounds: Bounds;
  paintParentBounds: Bounds;
}

export const resolveLayerBoundsState = ({
  currentLayerProps,
  derivedLayerBounds,
  collectedBounds,
  collectedPaintBounds,
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

  // The frame in LOCAL space -- descendants of a layer/place author relative
  // to the frame origin, so the frame itself starts at 0,0 for them.
  const localFrame = {
    x: 0,
    y: 0,
    width: frameBounds.width,
    height: frameBounds.height,
  };

  // Widened only outward, and only by content. Explicit dimensions still win
  // for frameBounds above (and therefore for getMeasurements and showBounds)
  // -- this is deliberately a separate value, because feeding an expanded size
  // back to descendants would let a rotated child grow the frame, which grows
  // the child, without end.
  // Unions the PAINT union, not the layout one: a descendant container has
  // already widened its own reported paint extent to cover ITS descendants, so
  // consuming that here is what carries overflow up an arbitrarily deep chain
  // rather than one level.
  const paintLocalBounds = collectedPaintBounds
    ? unionBounds(localFrame, collectedPaintBounds)
    : localFrame;

  return {
    derivedBounds: resolvedDerivedBounds,
    localFrameBounds,
    frameBounds,
    frameCenter: {
      x: frameBounds.width / 2,
      y: frameBounds.height / 2,
    },
    paintLocalBounds,
    // The same extent in the parent's space, for reporting upward. Descendants
    // of a layer author from the frame origin, so local maps to parent by
    // offsetting by it.
    paintParentBounds: {
      x: frameBounds.x + paintLocalBounds.x,
      y: frameBounds.y + paintLocalBounds.y,
      width: paintLocalBounds.width,
      height: paintLocalBounds.height,
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
// Draws the PAINTED extent rather than the declared frame, so the debug rect
// bounds what is actually on screen. With nothing overflowing these are the
// same rect, so the common case is unchanged.
export const buildLayerShowBoundsRect = ({
  state,
}: BuildLayerShowBoundsRectParams): Bounds => state.paintLocalBounds;

export const layer = (
  params: ContainerPrimitiveCommonParams,
): DrawPrimitives["layer"] =>
  createContainerPrimitive({
    containerType: "layer",
    frameSignatureType: "layer:frame",
    ...params,
    resolveState: ({
      currentProps,
      derivedBounds,
      collectedBounds,
      collectedPaintBounds,
    }) =>
      resolveLayerBoundsState({
        currentLayerProps: currentProps,
        derivedLayerBounds: derivedBounds,
        collectedBounds,
        collectedPaintBounds,
      }),
    buildScopeProps: ({ currentProps, state }) => ({
      ...currentProps,
      ...state.frameBounds,
      useLocalCoordinateContext: true,
      paintBounds: state.paintLocalBounds,
    }),
    buildShowBoundsRect: buildLayerShowBoundsRect,
    pathDescriptor: layerPathDescriptor,
  }) as DrawPrimitives["layer"];
