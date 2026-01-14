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
      // The snapshot captured x=50, so animation continues from there
      registry.beginFrame(500);
      const anim2 = registry.getOrCreate({ x: 0 }, 500);
      anim2.animateTo({ x: 100 }, { at: 0, duration: 1000 });
      // At t=500, with snapshot=50, animating to 100 at 50% progress: 50 + 0.5*(100-50) = 75
      expect(anim2.getCurrentProps(500).x).toBe(75);
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
      // Snapshot captures x=50 from previous frame's animation state
      // New animation continues from snapshot (50) to target (100)
      // At 50% progress: 50 + 0.5*(100-50) = 75
      renderFn.mockClear();
      registry.beginFrame(500);
      const anim2 = registry.queue({ x: 0 }, renderFn);
      anim2.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();

      expect(renderFn).toHaveBeenCalledWith({ x: 75 });
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
        renderFn
      );
      anim.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();
      registry.endFrame();

      // Frame 2 at t=500
      // Snapshot captures x=50, animation continues from there
      // At 50% progress: 50 + 0.5*(100-50) = 75
      renderFn.mockClear();
      registry.beginFrame(500);
      const anim2 = registry.queue(
        { x: 0, fillStyle: "red", strokeStyle: "blue" },
        renderFn
      );
      anim2.animateTo({ x: 100 }, { duration: 1000 });
      registry.flush();

      expect(renderFn).toHaveBeenCalledWith({
        x: 75,
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
