import type { Dimensions2D } from "../types";
import type { IAnimatableLike } from "./Animatable";
import AnimatableRegistry from "./AnimatableRegistry";

import ClipManager from "./ClipManager";
import DrawGroupManager from "./DrawGroupManager";
import { createGroupScope } from "./clipping";
import { createBoundsCollector } from "./common";

import type {
  Bounds,
  BoundsCollector,
  ClipScope,
  ClippingOptionsProps,
  ClosedPathDescriptor,
  CoordinateContextProps,
  FrameCallback,
  FrameContext,
  GroupOptions,
  LayerOptions,
  MeasurementContext,
  Measurements,
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
  clipManager: ClipManager;
  drawGroupManager: DrawGroupManager;
  getClipScopesSignature: (scopes: ClipScope[]) => string;
  getRenderRect: () => Bounds;
}

export const pushContainerShowBoundsOperation = ({
  containerType,
  showBounds,
  clipManager,
  drawGroupManager,
  getClipScopesSignature,
  getRenderRect,
}: PushContainerShowBoundsOperationParams): void => {
  if (showBounds !== true) {
    return;
  }

  const clipScopes = clipManager.captureScopes();
  const scopeSignature = getClipScopesSignature(clipScopes);

  drawGroupManager.pushPrimitiveOperation({
    signature: DrawGroupManager.createPrimitiveSignature(
      `${containerType}:show-bounds`,
      {
        showBounds: true,
      },
      clipScopes.length,
      `scope-signature:${scopeSignature}`,
    ),
    render: (targetContext) => {
      const bounds = getRenderRect();

      const targetClipManager = new ClipManager(targetContext);
      targetClipManager.renderWithScopes(clipScopes, () => {
        targetContext.save();
        targetContext.beginPath();
        targetContext.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        targetContext.fillStyle = "rgba(255, 0, 0, 0.12)";
        targetContext.strokeStyle = "rgba(255, 0, 0, 0.7)";
        targetContext.lineWidth = 1;
        targetContext.fill();
        targetContext.stroke();
        targetContext.restore();
      });
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

interface CreateContainerPrimitiveParams<
  TOptions extends GroupOptions | LayerOptions,
  TState extends ContainerBoundsState,
  TScopeProps extends TransformProps &
    CoordinateContextProps &
    ClippingOptionsProps,
> {
  containerType: "group" | "layer";
  frameSignatureType: string;
  registry: AnimatableRegistry;
  clipManager: ClipManager;
  drawGroupManager: DrawGroupManager;
  getClipScopesSignature: (scopes: ClipScope[]) => string;
  getActiveBoundsCollector: () => BoundsCollector | undefined;
  createMeasurementContext: (
    getMeasurements: () => Measurements,
    hasMeasurements: boolean,
    warnOnUnavailableRead: boolean,
  ) => MeasurementContext;
  boundsCollectorStack: BoundsCollector[];
  withFrameBoundsMeasurementPass: <T>(callbackFn: () => T) => T;
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

export interface ContainerPrimitiveCommonParams {
  registry: AnimatableRegistry;
  clipManager: ClipManager;
  drawGroupManager: DrawGroupManager;
  getClipScopesSignature: (scopes: ClipScope[]) => string;
  getActiveBoundsCollector: () => BoundsCollector | undefined;
  createMeasurementContext: (
    getMeasurements: () => Measurements,
    hasMeasurements: boolean,
    warnOnUnavailableRead: boolean,
  ) => MeasurementContext;
  boundsCollectorStack: BoundsCollector[];
  withFrameBoundsMeasurementPass: <T>(callbackFn: () => T) => T;
}

export const createContainerPrimitive = <
  TOptions extends GroupOptions | LayerOptions,
  TState extends ContainerBoundsState,
  TScopeProps extends TransformProps &
    CoordinateContextProps &
    ClippingOptionsProps,
>({
  containerType,
  frameSignatureType,
  registry,
  clipManager,
  drawGroupManager,
  getClipScopesSignature,
  getActiveBoundsCollector,
  createMeasurementContext,
  boundsCollectorStack,
  withFrameBoundsMeasurementPass,
  resolveState,
  buildScopeProps,
  buildShowBoundsRect,
  pathDescriptor,
  seedInitialProps,
}: CreateContainerPrimitiveParams<TOptions, TState, TScopeProps>) => {
  return (
    frameCallback: FrameCallback | StaticFrameCallback,
    options: TOptions = {} as TOptions,
  ): IAnimatableLike<TOptions> => {
    const mergedProps = { ...options };
    const contentBoundsCollector = createBoundsCollector();

    let derivedBounds: Bounds = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    let currentProps: TOptions = mergedProps;
    const activeBoundsCollector = getActiveBoundsCollector();

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

    const createFrameContext = (hasMeasurements: boolean): FrameContext =>
      createMeasurementContext(
        () => {
          const { frameBounds, frameCenter } = resolveCurrentState();

          return {
            width: frameBounds.width,
            height: frameBounds.height,
            center: frameCenter,
          };
        },
        hasMeasurements,
        !hasMeasurements,
      ) as FrameContext;

    withImplicitMeasurementPass({
      options: mergedProps,
      onMeasurePass: () => {
        withFrameBoundsMeasurementPass(() => {
          boundsCollectorStack.push(contentBoundsCollector);

          try {
            (frameCallback as FrameCallback)(createFrameContext(false));
          } finally {
            boundsCollectorStack.pop();
          }
        });
      },
    });

    const renderShowBounds = (): void => {
      pushContainerShowBoundsOperation({
        containerType,
        showBounds: currentProps.showBounds,
        clipManager,
        drawGroupManager,
        getClipScopesSignature,
        getRenderRect: () => {
          const state = resolveCurrentState();

          return buildShowBoundsRect({
            currentProps,
            state,
          });
        },
      });
    };

    const containerAnimatable = registry.queue(mergedProps, (animatedProps) => {
      currentProps = animatedProps;
      activeBoundsCollector?.includeBounds(resolveFrameBounds());
    });

    const clipScope = createGroupScope(toScopeProps, pathDescriptor);

    clipManager.withScope(clipScope, () => {
      const currentScopes = clipManager.captureScopes();

      drawGroupManager.withNestedGroup(
        () => {
          const scopeSignature = getClipScopesSignature(currentScopes);

          return DrawGroupManager.createPrimitiveSignature(
            frameSignatureType,
            toScopeProps(),
            currentScopes.length,
            `scope-signature:${scopeSignature}`,
          );
        },
        () => {
          const frameContext = createFrameContext(true);

          boundsCollectorStack.push(contentBoundsCollector);

          try {
            (frameCallback as FrameCallback)(frameContext);
          } finally {
            boundsCollectorStack.pop();
          }

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
      );
    });

    return containerAnimatable;
  };
};
