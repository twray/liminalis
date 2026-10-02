import type { Dimensions2D, IAnimatableLike } from "../types";

import type ActiveMeasurementsManager from "./ActiveMeasurementsManager";
import BoundsCollectionManager from "./BoundsCollectionManager";
import DrawGroupManager from "./DrawGroupManager";
import { createGroupScope, withClipScopedGroup } from "./clipping";
import {
  computeTransformedRectangularAABB,
  createBoundsCollector,
  createNoopAnimatable,
} from "./common";

import type {
  Bounds,
  ClosedPathDescriptor,
  CoordinateContextProps,
  DynamicMeasurementContext,
  FrameCallback,
  FrameContext,
  GroupOptions,
  LayerOptions,
  Measurements,
  RenderCollaborators,
  TransformProps,
} from "./types";

export const hasExplicitDimensions = (
  options: Partial<Dimensions2D>,
): options is Dimensions2D =>
  typeof options.width === "number" && typeof options.height === "number";

interface WithImplicitMeasurementPassParams {
  options: Partial<Dimensions2D>;
  onMeasurePass: () => void;
}

export const withImplicitMeasurementPass = ({
  options,
  onMeasurePass,
}: WithImplicitMeasurementPassParams): void => {
  if (hasExplicitDimensions(options)) {
    return;
  }

  onMeasurePass();
};

interface PushContainerShowBoundsOperationParams {
  containerType: "group" | "layer";
  showBounds: GroupOptions["showBounds"] | LayerOptions["showBounds"];
  drawGroupManager: DrawGroupManager;
  getRenderRect: () => Bounds;
}

export const pushContainerShowBoundsOperation = ({
  containerType,
  showBounds,
  drawGroupManager,
  getRenderRect,
}: PushContainerShowBoundsOperationParams): void => {
  if (showBounds !== true) {
    return;
  }

  drawGroupManager.pushOverlayOperation({
    signature: DrawGroupManager.createPrimitiveSignature(
      `${containerType}:show-bounds`,
      {
        showBounds: true,
      },
    ),
    render: (targetContext) => {
      const bounds = getRenderRect();

      targetContext.save();
      targetContext.beginPath();
      targetContext.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      targetContext.fillStyle = "rgba(255, 0, 0, 0.12)";
      targetContext.strokeStyle = "rgba(255, 0, 0, 0.7)";
      targetContext.lineWidth = 1;
      targetContext.fill();
      targetContext.stroke();
      targetContext.restore();
    },
  });
};

interface ContainerBoundsState {
  derivedBounds: Bounds;
  frameBounds: Bounds;
  frameCenter: { x: number; y: number };
  // This container's painted extent expressed in its PARENT's space, for
  // reporting upward. Optional: a container type that cannot overflow its own
  // frame has nothing extra to report and omits it.
  paintParentBounds?: Bounds;
  // This container's own position and size with its descendants' transforms
  // left out, for an ancestor that POSITIONS by bounding box. Reporting the
  // transformed frame here instead would reintroduce drift one level up: the
  // ancestor's placement offset would move whenever a grandchild rotated.
  untransformedBounds?: Bounds;
}

interface ResolveContainerStateParams<TOptions> {
  currentProps: TOptions;
  mergedProps: TOptions;
  derivedBounds: Bounds;
  collectedBounds: Bounds | null;
  // How far descendants actually paint, which a container unions into its own
  // paint extent so overflow reaches every ancestor's surface, not just the
  // nearest one. Distinct from collectedBounds -- see BoundsCollector.
  collectedPaintBounds: Bounds | null;
  // Children's bounds before their own transforms -- the stable reference a
  // container positions its content against. See BoundsCollector.
  collectedUntransformedBounds: Bounds | null;
  animatable: IAnimatableLike<TOptions>;
}

interface BuildContainerScopePropsParams<TOptions, TState> {
  currentProps: TOptions;
  state: TState;
}

interface BuildContainerShowBoundsRectParams<TOptions, TState> {
  currentProps: TOptions;
  state: TState;
}

