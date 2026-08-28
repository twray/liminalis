import { describe, expect, it, vi } from "vitest";
import AnimatableRegistry from "./AnimatableRegistry";

describe("AnimatableRegistry", () => {
  describe("getOrCreate", () => {
    it("creates a new Animatable when none exists", () => {
      const registry = new AnimatableRegistry();
      registry.beginFrame(0);

      const anim = registry.getOrCreate({ x: 0, y: 0 }, 0);

      expect(anim).toBeDefined();
      expect(anim.getCurrentProps(0)).toEqual({ x: 0, y: 0 });
      expect(registry.size).toBe(1);
    });

    it("returns the same Animatable on subsequent frames", () => {
      const registry = new AnimatableRegistry();

      // Frame 1
      registry.beginFrame(0);
      const anim1 = registry.getOrCreate({ x: 0 }, 0);
      anim1.animateTo({ x: 100 }, { duration: 1000 });
      registry.endFrame();

      // Frame 2
      registry.beginFrame(500);
      const anim2 = registry.getOrCreate({ x: 0 }, 500);
      anim2.animateTo({ x: 100 }, { duration: 1000 });
      registry.endFrame();

      // Should be the same instance
      expect(anim2).toBe(anim1);
    });

    it("continues animation from captured snapshot", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: start animation at t=0, going from 0 to 100 over 1000ms
      registry.beginFrame(0);
      const anim = registry.getOrCreate({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { at: 0, duration: 1000 });
      expect(anim.getCurrentProps(0).x).toBe(0);
      registry.endFrame();

      // Frame 2: same animation definition at t=500
      // Snapshot should not rebase a segment that started at t=0.
      // The animation should remain on its original timeline.
      registry.beginFrame(500);
      const anim2 = registry.getOrCreate({ x: 0 }, 500);
      anim2.animateTo({ x: 100 }, { at: 0, duration: 1000 });
      // At t=500, progress is exactly 50%
      expect(anim2.getCurrentProps(500).x).toBe(50);
      registry.endFrame();

      // Frame 3: at t=1000, animation complete (target is 100)
      registry.beginFrame(1000);
      const anim3 = registry.getOrCreate({ x: 0 }, 1000);
      anim3.animateTo({ x: 100 }, { at: 0, duration: 1000 });
      expect(anim3.getCurrentProps(1000).x).toBe(100);
      registry.endFrame();
    });

    it("clears segments on each frame for fresh definition", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: define animation
      registry.beginFrame(0);
      const anim = registry.getOrCreate({ x: 0 }, 0);
      anim.animateTo({ x: 100 }, { duration: 1000 });
      registry.endFrame();

      // Frame 2: segments should be cleared, define new animation
      registry.beginFrame(0);
      const anim2 = registry.getOrCreate({ x: 0 }, 0);
      // No animateTo called - should return initial props
      expect(anim2.getCurrentProps(500).x).toBe(0);
      registry.endFrame();
    });

    it("assigns stable IDs based on call order", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: create two animatables
      registry.beginFrame(0);
      const animA1 = registry.getOrCreate({ label: "A" }, 0);
      const animB1 = registry.getOrCreate({ label: "B" }, 0);
      registry.endFrame();

      // Frame 2: same order should return same instances
      registry.beginFrame(100);
      const animA2 = registry.getOrCreate({ label: "A" }, 100);
      const animB2 = registry.getOrCreate({ label: "B" }, 100);
      registry.endFrame();

      expect(animA2).toBe(animA1);
      expect(animB2).toBe(animB1);
    });

    it("captures current props for smooth transitions", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: start attack animation
      registry.beginFrame(0);
      const anim = registry.getOrCreate({ radius: 0 }, 0);
      anim.animateTo({ radius: 100 }, { at: 0, duration: 1000 });
      expect(anim.getCurrentProps(500).radius).toBe(50);
      registry.endFrame();

      // Frame 2: mid-animation, trigger release
      // The captured value (50) should be available as snapshot
      registry.beginFrame(500);
      const anim2 = registry.getOrCreate({ radius: 0 }, 500);
      anim2
        .animateTo({ radius: 100 }, { at: 0, duration: 1000 })
        .animateTo({ radius: 0 }, { at: 500, duration: 500 });

      // At t=500, release starts from captured value (50)
      expect(anim2.getCurrentProps(500).radius).toBe(50);
      // At t=750, halfway through release: 50 -> 0, so 25
      expect(anim2.getCurrentProps(750).radius).toBe(25);
      registry.endFrame();
    });
  });

  describe("beginFrame", () => {
    it("resets call index", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: create animatable at index 0
      registry.beginFrame(0);
      const anim1 = registry.getOrCreate({ x: 0 }, 0);
      registry.endFrame();

      // Frame 2: should get same animatable (index reset to 0)
      registry.beginFrame(0);
      const anim2 = registry.getOrCreate({ x: 0 }, 0);
      registry.endFrame();

      expect(anim2).toBe(anim1);
    });

    it("clears pending renders from previous frame", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      registry.queue({ x: 0 }, renderFn);
      expect(registry.pendingCount).toBe(1);

      // Don't flush, start new frame
      registry.beginFrame(100);
      expect(registry.pendingCount).toBe(0);
    });
  });

  describe("endFrame", () => {
    it("removes animatables not seen this frame", () => {
      const registry = new AnimatableRegistry();

      // Frame 1: create two animatables
      registry.beginFrame(0);
      registry.getOrCreate({ label: "A" }, 0);
      registry.getOrCreate({ label: "B" }, 0);
      registry.endFrame();

      expect(registry.size).toBe(2);

      // Frame 2: only access the first one
      registry.beginFrame(100);
      registry.getOrCreate({ label: "A" }, 100);
      registry.endFrame();

      // Second animatable should be removed
      expect(registry.size).toBe(1);
    });

    it("preserves animatables seen this frame", () => {
      const registry = new AnimatableRegistry();

      // Frame 1
      registry.beginFrame(0);
      const anim = registry.getOrCreate({ x: 0 }, 0);
      registry.endFrame();

      // Frame 2
      registry.beginFrame(100);
      registry.getOrCreate({ x: 0 }, 100);
      registry.endFrame();

      expect(registry.size).toBe(1);

      // Frame 3
      registry.beginFrame(200);
      const anim3 = registry.getOrCreate({ x: 0 }, 200);
      registry.endFrame();

      expect(anim3).toBe(anim);
    });

    it("handles conditional rendering", () => {
      const registry = new AnimatableRegistry();
      let showCircle = true;

      // Frame 1: both shapes
      registry.beginFrame(0);
      registry.getOrCreate({ type: "rect" }, 0);
      if (showCircle) {
        registry.getOrCreate({ type: "circle" }, 0);
      }
      registry.endFrame();

      expect(registry.size).toBe(2);

      // Frame 2: circle is hidden
      showCircle = false;
      registry.beginFrame(100);
      registry.getOrCreate({ type: "rect" }, 100);
      if (showCircle) {
        registry.getOrCreate({ type: "circle" }, 100);
      }
      registry.endFrame();

      // Circle should be removed
      expect(registry.size).toBe(1);

      // Frame 3: circle is shown again (new instance)
      showCircle = true;
      registry.beginFrame(200);
      registry.getOrCreate({ type: "rect" }, 200);
      if (showCircle) {
        registry.getOrCreate({ type: "circle" }, 200);
      }
      registry.endFrame();

      expect(registry.size).toBe(2);
    });
  });

  describe("queue", () => {
    it("queues animatable for deferred rendering", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      const anim = registry.queue({ x: 0, extra: "style" }, renderFn);

      expect(anim).toBeDefined();
      expect(registry.pendingCount).toBe(1);
      expect(renderFn).not.toHaveBeenCalled();
    });

    it("returns same animatable across frames", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      const anim1 = registry.queue({ x: 0 }, renderFn);
      registry.flush();
      registry.endFrame();

      registry.beginFrame(100);
      const anim2 = registry.queue({ x: 0 }, renderFn);
      registry.flush();
      registry.endFrame();

      expect(anim2).toBe(anim1);
    });

    it("uses frame time from beginFrame for flush", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      // Create at t=0, so animation starts at relative time 0
      registry.beginFrame(0);
      const anim = registry.queue({ x: 0 }, renderFn);
      anim.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();
      registry.endFrame();

      // At t=0, animation at start
      expect(renderFn).toHaveBeenCalledWith({ x: 0 });

      // Frame 2 at t=500
      // At t=500 the animation should be halfway to 100.
      renderFn.mockClear();
      registry.beginFrame(500);
      const anim2 = registry.queue({ x: 0 }, renderFn);
      anim2.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();

      expect(renderFn).toHaveBeenCalledWith({ x: 50 });
    });
  });

  describe("flush", () => {
    it("calls render functions with animated props", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      const anim = registry.queue({ x: 0 }, renderFn);
      anim.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();

      expect(renderFn).toHaveBeenCalledWith({ x: 0 });
    });

    it("includes style props in animated output", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      // Create at t=0 so animation starts
      registry.beginFrame(0);
      const anim = registry.queue(
        { x: 0, fillStyle: "red", strokeStyle: "blue" },
        renderFn,
      );
      anim.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();
      registry.endFrame();

      // Frame 2 at t=500
      // At t=500, x should be halfway to 100.
      renderFn.mockClear();
      registry.beginFrame(500);
      const anim2 = registry.queue(
        { x: 0, fillStyle: "red", strokeStyle: "blue" },
        renderFn,
      );
      anim2.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();

      expect(renderFn).toHaveBeenCalledWith({
        x: 50,
        fillStyle: "red",
        strokeStyle: "blue",
      });
    });

    it("renders in order of queuing", () => {
      const registry = new AnimatableRegistry();
      const order: string[] = [];

      registry.beginFrame(0);
      registry.queue({ id: "first" }, () => order.push("first"));
      registry.queue({ id: "second" }, () => order.push("second"));
      registry.queue({ id: "third" }, () => order.push("third"));
      registry.flush();

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("inserts nested queue calls immediately after current render during flush", () => {
      const registry = new AnimatableRegistry();
      const order: string[] = [];

      registry.beginFrame(0);

      registry.queue({ id: "isometric" }, () => {
        order.push("isometric");
        registry.queue({ id: "overlay-rect" }, () =>
          order.push("overlay-rect"),
        );
      });

      registry.queue({ id: "group" }, () => order.push("group"));
      registry.queue({ id: "layer" }, () => order.push("layer"));

      registry.flush();

      expect(order).toEqual(["isometric", "overlay-rect", "group", "layer"]);
    });

    it("preserves nested queue order when multiple renders are queued during flush", () => {
      const registry = new AnimatableRegistry();
      const order: string[] = [];

      registry.beginFrame(0);

      registry.queue({ id: "root" }, () => {
        order.push("root");
        registry.queue({ id: "first-nested" }, () =>
          order.push("first-nested"),
        );
        registry.queue({ id: "second-nested" }, () =>
          order.push("second-nested"),
        );
      });

      registry.queue({ id: "tail" }, () => order.push("tail"));

      registry.flush();

      expect(order).toEqual(["root", "first-nested", "second-nested", "tail"]);
    });

    it("clears pending queue after flush", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      registry.queue({ x: 0 }, renderFn);
      expect(registry.pendingCount).toBe(1);

      registry.flush();
      expect(registry.pendingCount).toBe(0);
      expect(renderFn).toHaveBeenCalledTimes(1);

      // Second flush should not call render again
      registry.flush();
      expect(renderFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("pendingCount", () => {
    it("returns number of queued renders", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      expect(registry.pendingCount).toBe(0);

      registry.queue({ a: 1 }, renderFn);
      expect(registry.pendingCount).toBe(1);

      registry.queue({ b: 2 }, renderFn);
      expect(registry.pendingCount).toBe(2);

      registry.queue({ c: 3 }, renderFn);
      expect(registry.pendingCount).toBe(3);
    });
  });

  describe("clear", () => {
    it("removes all animatables", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      registry.getOrCreate({ x: 0 }, 0);
      registry.getOrCreate({ y: 0 }, 0);
      registry.endFrame();

      expect(registry.size).toBe(2);

      registry.clear();

      expect(registry.size).toBe(0);
    });

    it("resets call index", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      const anim1 = registry.getOrCreate({ x: 0 }, 0);
      registry.endFrame();

      registry.clear();

      // After clear, new animatable at same position should be different instance
      registry.beginFrame(0);
      const anim2 = registry.getOrCreate({ x: 0 }, 0);
      registry.endFrame();

      expect(anim2).not.toBe(anim1);
    });

    it("clears pending renders", () => {
      const registry = new AnimatableRegistry();
      const renderFn = vi.fn();

      registry.beginFrame(0);
      registry.queue({ x: 0 }, renderFn);
      expect(registry.pendingCount).toBe(1);

      registry.clear();
      expect(registry.pendingCount).toBe(0);
    });
  });

  describe("size", () => {
    it("returns the number of registered animatables", () => {
      const registry = new AnimatableRegistry();

      expect(registry.size).toBe(0);

      registry.beginFrame(0);
      registry.getOrCreate({ x: 0 }, 0);
      expect(registry.size).toBe(1);

      registry.getOrCreate({ y: 0 }, 0);
      expect(registry.size).toBe(2);

      registry.getOrCreate({ z: 0 }, 0);
      expect(registry.size).toBe(3);
      registry.endFrame();
    });
  });

  describe("withScope", () => {
    it("gives content inside a scope a different identity than the same call pattern at the root", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      const rootAnim = registry.getOrCreate({ x: 0 }, 0);
      const scopedAnim = registry.withScope(undefined, () =>
        registry.getOrCreate({ x: 0 }, 0),
      );

      expect(scopedAnim).not.toBe(rootAnim);
    });

    it("keeps identity inside a scope stable when a sibling is added after it", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      registry.getOrCreate({ label: "before" }, 0);
      const scopedAnimFrame1 = registry.withScope(undefined, () =>
        registry.getOrCreate({ label: "inside" }, 0),
      );
      registry.endFrame();

      // Frame 2: an extra sibling is appended after the scope. Because the
      // scope-opening call's own position among its parent's siblings is
      // unchanged (still the second call at the root), everything inside it
      // keeps its identity — only a shift *before* the scope's own call
      // would perturb it (that fragility is inherent to unkeyed positional
      // scopes and is exactly what an explicit key opts out of).
      registry.beginFrame(100);
      registry.getOrCreate({ label: "before" }, 100);
      const scopedAnimFrame2 = registry.withScope(undefined, () =>
        registry.getOrCreate({ label: "inside" }, 100),
      );
      registry.getOrCreate({ label: "new-sibling" }, 100);
      registry.endFrame();

      expect(scopedAnimFrame2).toBe(scopedAnimFrame1);
    });

    it("scopes nested content independently of a sibling scope's internal call count", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      registry.withScope("scope-a", () => {
        registry.getOrCreate({ label: "a-child" }, 0);
      });
      const bChildFrame1 = registry.withScope("scope-b", () =>
        registry.getOrCreate({ label: "b-child" }, 0),
      );
      registry.endFrame();

      // Frame 2: scope-a now creates an extra child before scope-b runs.
      registry.beginFrame(100);
      registry.withScope("scope-a", () => {
        registry.getOrCreate({ label: "a-child" }, 100);
        registry.getOrCreate({ label: "a-extra-child" }, 100);
      });
      const bChildFrame2 = registry.withScope("scope-b", () =>
        registry.getOrCreate({ label: "b-child" }, 100),
      );
      registry.endFrame();

      expect(bChildFrame2).toBe(bChildFrame1);
    });

    it("keeps identity stable by explicit key even when position among siblings changes", () => {
      const registry = new AnimatableRegistry();

      const createKeyed = (key: string, timeInMs: number) =>
        registry.withScope(key, () =>
          registry.getOrCreate({ key }, timeInMs),
        );

      registry.beginFrame(0);
      const animAFrame1 = createKeyed("a", 0);
      const animBFrame1 = createKeyed("b", 0);
      registry.endFrame();

      // Frame 2: order flips.
      registry.beginFrame(100);
      const animBFrame2 = createKeyed("b", 100);
      const animAFrame2 = createKeyed("a", 100);
      registry.endFrame();

      expect(animAFrame2).toBe(animAFrame1);
      expect(animBFrame2).toBe(animBFrame1);
    });

    it("without an explicit key, reordering scope-opening calls themselves still shifts identity", () => {
      const registry = new AnimatableRegistry();

      const createUnkeyed = (label: string, timeInMs: number) =>
        registry.withScope(undefined, () =>
          registry.getOrCreate({ label }, timeInMs),
        );

      registry.beginFrame(0);
      const animFirstFrame1 = createUnkeyed("first", 0);
      const animSecondFrame1 = createUnkeyed("second", 0);
      registry.endFrame();

      // Frame 2: same two scopes, but called in the opposite order.
      registry.beginFrame(100);
      const animSecondFrame2 = createUnkeyed("second", 100);
      const animFirstFrame2 = createUnkeyed("first", 100);
      registry.endFrame();

      // Positional (unkeyed) identity is tied to call order, so the instance
      // that used to represent "first" now represents whatever is called
      // first this frame ("second") — this is the exact fragility explicit
      // keys are meant to opt out of.
      expect(animSecondFrame2).toBe(animFirstFrame1);
      expect(animFirstFrame2).toBe(animSecondFrame1);
    });

    it("restores the parent scope after the callback throws", () => {
      const registry = new AnimatableRegistry();
      const error = new Error("scope body failed");

      registry.beginFrame(0);
      const beforeAnim = registry.getOrCreate({ label: "before" }, 0);

      expect(() => {
        registry.withScope("will-throw", () => {
          throw error;
        });
      }).toThrow(error);

      const afterAnim = registry.getOrCreate({ label: "before" }, 0);

      // Still at root scope, so the next root-level call reuses... a fresh
      // id (call index advanced by one), not corrupted scope state.
      expect(afterAnim).not.toBe(beforeAnim);
      registry.endFrame();

      registry.beginFrame(100);
      const rootAnimFrame2 = registry.getOrCreate({ label: "before" }, 100);
      expect(rootAnimFrame2).toBe(beforeAnim);
    });

    it("returns the callback's result", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      const result = registry.withScope("scope", () => 42);

      expect(result).toBe(42);
    });
  });

  describe("multiple registries", () => {
    it("maintains independent state", () => {
      const registry1 = new AnimatableRegistry();
      const registry2 = new AnimatableRegistry();

      registry1.beginFrame(0);
      registry2.beginFrame(0);

      const anim1 = registry1.getOrCreate({ source: "registry1" }, 0);
      const anim2 = registry2.getOrCreate({ source: "registry2" }, 0);

      expect(anim1).not.toBe(anim2);
      expect(registry1.size).toBe(1);
      expect(registry2.size).toBe(1);

      registry1.endFrame();
      registry2.endFrame();
    });
  });
});
