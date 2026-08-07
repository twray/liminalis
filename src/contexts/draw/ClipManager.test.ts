import { describe, expect, it, vi } from "vitest";
import type { ClipScope } from "./ClipManager";
import ClipManager from "./ClipManager";

describe("ClipManager", () => {
  const createMockContext = (): CanvasRenderingContext2D =>
    ({
      save: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

  describe("captureScopes", () => {
    it("returns a snapshot copy of currently active scopes", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const scopeA: ClipScope = { apply: vi.fn() };
      const scopeB: ClipScope = { apply: vi.fn() };

      let captured: ClipScope[] = [];

      manager.withScope(scopeA, () => {
        manager.withScope(scopeB, () => {
          captured = manager.captureScopes();
        });
      });

      expect(captured).toEqual([scopeA, scopeB]);

      captured.pop();
      expect(manager.captureScopes()).toEqual([]);
    });
  });

  describe("renderWithScopes", () => {
    it("renders directly when there are no scopes", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const render = vi.fn();

      manager.renderWithScopes([], render);

      expect(render).toHaveBeenCalledTimes(1);
      expect(context.save).not.toHaveBeenCalled();
      expect(context.restore).not.toHaveBeenCalled();
    });

    it("saves context, applies each scope in order, then restores", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const callOrder: string[] = [];
      const scopeA: ClipScope = {
        apply: vi.fn(() => {
          callOrder.push("scopeA");
        }),
      };
      const scopeB: ClipScope = {
        apply: vi.fn(() => {
          callOrder.push("scopeB");
        }),
      };
      const render = vi.fn(() => {
        callOrder.push("render");
      });

      manager.renderWithScopes([scopeA, scopeB], render);

      expect(context.save).toHaveBeenCalledTimes(1);
      expect(scopeA.apply).toHaveBeenCalledWith(context);
      expect(scopeB.apply).toHaveBeenCalledWith(context);
      expect(render).toHaveBeenCalledTimes(1);
      expect(context.restore).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["scopeA", "scopeB", "render"]);
    });
  });

  describe("withScope", () => {
    it("adds scope for frame execution and removes it afterward", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const scope: ClipScope = { apply: vi.fn() };

      expect(manager.captureScopes()).toEqual([]);

      manager.withScope(scope, () => {
        expect(manager.captureScopes()).toEqual([scope]);
      });

      expect(manager.captureScopes()).toEqual([]);
    });

    it("supports nested scopes", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const scopeA: ClipScope = { apply: vi.fn() };
      const scopeB: ClipScope = { apply: vi.fn() };

      manager.withScope(scopeA, () => {
        expect(manager.captureScopes()).toEqual([scopeA]);

        manager.withScope(scopeB, () => {
          expect(manager.captureScopes()).toEqual([scopeA, scopeB]);
        });

        expect(manager.captureScopes()).toEqual([scopeA]);
      });

      expect(manager.captureScopes()).toEqual([]);
    });

    it("always pops scope when frame throws", () => {
      const context = createMockContext();
      const manager = new ClipManager(context);
      const scope: ClipScope = { apply: vi.fn() };
      const error = new Error("frame failed");

      expect(() => {
        manager.withScope(scope, () => {
          throw error;
        });
      }).toThrow(error);

      expect(manager.captureScopes()).toEqual([]);
    });
  });
});