interface SeedInitialContainerPropsParams<TOptions extends object, TState> {
  mergedProps: TOptions;
  currentProps: TOptions;
  setCurrentProps: (props: TOptions) => void;
  animatable: IAnimatableLike<TOptions>;
  state: TState;
  resolveFrameBounds: () => Bounds;
  resolveState: () => TState;
}

export interface ContainerPrimitiveCommonParams extends RenderCollaborators {
  createMeasurementContext: (
    getMeasurements: () => Measurements,
    hasMeasurements: boolean,
    warnOnUnavailableRead: boolean,
  ) => DynamicMeasurementContext;
  boundsCollectionManager: BoundsCollectionManager;
  withFrameBoundsMeasurementPass: <T>(callbackFn: () => T) => T;
  isMeasuringFrameBounds: () => boolean;
  activeMeasurementsManager: ActiveMeasurementsManager;
}

interface CreateContainerPrimitiveParams<
  TOptions extends GroupOptions | LayerOptions,
  TState extends ContainerBoundsState,
  TScopeProps extends TransformProps & CoordinateContextProps,
> extends ContainerPrimitiveCommonParams {
  containerType: "group" | "layer";
  frameSignatureType: string;
  resolveState: (params: ResolveContainerStateParams<TOptions>) => TState;
  buildScopeProps: (
    params: BuildContainerScopePropsParams<TOptions, TState>,
  ) => TScopeProps;
  buildShowBoundsRect: (
    params: BuildContainerShowBoundsRectParams<TOptions, TState>,
  ) => Bounds;
  pathDescriptor: (props: TScopeProps) => ClosedPathDescriptor;
  seedInitialProps?: (
    params: SeedInitialContainerPropsParams<TOptions, TState>,
  ) => void;
}

export const createContainerPrimitive = <
  TOptions extends GroupOptions | LayerOptions,
  TState extends ContainerBoundsState,
  TScopeProps extends TransformProps & CoordinateContextProps,
