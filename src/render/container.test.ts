import { describe, expect, it, vi } from "vitest";
import type {
  Bounds,
  ClosedPathDescriptor,
  FrameContext,
  GroupOptions,
} from "./types";

import ActiveMeasurementsManager from "./ActiveMeasurementsManager";
import AnimatableRegistry from "./AnimatableRegistry";
import BoundsCollectionManager from "./BoundsCollectionManager";
import ClipManager from "./ClipManager";
import DrawGroupManager from "./DrawGroupManager";
import FrameMeasurementPassManager from "./FrameMeasurementPassManager";
import {
  type ContainerPrimitiveCommonParams,
  createContainerPrimitive,
  hasExplicitDimensions,
  pushContainerShowBoundsOperation,
  withImplicitMeasurementPass,
} from "./container";

describe("hasExplicitDimensions", () => {
  it("returns true when both width and height are numbers", () => {
    expect(hasExplicitDimensions({ width: 10, height: 20 })).toBe(true);
  });

  it("returns false when width is missing", () => {
    expect(hasExplicitDimensions({ height: 20 })).toBe(false);
  });

  it("returns false when height is missing", () => {
    expect(hasExplicitDimensions({ width: 10 })).toBe(false);
  });

  it("returns false when neither is provided", () => {
    expect(hasExplicitDimensions({})).toBe(false);
  });
});

describe("withImplicitMeasurementPass", () => {
  it("runs the measurement pass when dimensions are not explicit", () => {
    const onMeasurePass = vi.fn();

    withImplicitMeasurementPass({ options: {}, onMeasurePass });

    expect(onMeasurePass).toHaveBeenCalledTimes(1);
  });

  it("skips the measurement pass when both dimensions are explicit", () => {
    const onMeasurePass = vi.fn();

    withImplicitMeasurementPass({
      options: { width: 10, height: 20 },
      onMeasurePass,
    });

    expect(onMeasurePass).not.toHaveBeenCalled();
  });
});

