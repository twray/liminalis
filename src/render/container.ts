import type { Dimensions2D, IAnimatableLike } from "../types";

import type ActiveMeasurementsManager from "./ActiveMeasurementsManager";
import BoundsCollectionManager from "./BoundsCollectionManager";
import DrawGroupManager from "./DrawGroupManager";
import { createGroupScope, withClipScopedGroup } from "./clipping";
import { createBoundsCollector, createNoopAnimatable } from "./common";

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
  StaticFrameCallback,
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

  drawGroupManager.pushPrimitiveOperation({
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
}

interface ResolveContainerStateParams<TOptions> {
  currentProps: TOptions;
  derivedBounds: Bounds;
  collectedBounds: Bounds | null;
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
  sceneWidth: number;
  sceneHeight: number;
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
  sceneWidth,
  sceneHeight,
}: CreateContainerPrimitiveParams<TOptions, TState, TScopeProps>) => {
  return (
    frameCallback: FrameCallback | StaticFrameCallback,
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

      const resolveCurrentState = (): TState => {
        const state = resolveState({
          currentProps,
          derivedBounds,
          collectedBounds: contentBoundsCollector.getBounds(),
        });

        derivedBounds = state.derivedBounds;

        return state;
      };

      const resolveFrameBounds = (): Bounds => {
        const { frameBounds } = resolveCurrentState();

        return frameBounds;
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
          sceneWidth,
          sceneHeight,
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
          options: mergedProps,
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
        activeBoundsCollector?.includeBounds(resolveFrameBounds());

        return createNoopAnimatable(mergedProps);
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

      const containerAnimatable = registry.queue(
        mergedProps,
        (animatedProps) => {
          currentProps = animatedProps;
          activeBoundsCollector?.includeBounds(resolveFrameBounds());
        },
      );

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

          activeBoundsCollector?.includeBounds(resolveFrameBounds());
        },
      });

      return containerAnimatable;
    });
};
