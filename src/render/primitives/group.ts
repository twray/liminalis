import { createContainerPrimitive } from "../container";
import { IAnimatableLike } from "../../types";
import { rectPathDescriptor } from "./rect";

import type { ContainerPrimitiveCommonParams } from "../container";
import type { Bounds, DrawPrimitives, GroupOptions } from "../types";

export const groupPathDescriptor = rectPathDescriptor;

interface ResolveGroupBoundsStateParams {
  currentGroupProps: GroupOptions;
  mergedGroupProps: GroupOptions;
  derivedGroupBounds: Bounds;
  collectedBounds: Bounds | null;
  collectedUntransformedBounds: Bounds | null;
  animatable: IAnimatableLike<GroupOptions>;
}

interface GroupBoundsState {
  derivedBounds: Bounds;
  frameBounds: Bounds;
  frameCenter: { x: number; y: number };
  // How far content is shifted to reach its declared position. Measured
  // against the untransformed content box, so it does not move when a child
  // transforms.
  offset: { x: number; y: number };
  untransformedBounds: Bounds;
}

export const resolveGroupBoundsState = ({
  currentGroupProps,
  mergedGroupProps,
  derivedGroupBounds,
  collectedBounds,
  collectedUntransformedBounds,
  animatable,
}: ResolveGroupBoundsStateParams): GroupBoundsState => {
  const resolvedDerivedBounds = collectedBounds ?? derivedGroupBounds;

  // Content is PLACED by its untransformed bounding box, and the frame then
  // describes where the TRANSFORMED content landed. Keeping those two apart is
  // the fix: both used to come from resolvedDerivedBounds, so rotating or
  // scaling a child grew that box, changed the placement offset, and dragged
  // every sibling along with it -- a static marker drifted ~45px when a
  // neighbour rotated 45 degrees.
  //
  // An untransformed box does not move when a child transforms, so an offset
  // measured against it holds still.
  const positioningBounds =
    collectedUntransformedBounds ?? resolvedDerivedBounds;

  // What the caller asked for, if anything. Undeclared means "leave content
  // where it was authored", which is an offset of zero -- NOT a placement at
  // the derived position, which would reintroduce the dependency on the
  // content's own (transformed) bounds.
  const resolveDeclared = (axis: "x" | "y"): number | undefined => {
    if (mergedGroupProps[axis] !== undefined) {
      return mergedGroupProps[axis];
    }

    return animatable.hasSegmentTargeting(axis) &&
      currentGroupProps[axis] !== undefined
      ? currentGroupProps[axis]
      : undefined;
  };

  const declaredX = resolveDeclared("x");
  const declaredY = resolveDeclared("y");

  const offsetX = declaredX === undefined ? 0 : declaredX - positioningBounds.x;
  const offsetY = declaredY === undefined ? 0 : declaredY - positioningBounds.y;

  // Where the transformed content actually ends up once shifted. Used for
  // everything downstream -- the group's own transform pivot, its cached
  // surface, showBounds, and the bounds it reports to its parent -- so none of
  // those see a frame that disagrees with what is on screen.
  const frameBounds = {
    x: resolvedDerivedBounds.x + offsetX,
    y: resolvedDerivedBounds.y + offsetY,
    // Always derived: a group has no dimensions of its own to declare.
    width: resolvedDerivedBounds.width,
    height: resolvedDerivedBounds.height,
  };

  return {
    derivedBounds: resolvedDerivedBounds,
    frameBounds,
    frameCenter: {
      x: frameBounds.x + frameBounds.width / 2,
      y: frameBounds.y + frameBounds.height / 2,
    },
    offset: { x: offsetX, y: offsetY },
    // The placed-but-untransformed box, which is what an ancestor should
    // position against -- see ContainerBoundsState.untransformedBounds.
    untransformedBounds: {
      x: positioningBounds.x + offsetX,
      y: positioningBounds.y + offsetY,
      width: positioningBounds.width,
      height: positioningBounds.height,
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
    resolveState: ({
      currentProps,
      mergedProps,
      derivedBounds,
      collectedBounds,
      collectedUntransformedBounds,
      animatable,
    }) =>
      resolveGroupBoundsState({
        currentGroupProps: currentProps,
        mergedGroupProps: mergedProps,
        derivedGroupBounds: derivedBounds,
        collectedBounds,
        collectedUntransformedBounds,
        animatable,
      }),
    buildScopeProps: ({ currentProps, state }) => ({
      ...currentProps,
      ...state.frameBounds,
      groupOffsetX: state.offset.x,
      groupOffsetY: state.offset.y,
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