describe("pushContainerShowBoundsOperation", () => {
  const createMockContext = () => {
    const calls: string[] = [];
    const context = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => calls.push("beginPath"),
      rect: (x: number, y: number, w: number, h: number) =>
        calls.push(`rect:${x},${y},${w},${h}`),
      fill: () => calls.push("fill"),
      stroke: () => calls.push("stroke"),
      set fillStyle(value: string) {
        calls.push(`fillStyle:${value}`);
      },
      set strokeStyle(value: string) {
        calls.push(`strokeStyle:${value}`);
      },
      set lineWidth(value: number) {
        calls.push(`lineWidth:${value}`);
      },
    } as unknown as CanvasRenderingContext2D;

    return { context, calls };
  };

  it("does not push a draw operation when showBounds is not true", () => {
    const drawGroupManager = new DrawGroupManager();
    const pushSpy = vi.spyOn(drawGroupManager, "pushPrimitiveOperation");
    const clipManager = new ClipManager(createMockContext().context);

    pushContainerShowBoundsOperation({
      containerType: "group",
      showBounds: undefined,
      clipManager,
      drawGroupManager,
      getRenderRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    });

    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("draws a translucent red rect over the bounds when showBounds is true", () => {
    const { context, calls } = createMockContext();
    const clipManager = new ClipManager(context);
    const drawGroupManager = new DrawGroupManager();
    const bounds: Bounds = { x: 5, y: 10, width: 100, height: 50 };

    pushContainerShowBoundsOperation({
      containerType: "group",
      showBounds: true,
      clipManager,
      drawGroupManager,
      getRenderRect: () => bounds,
    });

    drawGroupManager.renderToContext({
      cache: { renderGroup: ({ draw }: any) => draw(context) } as any,
      targetContext: context,
      width: 800,
      height: 600,
    });

    expect(calls).toEqual([
      "save",
      "beginPath",
      "rect:5,10,100,50",
      "fillStyle:rgba(255, 0, 0, 0.12)",
      "strokeStyle:rgba(255, 0, 0, 0.7)",
      "lineWidth:1",
      "fill",
      "stroke",
      "restore",
    ]);
  });
});

describe("createContainerPrimitive", () => {
  interface TestState {
    derivedBounds: Bounds;
    frameBounds: Bounds;
    frameCenter: { x: number; y: number };
  }

  const rectPathDescriptor = (props: Bounds): ClosedPathDescriptor => ({
    bounds: props,
    isValid: props.width >= 0.5 && props.height >= 0.5,
    tracePath: () => {},
  });

  const createCollaborators = () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const registry = new AnimatableRegistry();
    registry.beginFrame(0);

    const clipManager = new ClipManager(context);
    const drawGroupManager = new DrawGroupManager();
    const boundsCollectionManager = new BoundsCollectionManager();
    const frameMeasurementPassManager = new FrameMeasurementPassManager();
    const activeMeasurementsManager = new ActiveMeasurementsManager();

    const commonParams: ContainerPrimitiveCommonParams = {
      registry,
      clipManager,
      drawGroupManager,
      boundsCollectionManager,
      activeMeasurementsManager,
      createMeasurementContext: (getMeasurements, hasMeasurements, warnOnUnavailableRead) =>
        frameMeasurementPassManager.createMeasurementContext(
          getMeasurements,
          hasMeasurements as any,
          warnOnUnavailableRead,
        ),
      withFrameBoundsMeasurementPass: (callbackFn) =>
        frameMeasurementPassManager.withFrameBoundsMeasurementPass(callbackFn),
      isMeasuringFrameBounds: () =>
        frameMeasurementPassManager.isMeasuringFrameBounds(),
    };

    return {
      context,
      registry,
      boundsCollectionManager,
      frameMeasurementPassManager,
      commonParams,
    };
  };

  const makeGroupPrimitive = (commonParams: ContainerPrimitiveCommonParams) =>
    createContainerPrimitive<
      GroupOptions,
      TestState,
      GroupOptions & { groupOffsetX: number; groupOffsetY: number }
    >({
      containerType: "group",
      frameSignatureType: "group:frame",
      ...commonParams,
      resolveState: ({ currentProps, derivedBounds, collectedBounds }) => {
        const resolvedDerivedBounds = collectedBounds ?? derivedBounds;
        const frameBounds = {
          x: currentProps.x ?? resolvedDerivedBounds.x,
          y: currentProps.y ?? resolvedDerivedBounds.y,
          width: currentProps.width ?? resolvedDerivedBounds.width,
          height: currentProps.height ?? resolvedDerivedBounds.height,
        };

        return {
          derivedBounds: resolvedDerivedBounds,
          frameBounds,
          frameCenter: {
            x: frameBounds.x + frameBounds.width / 2,
            y: frameBounds.y + frameBounds.height / 2,
          },
        };
      },
      buildScopeProps: ({ currentProps, state }) => ({
        ...currentProps,
        ...state.frameBounds,
        groupOffsetX: state.frameBounds.x - state.derivedBounds.x,
        groupOffsetY: state.frameBounds.y - state.derivedBounds.y,
      }),
      buildShowBoundsRect: ({ state }) => state.frameBounds,
      pathDescriptor: rectPathDescriptor,
    });

  it("invokes the frame callback synchronously during the implicit measurement pass when dimensions are unknown", () => {
    const { commonParams } = createCollaborators();
    const group = makeGroupPrimitive(commonParams);
    const measurementCalls: boolean[] = [];

    group((frameContext: FrameContext) => {
      measurementCalls.push(frameContext.hasMeasurements);
    });

    // Once during the implicit measurement pass (hasMeasurements: false),
    // once for the real render pass (hasMeasurements: true).
    expect(measurementCalls).toEqual([false, true]);
  });

  it("skips the implicit measurement pass when explicit dimensions are provided", () => {
    const { commonParams } = createCollaborators();
    const group = makeGroupPrimitive(commonParams);
    const measurementCalls: boolean[] = [];

    group(
      (frameContext) => {
        measurementCalls.push(frameContext.hasMeasurements);
      },
      { width: 100, height: 50 },
    );

    expect(measurementCalls).toEqual([true]);
  });

  it("collects child bounds into the container's own bounds collector", () => {
    const { commonParams, boundsCollectionManager } = createCollaborators();
    const group = makeGroupPrimitive(commonParams);
    let sawOwnCollectorDuringFrame = false;

    group(() => {
      const childBounds: Bounds = { x: 10, y: 20, width: 30, height: 40 };
      boundsCollectionManager.getActiveCollector()?.includeBounds(childBounds);
      sawOwnCollectorDuringFrame = boundsCollectionManager.getActiveCollector() !== undefined;
    });

    expect(sawOwnCollectorDuringFrame).toBe(true);
    // The collector is popped once the primitive finishes running.
    expect(boundsCollectionManager.getActiveCollector()).toBeUndefined();
  });

  it("derives its own bounds from collected child bounds when position/size are implicit", () => {
    const { commonParams, context } = createCollaborators();
    const rectCalls: number[][] = [];
    (context as any).rect = (x: number, y: number, w: number, h: number) =>
      rectCalls.push([x, y, w, h]);
    const group = makeGroupPrimitive(commonParams);

    group(
      () => {
        const childBounds: Bounds = { x: 10, y: 20, width: 30, height: 40 };
        commonParams.boundsCollectionManager
          .getActiveCollector()
          ?.includeBounds(childBounds);
      },
      { showBounds: true },
    );

    commonParams.drawGroupManager.renderToContext({
      cache: { renderGroup: ({ draw }: any) => draw(context) } as any,
      targetContext: context,
      width: 800,
      height: 600,
    });

    // buildShowBoundsRect returns state.frameBounds, which falls back to the
    // derived (collected) bounds since x/y/width/height were not provided.
    expect(rectCalls).toContainEqual([10, 20, 30, 40]);
  });

  it("reports its own resolved bounds to an ancestor's active collector", () => {
    const { commonParams, boundsCollectionManager } = createCollaborators();
    const outerGroup = makeGroupPrimitive(commonParams);
    const innerGroup = makeGroupPrimitive(commonParams);
    const ancestorCollector = {
      includeBounds: vi.fn(),
      getBounds: () => null,
    };

    // The outer group has no explicit position/size, so it must derive its
    // frame bounds from whatever its child (the inner group) reports into
    // *its own* collector.
    boundsCollectionManager.withCollector(ancestorCollector, () => {
      outerGroup(() => {
        innerGroup(() => {}, { x: 1, y: 2, width: 20, height: 20 });
      });
    });

    // The inner group's explicit bounds flow into the outer group's own
    // collector (not directly to the ancestor), and the outer group in turn
    // reports its own (derived) frame bounds to the ancestor collector.
    expect(ancestorCollector.includeBounds).toHaveBeenCalledTimes(1);
    expect(ancestorCollector.includeBounds).toHaveBeenCalledWith({
      x: 1,
      y: 2,
      width: 20,
      height: 20,
    });
  });

  it("pushes a show-bounds draw operation when showBounds is set", () => {
    const { commonParams, context } = createCollaborators();
    const drawGroupManager = commonParams.drawGroupManager;
    const pushSpy = vi.spyOn(drawGroupManager, "pushPrimitiveOperation");
    const group = makeGroupPrimitive(commonParams);

    group(() => {}, { x: 0, y: 0, width: 10, height: 10, showBounds: true });

    // One call for the clip-scoped frame group's primitive, one for show-bounds.
    const showBoundsCall = pushSpy.mock.calls.find((call) =>
      call[0].signature.includes("group:show-bounds"),
    );

    expect(showBoundsCall).toBeDefined();
  });

  it("does not push a show-bounds operation when showBounds is not set", () => {
    const { commonParams } = createCollaborators();
    const drawGroupManager = commonParams.drawGroupManager;
    const pushSpy = vi.spyOn(drawGroupManager, "pushPrimitiveOperation");
    const group = makeGroupPrimitive(commonParams);

    group(() => {}, { x: 0, y: 0, width: 10, height: 10 });

    const showBoundsCall = pushSpy.mock.calls.find((call) =>
      call[0].signature.includes("show-bounds"),
    );

    expect(showBoundsCall).toBeUndefined();
  });

  it("runs seedInitialProps and lets it override the props used for the render pass", () => {
    const { commonParams } = createCollaborators();
    const seedInitialProps = vi.fn(({ setCurrentProps, currentProps, animatable }) => {
      const seeded = { ...currentProps, x: 999 };
      setCurrentProps(seeded);
      animatable.updateInitialProps(seeded);
    });

    const group = createContainerPrimitive<
      GroupOptions,
      TestState,
      GroupOptions & { groupOffsetX: number; groupOffsetY: number }
    >({
      containerType: "group",
      frameSignatureType: "group:frame",
      ...commonParams,
      resolveState: ({ currentProps, derivedBounds }) => ({
        derivedBounds,
        frameBounds: {
          x: currentProps.x ?? 0,
          y: currentProps.y ?? 0,
          width: currentProps.width ?? 10,
          height: currentProps.height ?? 10,
        },
        frameCenter: { x: 0, y: 0 },
      }),
      buildScopeProps: ({ currentProps, state }) => ({
        ...currentProps,
        ...state.frameBounds,
        groupOffsetX: 0,
        groupOffsetY: 0,
      }),
      buildShowBoundsRect: ({ state }) => state.frameBounds,
      pathDescriptor: rectPathDescriptor,
      seedInitialProps,
    });

    const animatable = group(() => {}, { width: 10, height: 10 });

    expect(seedInitialProps).toHaveBeenCalledTimes(1);
    expect(animatable.currentProps).toEqual(
      expect.objectContaining({ x: 999 }),
    );
  });

  it("returns an animatable seeded with the merged options", () => {
    const { commonParams } = createCollaborators();
    const group = makeGroupPrimitive(commonParams);

    const animatable = group(() => {}, { x: 1, y: 2, width: 10, height: 10 });

    expect(animatable.currentProps).toEqual(
      expect.objectContaining({ x: 1, y: 2, width: 10, height: 10 }),
    );
  });

  it("regression: does not double-invoke a nested container when the ancestor is mid implicit-size measurement pass", () => {
    const { commonParams } = createCollaborators();
    const outerGroup = makeGroupPrimitive(commonParams);
    const innerGroup = makeGroupPrimitive(commonParams);
    const innerCallback = vi.fn();
    const withNestedGroupSpy = vi.spyOn(
      commonParams.drawGroupManager,
      "withNestedGroup",
    );

    // The outer group has no explicit dimensions, so it runs an implicit
    // measurement pass over its frameCallback before its real pass. Without
    // the isMeasuringFrameBounds guard, the inner group nested inside would
    // fully execute (registry.queue + draw-group push + invoking its own
    // callback) during *both* the outer's measurement pass and its real
    // pass, even though the inner group itself has explicit dimensions and
    // needs no measurement pass of its own.
    outerGroup(() => {
      innerGroup(innerCallback, { x: 0, y: 0, width: 10, height: 10 });
    });

    expect(innerCallback).toHaveBeenCalledTimes(1);
    // One nested group for the outer container's own wrapper, one for the
    // inner container's — not a third "phantom" one from the measuring pass.
    expect(withNestedGroupSpy).toHaveBeenCalledTimes(2);
  });
});