>({
  containerType,
  frameSignatureType,
  registry,
  drawGroupManager,
  createMeasurementContext,
  boundsCollectionManager,
  withFrameBoundsMeasurementPass,
  isMeasuringFrameBounds,
  activeMeasurementsManager,
  resolveState,
  buildScopeProps,
  buildShowBoundsRect,
  pathDescriptor,
  seedInitialProps,
}: CreateContainerPrimitiveParams<TOptions, TState, TScopeProps>) => {
  return (
    frameCallback: FrameCallback,
    options: TOptions = {} as TOptions,
  ): IAnimatableLike<TOptions> =>
    // Scopes this entire invocation — including the container's own
    // identity (registry.queue below) and everything its frameCallback
    // does — under one path segment. An explicit `key` pins that segment so
    // a container's identity (and its content's) survives reordering among
    // same-shaped siblings; omitted, it falls back to positional numbering
    // within the enclosing scope, matching call-order identity elsewhere.
    registry.withScope(options.key, (): IAnimatableLike<TOptions> => {
      const mergedProps = { ...options };
      const contentBoundsCollector = createBoundsCollector();

      let derivedBounds: Bounds = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };

      let currentProps: TOptions = mergedProps;
      const activeBoundsCollector =
        boundsCollectionManager.getActiveCollector();

      const containerAnimatable = isMeasuringFrameBounds()
        ? createNoopAnimatable(mergedProps)
        : registry.queue(
            mergedProps,
            (animatedProps) => {
              currentProps = animatedProps;
              reportBoundsUpward();
            },
            // No key here: withScope(options.key) above has already pinned
            // this container's identity, so the key must not be applied twice.
            { primitiveType: containerType },
          );

      const resolveCurrentState = (): TState => {
        const state = resolveState({
          currentProps,
          mergedProps,
          derivedBounds,
          collectedBounds: contentBoundsCollector.getBounds(),
          collectedPaintBounds: contentBoundsCollector.getPaintBounds(),
          collectedUntransformedBounds:
            contentBoundsCollector.getUntransformedBounds(),
          animatable: containerAnimatable,
        });

        derivedBounds = state.derivedBounds;

        return state;
      };

      const resolveFrameBounds = (): Bounds =>
        resolveCurrentState().frameBounds;

      const resolveReportedBounds = (): Bounds =>
        computeTransformedRectangularAABB(resolveFrameBounds(), currentProps);

      // What this container paints, in its PARENT's space, so an ancestor's
      // own paint extent can cover it. Falls back to the reported layout
      // bounds for a container type that does not compute an extent.
      const resolveReportedPaintBounds = (): Bounds => {
        const state = resolveCurrentState();

        if (!state.paintParentBounds) {
          return resolveReportedBounds();
        }

        return computeTransformedRectangularAABB(
          state.paintParentBounds,
          currentProps,
        );
      };

      const reportBoundsUpward = (): void => {
        activeBoundsCollector?.includeBounds(resolveReportedBounds());
        activeBoundsCollector?.includePaintBounds(resolveReportedPaintBounds());
        // A reference that holds still as descendants transform, so an
        // ancestor positioning by bounding box is not dragged around by them.
        activeBoundsCollector?.includeUntransformedBounds(
          resolveCurrentState().untransformedBounds ?? resolveFrameBounds(),
        );
      };

      const toScopeProps = () => {
        const state = resolveCurrentState();

        return buildScopeProps({
          currentProps,
          state,
        });
      };

      const getLocalMeasurements = (): Measurements => {
        const { frameBounds, frameCenter } = resolveCurrentState();

        return {
          width: frameBounds.width,
          height: frameBounds.height,
          center: frameCenter,
        };
      };

      const createFrameContext = (hasMeasurements: boolean): FrameContext =>
        createMeasurementContext(
          getLocalMeasurements,
          hasMeasurements,
          !hasMeasurements,
        ) as FrameContext;

      const runOwnImplicitMeasurementPass = (): void => {
        withImplicitMeasurementPass({
          // Cast because GroupOptions no longer declares width/height at all,
          // so it has no keys in common with Partial<Dimensions2D>. Reading
          // them off a group yields undefined, which is the right answer: a
          // group has no dimensions of its own to declare, so it always runs
          // this pass to derive its frame from its children.
          options: mergedProps as Partial<Dimensions2D>,
          onMeasurePass: () => {
            withFrameBoundsMeasurementPass(() => {
              boundsCollectionManager.withCollector(
                contentBoundsCollector,
                () => {
                  activeMeasurementsManager.withMeasurements(
                    getLocalMeasurements,
                    () => {
                      (frameCallback as FrameCallback)(
                        createFrameContext(false),
                      );
                    },
                  );
                },
              );
            });
          },
        });
      };

      // An ancestor container is currently running its own implicit-size
      // measurement pass, so this invocation exists only to report bounds
      // upward — it must not register an animatable or push draw content,
      // otherwise the real pass (once the ancestor re-invokes this same
      // callback for real) would duplicate both.
      if (isMeasuringFrameBounds()) {
        runOwnImplicitMeasurementPass();
        reportBoundsUpward();

        return containerAnimatable;
      }

      runOwnImplicitMeasurementPass();

      const renderShowBounds = (): void => {
        pushContainerShowBoundsOperation({
          containerType,
          showBounds: currentProps.showBounds,
          drawGroupManager,
          getRenderRect: () => {
            const state = resolveCurrentState();

            return buildShowBoundsRect({
              currentProps,
              state,
            });
          },
        });
      };

      const clipScope = createGroupScope(toScopeProps, pathDescriptor);

      withClipScopedGroup({
        drawGroupManager,
        clipScope,
        primitiveType: frameSignatureType,
        getSignatureProps: toScopeProps,
        run: () => {
          const frameContext = createFrameContext(true);

          activeMeasurementsManager.withMeasurements(
            getLocalMeasurements,
            () => {
              boundsCollectionManager.withCollector(
                contentBoundsCollector,
                () => {
                  (frameCallback as FrameCallback)(frameContext);
                },
              );
            },
          );

          if (seedInitialProps) {
            const state = resolveCurrentState();

            seedInitialProps({
              mergedProps,
              currentProps,
              setCurrentProps: (nextProps) => {
                currentProps = nextProps;
              },
              animatable: containerAnimatable,
              state,
              resolveFrameBounds,
              resolveState: resolveCurrentState,
            });
          }

          renderShowBounds();

          reportBoundsUpward();
        },
      });

      return containerAnimatable;
    });
};
