import { describe, expect, it, vi } from "vitest";
import type { ClosedPathDescriptor, TransformProps } from "./types";

import { stableSerialize } from "../util";
import ClipManager from "./ClipManager";
import DrawGroupManager from "./DrawGroupManager";
import { createClipScope, createGroupScope, withClipScopedGroup } from "./clipping";

const createMockContext = () => {
  const callOrder: string[] = [];

  const context = {
    save: () => callOrder.push("save"),
    restore: () => callOrder.push("restore"),
    translate: (x: number, y: number) => callOrder.push(`translate:${x},${y}`),
    scale: (x: number, y: number) => callOrder.push(`scale:${x},${y}`),
    rotate: (radians: number) => callOrder.push(`rotate:${radians}`),
    beginPath: () => callOrder.push("beginPath"),
    rect: (x: number, y: number, w: number, h: number) =>
      callOrder.push(`rect:${x},${y},${w},${h}`),
    clip: () => callOrder.push("clip"),
  } as unknown as CanvasRenderingContext2D;

  return { context, callOrder };
};

const validDescriptor = (
  bounds: ClosedPathDescriptor["bounds"] = { x: 10, y: 20, width: 100, height: 50 },
): ClosedPathDescriptor => ({
  bounds,
  isValid: true,
  tracePath: (context) => {
    (context as unknown as { rect: (...args: number[]) => void }).rect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );
  },
});

const invalidDescriptor: ClosedPathDescriptor = {
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  isValid: false,
  tracePath: vi.fn(),
};

describe("createClipScope", () => {
  describe("getSignature", () => {
    it("includes the primitive type, props, bounds, and validity", () => {
      const props = { x: 1 };
      const descriptor = validDescriptor();
      const scope = createClipScope(
        () => props,
        () => descriptor,
      );

      expect(scope.getSignature?.()).toBe(
        `clip|props:${stableSerialize(props)}|bounds:${stableSerialize(descriptor.bounds)}|valid:1`,
      );
    });

    it("reflects an invalid descriptor", () => {
      const scope = createClipScope(
        () => ({}),
        () => invalidDescriptor,
      );

      expect(scope.getSignature?.()).toContain("valid:0");
    });
  });

  describe("apply", () => {
    it("clips to an empty region when the descriptor is invalid", () => {
      const { context, callOrder } = createMockContext();
      const scope = createClipScope(
        () => ({}),
        () => invalidDescriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual(["beginPath", "rect:0,0,0,0", "clip"]);
    });

    it("traces the path and clips when the descriptor is valid", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createClipScope(
        () => ({}),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([
        "beginPath",
        "rect:10,20,100,50",
        "clip",
      ]);
    });

    it("applies scale and rotate around the descriptor bounds before tracing, then undoes it", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const props: TransformProps = { scale: 2, rotate: 90 };
      const scope = createClipScope(
        () => props,
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([
        "translate:60,45",
        "scale:2,2",
        "translate:-60,-45",
        "translate:60,45",
        `rotate:${Math.PI / 2}`,
        "translate:-60,-45",
        "beginPath",
        "rect:10,20,100,50",
        "clip",
        "translate:60,45",
        `rotate:${-Math.PI / 2}`,
        "translate:-60,-45",
        "translate:60,45",
        "scale:0.5,0.5",
        "translate:-60,-45",
      ]);
    });

    it("translates to the descriptor's origin when useLocalCoordinateContext is set", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createClipScope(
        () => ({ useLocalCoordinateContext: true }),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([
        "beginPath",
        "rect:10,20,100,50",
        "clip",
        "translate:10,20",
      ]);
    });
  });
});

describe("createGroupScope", () => {
  describe("getSignature", () => {
    it("is prefixed with 'group' rather than 'clip'", () => {
      const scope = createGroupScope(
        () => ({}),
        () => validDescriptor(),
      );

      expect(scope.getSignature?.()).toMatch(/^group\|/);
    });
  });

  describe("apply", () => {
    it("does not clip content by default even when the descriptor is valid", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({}),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([]);
    });

    it("clips content when clipContent is true", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({ clipContent: true }),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual(["beginPath", "rect:10,20,100,50", "clip"]);
    });

    it("clips to an empty region when invalid and clipContent is true", () => {
      const { context, callOrder } = createMockContext();
      const scope = createGroupScope(
        () => ({ clipContent: true }),
        () => invalidDescriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual(["beginPath", "rect:0,0,0,0", "clip"]);
    });

    it("is a no-op when invalid and clipContent is not set", () => {
      const { context, callOrder } = createMockContext();
      const scope = createGroupScope(
        () => ({}),
        () => invalidDescriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([]);
    });

    it("translates by the group offset props", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({ groupOffsetX: 5, groupOffsetY: 7 }),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual(["translate:5,7"]);
    });

    it("translates to bounds origin when useLocalCoordinateContext is set, after the group offset", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({
          groupOffsetX: 5,
          groupOffsetY: 7,
          useLocalCoordinateContext: true,
        }),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual(["translate:5,7", "translate:10,20"]);
    });
  });
});

describe("withClipScopedGroup", () => {
  it("opens the clip scope, then a nested group keyed by the scope signature, then runs the callback", () => {
    const context = createMockContext().context;
    const clipManager = new ClipManager(context);
    const drawGroupManager = new DrawGroupManager();
    const clipScope = createClipScope(
      () => ({}),
      () => validDescriptor(),
    );
    const run = vi.fn(() => {
      // While run() executes, the scope should be active on the clip manager.
      expect(clipManager.captureScopes()).toEqual([clipScope]);
    });

    withClipScopedGroup({
      clipManager,
      drawGroupManager,
      clipScope,
      primitiveType: "group:frame",
      getSignatureProps: () => ({ x: 1 }),
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(clipManager.captureScopes()).toEqual([]);
  });

  it("pushes a primitive operation nested inside a new draw group", () => {
    const context = createMockContext().context;
    const clipManager = new ClipManager(context);
    const drawGroupManager = new DrawGroupManager();
    const clipScope = createClipScope(
      () => ({}),
      () => validDescriptor(),
    );
    const render = vi.fn();

    withClipScopedGroup({
      clipManager,
      drawGroupManager,
      clipScope,
      primitiveType: "group:frame",
      getSignatureProps: () => ({ x: 1 }),
      run: () => {
        drawGroupManager.pushPrimitiveOperation({
          signature: "inner-primitive",
          render,
        });
      },
    });

    const cache = {
      renderGroup: ({ draw }: { draw: (ctx: CanvasRenderingContext2D) => void }) =>
        draw(context),
    };

    drawGroupManager.renderToContext({
      cache: cache as any,
      targetContext: context,
      width: 100,
      height: 100,
    });

    expect(render).toHaveBeenCalledTimes(1);
  });
});
