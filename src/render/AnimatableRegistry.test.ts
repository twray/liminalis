import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnimatableRegistry from "./AnimatableRegistry";
import type { DrawAPI } from "./types";

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
        registry.withScope(key, () => registry.getOrCreate({ key }, timeInMs));

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

// --------------------------------------------------------------------------
// Identity for a primitive is POSITIONAL by default: the nth declaration
// within a scope. That is safe only while declaration order is stable, and
// the failure is not a crash -- an Animatable's creation time is baked in at
// construction and never updated when a slot is reused, and `at:` is measured
// against that creation time, so a primitive inheriting an older slot has its
// entrance animation evaluated as ALREADY OVER while the one pushed onto a
// fresh slot RESTARTS. The animations land on the wrong primitives.
//
// Two mechanisms address that, and they are orthogonal:
//   - type-qualified ids, which make a positional slot un-shareable between
//     two different kinds of primitive (always on, nothing to opt into);
//   - an opt-in `key`, which pins identity to the caller's own data instead
//     of to declaration order.
//
// Plus a diagnostic for the case that cannot be fixed automatically, because
// deciding whether two declarations are "the same logical thing" is exactly
// what a key supplies and there is nothing to compare without one.

const ENTRANCE_MS = 800;

// Drives one frame: declares `count` animated primitives, each with the same
// entrance animation, and reports the height each one resolved to. A value of
// 0 means "just started"; ENTRANCE target means "already finished".
const declareBar = (
  registry: AnimatableRegistry,
  label: string,
  seen: string[],
  identity?: { primitiveType?: string; key?: string },
) => {
  const animatable = registry.queue(
    { height: 0 },
    (props: { height: number }) =>
      seen.push(`${label}=${Math.round(props.height)}`),
    identity,
  );

  animatable.animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });

  return animatable;
};

