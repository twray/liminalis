import { createContainerPrimitive } from "../container";

import type { ContainerPrimitiveCommonParams } from "../container";
import type {
  DrawAPI,
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
  getAmbientDrawApi: () => DrawAPI,
): DrawPrimitives["component"] => {
  const placeContainer = createContainerPrimitive({
    containerType: "layer",
    frameSignatureType: "place:frame",
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
  });

  return (component: LayerComponent<any>, options: PlaceOptions = {}) =>
    placeContainer((frameContext: FrameContext) => {
      const ambientDrawApi = getAmbientDrawApi();

      // Both slices contribute to `util`, so it is merged member-wise; a
      // plain spread of the two would replace one's members with the other's.
      component.render({
        ...ambientDrawApi,
        util: { ...ambientDrawApi.util, ...frameContext.util },
      });
    }, options);
};
