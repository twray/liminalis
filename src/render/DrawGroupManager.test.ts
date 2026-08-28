import { describe, expect, it, vi } from "vitest";

import DrawGroupManager from "./DrawGroupManager";
import type { ClipScope } from "./types";

const createPassthroughCache = () => ({
  renderGroup: vi.fn(
    ({
      targetContext,
      draw,
    }: {
      targetContext: CanvasRenderingContext2D;
      draw: (context: CanvasRenderingContext2D) => void;
    }) => draw(targetContext),
  ),
});

// Used throughout for tests that only care about tree/stack mechanics, not
// scope application — a real ClipScope is only exercised by the dedicated
// scope-aware tests further down.
const noScope = null;

const createMockContext = () =>
  ({ save: vi.fn(), restore: vi.fn() }) as unknown as CanvasRenderingContext2D;

describe("DrawGroupManager", () => {
  describe("createPrimitiveSignature", () => {
    it("combines type and serialized props", () => {
      const signature = DrawGroupManager.createPrimitiveSignature("rect", {
        x: 1,
        y: 2,
      });

      expect(signature).toBe('rect|props:{"x":1.000000,"y":2.000000}');
    });

    it("appends an extra signature segment when provided", () => {
      const signature = DrawGroupManager.createPrimitiveSignature(
        "rect",
        {},
        "scope-signature:abc",
      );

      expect(signature).toBe("rect|props:{}|extra:scope-signature:abc");
    });

    it("omits the extra segment when it is an empty string", () => {
      const signature = DrawGroupManager.createPrimitiveSignature(
        "rect",
        {},
        "",
      );

      expect(signature).toBe("rect|props:{}");
    });
  });

  describe("pushPrimitiveOperation", () => {
    it("renders a pushed primitive when the root group is rendered", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const render = vi.fn();

      manager.pushPrimitiveOperation({ signature: "sig-a", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });
  });

  describe("withNestedGroup", () => {
    it("runs the callback synchronously", () => {
      const manager = new DrawGroupManager();
      const callback = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        callback,
      );

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("routes primitives pushed during the callback into the nested group, not the root", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const rootRender = vi.fn();
      const nestedRender = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "nested-sig" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "nested",
            render: nestedRender,
          });
        },
      );
      manager.pushPrimitiveOperation({ signature: "root", render: rootRender });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      // Both the nested group and the root group get their own renderGroup call.
      expect(cache.renderGroup).toHaveBeenCalledTimes(2);
      expect(nestedRender).toHaveBeenCalledTimes(1);
      expect(rootRender).toHaveBeenCalledTimes(1);
    });

    it("pops back to the parent group after the callback returns", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const render = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        () => {},
      );
      manager.pushPrimitiveOperation({ signature: "after-nested", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      // The root group should have both the empty nested group and this primitive.
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("pops back to the parent group even when the callback throws", () => {
      const manager = new DrawGroupManager();
      const error = new Error("boom");

      expect(() => {
        manager.withNestedGroup(
          { scope: noScope, getInvalidationSignature: () => "sig" },
          () => {
            throw error;
          },
        );
      }).toThrow(error);

      const cache = createPassthroughCache();
      const render = vi.fn();
      manager.pushPrimitiveOperation({ signature: "after-throw", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(render).toHaveBeenCalledTimes(1);
    });

    it("supports arbitrarily deep nesting, rendering innermost groups first via recursion", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const order: string[] = [];

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "outer" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "outer-primitive",
            render: () => order.push("outer-primitive"),
          });

          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "inner" },
            () => {
              manager.pushPrimitiveOperation({
                signature: "inner-primitive",
                render: () => order.push("inner-primitive"),
              });
            },
          );
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(order).toEqual(["outer-primitive", "inner-primitive"]);
    });
  });

  describe("renderToContext", () => {
    it("assigns sequential ids across the root and nested groups", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "a" },
        () => {
          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "b" },
            () => {},
          );
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      const groupIds = cache.renderGroup.mock.calls.map(
        (call) => call[0].groupId,
      );

      expect(groupIds).toEqual(["group-0", "group-1", "group-2"]);
    });

    it("includes the group's invalidation signature and its operations in the group signature", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.pushPrimitiveOperation({
        signature: "primitive-sig",
        render: vi.fn(),
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      const rootCall = cache.renderGroup.mock.calls[0]?.[0];

      expect(rootCall.signature).toBe(
        "id:group-0|invalidate:root|primitive:primitive-sig",
      );
    });

    it("passes the group's own child context down through recursive draw calls", () => {
      const manager = new DrawGroupManager();
      const outerContext = {} as CanvasRenderingContext2D;
      const innerContext = {} as CanvasRenderingContext2D;
      const nestedRender = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "nested",
            render: nestedRender,
          });
        },
      );

      const cache = {
        renderGroup: vi.fn(
          ({
            groupId,
            draw,
          }: {
            groupId: string;
            draw: (context: CanvasRenderingContext2D) => void;
          }) => {
            draw(groupId === "group-0" ? outerContext : innerContext);
          },
        ),
      };

      manager.renderToContext({
        cache: cache as any,
        targetContext: outerContext,
        width: 100,
        height: 100,
      });

      expect(nestedRender).toHaveBeenCalledWith(innerContext);
    });

    it("gives the root group full-canvas bounds and a null scope", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 800,
        height: 600,
      });

      const rootCall = cache.renderGroup.mock.calls[0]?.[0];

      expect(rootCall.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
      expect(rootCall.useLocalCoordinateContext).toBe(false);
      expect(rootCall.scope).toBeNull();
    });

    it("applies a nested group's own scope exactly once and passes its composite bounds through to the cache", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const scope: ClipScope = {
        apply: vi.fn(),
        getCompositeInfo: () => ({
          bounds: { x: 5, y: 10, width: 20, height: 30 },
          isValid: true,
          useLocalCoordinateContext: true,
        }),
      };

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "scoped" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "inner",
            render: vi.fn(),
          });
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: createMockContext(),
        width: 800,
        height: 600,
      });

      const nestedCall = cache.renderGroup.mock.calls.find(
        (call) => call[0].groupId === "group-1",
      )?.[0];

      expect(nestedCall.bounds).toEqual({ x: 5, y: 10, width: 20, height: 30 });
      expect(nestedCall.useLocalCoordinateContext).toBe(true);
      expect(nestedCall.scope).toBe(scope);
      expect(scope.apply).toHaveBeenCalledTimes(1);
    });

    it("bypasses the cache and runs a group's operations directly on the parent context when its scope reports invalid bounds", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const render = vi.fn();
      const scope: ClipScope = {
        apply: vi.fn(),
        getCompositeInfo: () => ({
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          isValid: false,
          useLocalCoordinateContext: false,
        }),
      };

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "invalid" },
        () => {
          manager.pushPrimitiveOperation({ signature: "inner", render });
        },
      );

      const targetContext = createMockContext();

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 800,
        height: 600,
      });

      // Only the root's own renderGroup call happens — the invalid-bounds
      // group never reaches the cache at all, matching how an invalid clip
      // scope's apply() already no-ops without transform/clip/offset, so
      // content still renders, unshifted, directly on the parent context.
      expect(cache.renderGroup).toHaveBeenCalledTimes(1);
      expect(scope.apply).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });

    it("bypasses the cache when a scope has no getCompositeInfo (e.g. a custom renderWithScope-style scope)", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const render = vi.fn();
      const scope: ClipScope = {};

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "no-composite-info" },
        () => {
          manager.pushPrimitiveOperation({ signature: "inner", render });
        },
      );

      const targetContext = createMockContext();

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 800,
        height: 600,
      });

      expect(cache.renderGroup).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });
  });

  describe("captureCurrentGroupHandle", () => {
    it("pushes into the group that was current when captured, not whatever is current when pushed", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const nestedRender = vi.fn();
      const rootRender = vi.fn();
      let nestedHandle: ReturnType<DrawGroupManager["captureCurrentGroupHandle"]>;

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "nested" },
        () => {
          // Captured *while* the nested group is current...
          nestedHandle = manager.captureCurrentGroupHandle();
        },
      );

      // ...but pushed through only after the nested scope has already
      // exited and the stack is back to root. This mirrors exactly how
      // AnimatableRegistry.flush() invokes pushPrimitiveOperation long after
      // every group()/layer()/place() has already popped off the stack.
      nestedHandle!.pushPrimitiveOperation({
        signature: "nested-primitive",
        render: nestedRender,
      });
      manager.pushPrimitiveOperation({
        signature: "root-primitive",
        render: rootRender,
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      // Both groups render, but only the nested group's draw should have
      // fired the operation captured for it.
      expect(cache.renderGroup).toHaveBeenCalledTimes(2);
      expect(nestedRender).toHaveBeenCalledTimes(1);
      expect(rootRender).toHaveBeenCalledTimes(1);
    });

    it("keeps working even if further nested groups open and close after capture", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const capturedRender = vi.fn();

      const handle = manager.captureCurrentGroupHandle();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "unrelated" },
        () => {
          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "deeper" },
            () => {},
          );
        },
      );

      handle.pushPrimitiveOperation({
        signature: "root-level-primitive",
        render: capturedRender,
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(capturedRender).toHaveBeenCalledTimes(1);
    });
  });
});