describe("primitive identity", () => {
  describe("type-qualified positional identity", () => {
    it("does not let two different primitive types share one positional slot", () => {
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      // Frame 1: a "rect" occupies slot 0 and finishes its entrance.
      registry.beginFrame(0);
      declareBar(registry, "rect", seen, { primitiveType: "rect" });
      registry.flush();
      registry.endFrame();
      seen.length = 0;

      // Frame 2: a "circle" now occupies slot 0, freshly appearing. Its
      // entrance must start from the beginning -- it is a different thing,
      // not the rect continuing.
      registry.beginFrame(1000);
      declareBar(registry, "circle", seen, { primitiveType: "circle" });
      registry.flush();
      registry.endFrame();

      expect(seen).toEqual(["circle=0"]);
    });

    it("leaves ids unqualified when no primitiveType is supplied", () => {
      // The legacy shape has to keep working byte-identically, which is what
      // lets this land without touching every existing call site at once.
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      registry.beginFrame(0);
      declareBar(registry, "a", seen);
      registry.flush();
      registry.endFrame();
      seen.length = 0;

      registry.beginFrame(1000);
      declareBar(registry, "b", seen);
      registry.flush();
      registry.endFrame();

      // Same slot, no qualification -> the second declaration inherits the
      // first's already-elapsed creation time. This is the OLD behaviour,
      // pinned deliberately so a regression in either direction is visible.
      expect(seen).toEqual(["b=100"]);
      expect(registry.size).toBe(1);
    });
  });

  describe("opt-in key", () => {
    it("keeps each item's animation with the item when a list is prepended to", () => {
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      // Frame 1 @ t=0: list is [A]. A begins entering.
      registry.beginFrame(0);
      declareBar(registry, "A", seen, { primitiveType: "rect", key: "A" });
      registry.flush();
      registry.endFrame();
      seen.length = 0;

      // Frame 2 @ t=1000: A has finished. B is PREPENDED, so declaration
      // order is now [B, A] and every positional slot has shifted.
      registry.beginFrame(1000);
      declareBar(registry, "B", seen, { primitiveType: "rect", key: "B" });
      declareBar(registry, "A", seen, { primitiveType: "rect", key: "A" });
      registry.flush();
      registry.endFrame();

      // B just appeared, so it starts its entrance. A has been on screen for
      // a second, so it stays finished. Without keys these are inverted.
      expect(seen).toEqual(["B=0", "A=100"]);
    });

    it("reuses the same animatable for a key that moved position", () => {
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      registry.beginFrame(0);
      const first = declareBar(registry, "A", seen, {
        primitiveType: "rect",
        key: "A",
      });
      registry.flush();
      registry.endFrame();

      registry.beginFrame(16);
      declareBar(registry, "B", seen, { primitiveType: "rect", key: "B" });
      const second = declareBar(registry, "A", seen, {
        primitiveType: "rect",
        key: "A",
      });
      registry.flush();
      registry.endFrame();

      // Identity, not just equivalent state: the very same object.
      expect(second).toBe(first);
    });

    it("does not consume a positional index, so keying one item cannot shift its unkeyed siblings", () => {
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      // Frame 1: one unkeyed item, which takes positional slot 0.
      registry.beginFrame(0);
      const unkeyedFrame1 = declareBar(registry, "plain", seen, {
        primitiveType: "rect",
      });
      registry.flush();
      registry.endFrame();

      // Frame 2: a KEYED item is declared ahead of it. If keyed declarations
      // consumed an index, the unkeyed one would shift from slot 0 to slot 1
      // and lose its identity.
      registry.beginFrame(16);
      declareBar(registry, "keyed", seen, {
        primitiveType: "rect",
        key: "new",
      });
      const unkeyedFrame2 = declareBar(registry, "plain", seen, {
        primitiveType: "rect",
      });
      registry.flush();
      registry.endFrame();

      expect(unkeyedFrame2).toBe(unkeyedFrame1);
    });
  });

  describe("duplicate keys", () => {
    const declareKeyed = (
      registry: AnimatableRegistry,
      key: string,
      primitiveType = "rect",
    ) => registry.queue({ height: 0 }, () => {}, { primitiveType, key });

    it("throws when two sibling primitives share a key", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      declareKeyed(registry, "bar-1");

      expect(() => declareKeyed(registry, "bar-1")).toThrow(/Duplicate key/);
    });

    it("names the key and primitive so the collision can be found", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      declareKeyed(registry, "bar-1", "circle");

      expect(() => declareKeyed(registry, "bar-1", "circle")).toThrow(
        /"bar-1".*"circle"/,
      );
    });

    it("allows the same key in sibling scopes, because keys are scoped not global", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);

      // Two separate groups may each contain an item keyed "a" -- their ids
      // differ by scope path, so there is no collision to report.
      expect(() => {
        registry.withScope("group-a", () => declareKeyed(registry, "a"));
        registry.withScope("group-b", () => declareKeyed(registry, "a"));
      }).not.toThrow();
    });

    it("allows the same key across frames, which is the entire point of a key", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);
      declareKeyed(registry, "bar-1");
      registry.flush();
      registry.endFrame();

      registry.beginFrame(16);

      expect(() => declareKeyed(registry, "bar-1")).not.toThrow();
    });

    it("catches duplicate container keys too", () => {
      // group({ key }) pins identity through withScope, so two sibling
      // containers sharing a key give their contents the same scope path --
      // and the container's own animatable collides inside it.
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);

      expect(() => {
        registry.withScope("dup", () =>
          registry.queue({ height: 0 }, () => {}, { primitiveType: "group" }),
        );
        registry.withScope("dup", () =>
          registry.queue({ height: 0 }, () => {}, { primitiveType: "group" }),
        );
      }).toThrow(/Duplicate key/);
    });

    it("does not throw for unkeyed declarations, whose ids cannot repeat", () => {
      const registry = new AnimatableRegistry();

      registry.beginFrame(0);

      expect(() => {
        for (let index = 0; index < 50; index++) {
          registry.queue({ height: 0 }, () => {}, { primitiveType: "rect" });
        }
      }).not.toThrow();
    });
  });

  describe("unkeyed-reorder diagnostic", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    // Runs `counts.length` frames, declaring `count` unkeyed animated
    // primitives on each, all still mid-animation.
    const runFrames = (
      registry: AnimatableRegistry,
      counts: number[],
      options: { animated?: boolean; keyed?: boolean } = {},
    ) => {
      const { animated = true, keyed = false } = options;
      const seen: string[] = [];

      counts.forEach((count, frame) => {
        registry.beginFrame(frame * 16);

        for (let index = 0; index < count; index++) {
          if (animated) {
            declareBar(registry, `i${index}`, seen, {
              primitiveType: "rect",
              ...(keyed ? { key: `item-${index}` } : {}),
            });
          } else {
            registry.queue({ height: 10 }, () => {}, {
              primitiveType: "rect",
              ...(keyed ? { key: `item-${index}` } : {}),
            });
          }
        }

        registry.flush();
        registry.endFrame();
      });
    };

    it("warns when the number of unkeyed animated primitives changes", () => {
      runFrames(new AnimatableRegistry(), [1, 2]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("key");
    });

    it("names the offending primitive so the call site can be found", () => {
      runFrames(new AnimatableRegistry(), [1, 2]);

      // The type is recovered from the id rather than stored per primitive,
      // so this is the test that catches that parsing breaking.
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('"rect"');
    });

    it("includes the declared props, so the primitive is identifiable in source", () => {
      const registry = new AnimatableRegistry();
      const seen: string[] = [];

      registry.beginFrame(0);
      registry
        .queue({ height: 0, fillStyle: "#abcdef" }, () => {}, {
          primitiveType: "rect",
        })
        .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });
      registry.flush();
      registry.endFrame();

      registry.beginFrame(16);
      [0, 1].forEach(() => {
        registry
          .queue({ height: 0, fillStyle: "#abcdef" }, () => {}, {
            primitiveType: "rect",
          })
          .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });
      });
      registry.flush();
      registry.endFrame();

      void seen;
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        '"fillStyle":"#abcdef"',
      );
    });

    it("bounds the serialised props rather than dumping an unbounded payload", () => {
      const registry = new AnimatableRegistry();
      // A polygon-sized payload: enough points that an unbounded dump would
      // flood the console.
      const points = Array.from({ length: 400 }, (_value, index) => ({
        x: index,
        y: index,
      }));

      const declare = () =>
        registry
          .queue({ height: 0, points }, () => {}, { primitiveType: "polygon" })
          .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });

      registry.beginFrame(0);
      declare();
      registry.flush();
      registry.endFrame();

      registry.beginFrame(16);
      declare();
      declare();
      registry.flush();
      registry.endFrame();

      const message = String(warnSpy.mock.calls[0]?.[0]);

      expect(message).toContain("(truncated)");
      expect(message.length).toBeLessThan(600);
    });

    it("does not throw on props JSON cannot represent", () => {
      const registry = new AnimatableRegistry();

      // A BigInt rather than a circular reference: circular props are already
      // fatal further upstream, in Animatable's own prop cloning, so they can
      // never reach this diagnostic. A BigInt survives cloning (it is not an
      // object) but JSON.stringify throws on it, which is exactly the path
      // the guard exists for.
      const declare = () =>
        registry
          .queue({ height: 0, weird: 1n }, () => {}, {
            primitiveType: "rect",
          })
          .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });

      registry.beginFrame(0);
      declare();
      registry.flush();
      registry.endFrame();

      registry.beginFrame(16);
      declare();
      declare();

      // The diagnostic must never be the reason a frame fails to render.
      expect(() => {
        registry.flush();
        registry.endFrame();
      }).not.toThrow();

      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        "could not be serialised",
      );
    });

    it("stays silent when the declaration count is stable, even while animating", () => {
      runFrames(new AnimatableRegistry(), [3, 3, 3]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("stays silent when the count changes but nothing animates", () => {
      // Identity has no bearing on output for a primitive with no segments --
      // getCurrentProps returns the initial props verbatim -- so a static
      // scene can reorder freely and must not be warned about.
      runFrames(new AnimatableRegistry(), [1, 2, 3], { animated: false });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("stays silent when the changing list is keyed", () => {
      runFrames(new AnimatableRegistry(), [1, 2, 3], { keyed: true });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("stays silent when only KEYED declarations in the scope animate", () => {
      // The shape the bars-animation demo actually hit: an unkeyed list whose
      // length changes but which does not animate, sharing a scope with a
      // keyed list that does. Nothing unkeyed is at risk, so the fact that
      // something keyed is mid-animation must not justify a warning.
      const registry = new AnimatableRegistry();

      const declareFrame = (count: number, frame: number) => {
        registry.beginFrame(frame * 16);

        for (let index = 0; index < count; index++) {
          // Unkeyed, static.
          registry.queue({ height: 10 }, () => {}, { primitiveType: "rect" });
        }

        for (let index = 0; index < count; index++) {
          // Keyed, animated -- already safe.
          registry
            .queue({ height: 0 }, () => {}, {
              primitiveType: "rect",
              key: `bar-${index}`,
            })
            .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });
        }

        registry.flush();
        registry.endFrame();
      };

      declareFrame(1, 0);
      declareFrame(2, 1);
      declareFrame(3, 2);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("still warns when an unkeyed declaration animates alongside keyed ones", () => {
      // The mirror of the test above: the exclusion must not be so broad that
      // it silences a genuinely at-risk unkeyed animation just because a
      // keyed sibling exists.
      const registry = new AnimatableRegistry();

      const declareFrame = (count: number, frame: number) => {
        registry.beginFrame(frame * 16);

        for (let index = 0; index < count; index++) {
          registry
            .queue({ height: 0 }, () => {}, { primitiveType: "rect" })
            .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });
        }

        registry
          .queue({ height: 0 }, () => {}, {
            primitiveType: "rect",
            key: "safe",
          })
          .animateTo({ height: 100 }, { at: 0, duration: ENTRANCE_MS });

        registry.flush();
        registry.endFrame();
      };

      declareFrame(1, 0);
      declareFrame(2, 1);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("warns once per scope rather than every frame", () => {
      runFrames(new AnimatableRegistry(), [1, 2, 3, 4, 5]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("through the draw API", () => {
    const createMockContext = () => {
      const paintedBars: { y: number; height: number }[] = [];

      const context = new Proxy({} as Record<string, unknown>, {
        get: (_target, property) => {
          if (property === "roundRect") {
            return (_x: number, y: number, _width: number, height: number) =>
              paintedBars.push({ y, height });
          }
          if (property === "canvas") {
            return { width: 800, height: 600, getContext: () => null };
          }
          if (property === "measureText") {
            return () => ({ width: 10 });
          }
          return () => undefined;
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;

      return { context, paintedBars };
    };

    // Bars grow upward from a fixed baseline. Starting a few pixels tall
    // rather than at zero because a zero-height rect is not painted at all,
    // which would make the entering bar invisible to this assertion.
    const BASELINE = 400;
    const MIN_HEIGHT = 4;
    const FULL_HEIGHT = 200;

    const prependedBars =
      (ids: number[], keyed: boolean) =>
      (draw: DrawAPI): void => {
        ids.forEach((id, index) => {
          draw
            .render.rect({
              x: index * 50,
              y: BASELINE - MIN_HEIGHT,
              width: 40,
              height: MIN_HEIGHT,
              fillStyle: "#333",
              strokeStyle: "transparent",
              ...(keyed ? { key: `bar-${id}` } : {}),
            })
            .animateTo(
              { y: BASELINE - FULL_HEIGHT, height: FULL_HEIGHT },
              { at: 0, duration: ENTRANCE_MS },
            );
        });
      };

    const heightsAfterPrepend = async (keyed: boolean) => {
      const { createDrawContext } = await import("./index");
      const drawContext = createDrawContext({
        enableBitmapBasedCaching: false,
      });
      const { context, paintedBars } = createMockContext();

      // [0] enters and settles.
      drawContext.executeDrawCallback(
        prependedBars([0], keyed),
        context,
        800,
        600,
        0,
      );
      drawContext.executeDrawCallback(
        prependedBars([0], keyed),
        context,
        800,
        600,
        ENTRANCE_MS + 100,
      );

      paintedBars.length = 0;

      // Bar 1 is prepended, so declaration order becomes [1, 0].
      drawContext.executeDrawCallback(
        prependedBars([1, 0], keyed),
        context,
        800,
        600,
        ENTRANCE_MS + 200,
      );

      return paintedBars.map((bar) => Math.round(bar.height));
    };

    it("mis-assigns entrance animations across a prepend when unkeyed", async () => {
      // Pins the broken behaviour deliberately: bar 1 has only just appeared
      // yet is already full height, and bar 0 -- on screen and settled --
      // has collapsed back to the start of the entrance.
      expect(await heightsAfterPrepend(false)).toEqual([
        FULL_HEIGHT,
        MIN_HEIGHT,
      ]);
    });

    it("keeps entrance animations with their own bar when keyed", async () => {
      // Same scene, same animation, one added prop. Bar 1 enters; bar 0
      // stays where it was.
      expect(await heightsAfterPrepend(true)).toEqual([
        MIN_HEIGHT,
        FULL_HEIGHT,
      ]);
    });
  });
});
