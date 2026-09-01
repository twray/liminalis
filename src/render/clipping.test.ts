import { describe, expect, it, vi } from "vitest";
import type { ClosedPathDescriptor, TransformProps } from "./types";

import { stableSerialize } from "../util";
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

  describe("getCompositeInfo", () => {
    it("reports the descriptor's bounds and validity, and the local-coordinate-context flag", () => {
      const descriptor = validDescriptor();
      const scope = createClipScope(
        () => ({ useLocalCoordinateContext: true }),
        () => descriptor,
      );

      expect(scope.getCompositeInfo?.({} as CanvasRenderingContext2D)).toEqual({
        bounds: descriptor.bounds,
        isValid: true,
        useLocalCoordinateContext: true,
      });
    });

    it("reports isValid: false for an invalid descriptor", () => {
      const scope = createClipScope(
        () => ({}),
        () => invalidDescriptor,
      );

      expect(
        scope.getCompositeInfo?.({} as CanvasRenderingContext2D).isValid,
      ).toBe(false);
    });

    it("defaults useLocalCoordinateContext to false when unset", () => {
      const scope = createClipScope(
        () => ({}),
        () => validDescriptor(),
      );

      expect(
        scope.getCompositeInfo?.({} as CanvasRenderingContext2D)
          .useLocalCoordinateContext,
      ).toBe(false);
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

  describe("getCompositeInfo", () => {
    it("reports the descriptor's bounds, validity, and local-coordinate-context flag", () => {
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({ useLocalCoordinateContext: true }),
        () => descriptor,
      );

      expect(scope.getCompositeInfo?.({} as CanvasRenderingContext2D)).toEqual({
        bounds: descriptor.bounds,
        isValid: true,
        useLocalCoordinateContext: true,
      });
    });

    it("reports isValid: false for an invalid descriptor", () => {
      const scope = createGroupScope(
        () => ({}),
        () => invalidDescriptor,
      );

      expect(
        scope.getCompositeInfo?.({} as CanvasRenderingContext2D).isValid,
      ).toBe(false);
    });
  });

  describe("apply", () => {
    // group()/layer()/place() never mask content to their frame's path --
    // per the current design decision (spec/reactive-layer-plan.md, Step 7),
    // any visual cropping for these container-like primitives comes only as
    // a side effect of bitmap-cache surface sizing (DrawGroupBitmapCache),
    // not from an explicit clip here. There is no caller-facing option to
    // turn this on -- unlike createClipScope, used by the shape-as-frame
    // primitives above, which always clips.
    it("never clips content, even when the descriptor is valid", () => {
      const { context, callOrder } = createMockContext();
      const descriptor = validDescriptor();
      const scope = createGroupScope(
        () => ({}),
        () => descriptor,
      );

      scope.apply?.(context);

      expect(callOrder).toEqual([]);
    });

    it("is a no-op when the descriptor is invalid", () => {
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
  it("runs the callback with the nested group current, and threads the clip scope onto it", () => {
    const { context, callOrder } = createMockContext();
    const drawGroupManager = new DrawGroupManager();
    const clipScope = createClipScope(
      () => ({}),
      () => validDescriptor(),
    );
    const run = vi.fn(() => {
      // A primitive pushed during run() must land in the *nested* group, not
      // root — proven below by it firing only once the nested group's own
      // scope has been applied.
      drawGroupManager.pushPrimitiveOperation({
        signature: "inner-primitive",
        render: () => callOrder.push("inner-primitive-render"),
      });
    });

    withClipScopedGroup({
      drawGroupManager,
      clipScope,
      primitiveType: "group:frame",
      getSignatureProps: () => ({ x: 1 }),
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);

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

    // The nested group's own scope (clip trace) applied exactly once,
    // before its content rendered — never replayed per leaf.
    expect(callOrder).toEqual([
      "save",
      "beginPath",
      "rect:10,20,100,50",
      "clip",
      "inner-primitive-render",
      "restore",
    ]);
  });

  it("pushes a primitive operation nested inside a new draw group", () => {
    const context = createMockContext().context;
    const drawGroupManager = new DrawGroupManager();
    const clipScope = createClipScope(
      () => ({}),
      () => validDescriptor(),
    );
    const render = vi.fn();

    withClipScopedGroup({
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
