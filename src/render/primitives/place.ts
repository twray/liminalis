import { createContainerPrimitive } from "../container";

import type { ContainerPrimitiveCommonParams } from "../container";
import type {
  DrawAPIBase,
  DrawPrimitives,
  FrameContext,
  LayerComponent,
  PlaceOptions,
} from "../types";
import {
  buildLayerShowBoundsRect,
  layerPathDescriptor,
  resolveLayerBoundsState,
} from "./layer";

// place() is positionally identical to layer() (same local-coordinate,
// implicit-sizing, clip/bounds semantics — reused verbatim from layer.ts),
// but instead of a user-supplied callback it renders a reusable
// LayerComponent (see createLayer()), injecting that frame's DrawAPI so
// the component's render function can call any primitive as if it were
// written inline — including place() itself, for recursive composition.
export const place = (
  params: ContainerPrimitiveCommonParams,
  getAmbientDrawApi: () => DrawAPIBase,
): DrawPrimitives["place"] => {
  const placeContainer = createContainerPrimitive({
    containerType: "layer",
    frameSignatureType: "place:frame",
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
  });

  return (component: LayerComponent<any>, options: PlaceOptions = {}) =>
    placeContainer((frameContext: FrameContext) => {
      component.render({ ...getAmbientDrawApi(), ...frameContext });
    }, options);
};
