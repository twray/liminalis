import { afterEach, describe, expect, it, vi } from "vitest";

import RenderWarningManager from "./RenderWarningManager";

describe("RenderWarningManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("warnIfOverlayPrimitiveInsideIsometric", () => {
    it("does not warn when called outside an isometric render callback", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.warnIfOverlayPrimitiveInsideIsometric();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns when called inside an isometric render callback", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.withIsometricRenderCallback(() => {
        manager.warnIfOverlayPrimitiveInsideIsometric();
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("2D shape primitive");
    });

    it("warns only once per warning type across multiple calls", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.withIsometricRenderCallback(() => {
        manager.warnIfOverlayPrimitiveInsideIsometric();
        manager.warnIfOverlayPrimitiveInsideIsometric();
      });

      manager.withIsometricRenderCallback(() => {
        manager.warnIfOverlayPrimitiveInsideIsometric();
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("supports nested isometric render callbacks", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.withIsometricRenderCallback(() => {
        manager.withIsometricRenderCallback(() => {
          manager.warnIfOverlayPrimitiveInsideIsometric();
        });

        // Still inside the outer callback, depth remains > 0.
        manager.warnIfOverlayPrimitiveInsideIsometric();
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("decrements depth back to zero after the callback returns", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      manager.withIsometricRenderCallback(() => {});
      manager.warnIfOverlayPrimitiveInsideIsometric();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("decrements depth even when the callback throws", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = new Error("callback failed");

      expect(() => {
        manager.withIsometricRenderCallback(() => {
          throw error;
        });
      }).toThrow(error);

      manager.warnIfOverlayPrimitiveInsideIsometric();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("withIsometricRenderCallback", () => {
    it("returns the callback's result", () => {
      const manager = new RenderWarningManager();

      const result = manager.withIsometricRenderCallback(() => 42);

      expect(result).toBe(42);
    });
  });

  describe("beginFrame", () => {
    it("resets isometric callback depth so a new frame starts unwarned-clean of stale depth", () => {
      const manager = new RenderWarningManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Simulate a callback that never got to decrement (e.g. torn frame).
      manager.withIsometricRenderCallback(() => {
        manager.warnIfOverlayPrimitiveInsideIsometric();
      });

      manager.beginFrame();

      // Depth is reset to 0, so calling outside a callback should not warn again
      // (it already warned once, and the dedupe flag is unaffected by beginFrame).
      manager.warnIfOverlayPrimitiveInsideIsometric();

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
