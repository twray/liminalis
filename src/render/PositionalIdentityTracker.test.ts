import { describe, expect, it } from "vitest";

import PositionalIdentityTracker from "./PositionalIdentityTracker";

describe("PositionalIdentityTracker", () => {
  describe("nextId — positional", () => {
    it("numbers declarations in call order", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect([tracker.nextId(), tracker.nextId(), tracker.nextId()]).toEqual([
        "0",
        "1",
        "2",
      ]);
    });

    it("leaves the id unqualified when no primitiveType is given", () => {
      // The legacy shape. Keeping it byte-identical is what let the identity
      // rework land without touching every call site at once.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(tracker.nextId()).toBe("0");
    });

    it("appends the primitive type when one is given", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(tracker.nextId({ primitiveType: "rect" })).toBe("0#rect");
    });

    it("shares one counter across differing primitive types", () => {
      // The type qualifies the slot, it does not partition the numbering --
      // so a rect and a circle declared in sequence occupy slots 0 and 1, not
      // 0 and 0. Worth pinning because per-type counters would be a plausible
      // alternative reading of "type-qualified".
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect([
        tracker.nextId({ primitiveType: "rect" }),
        tracker.nextId({ primitiveType: "circle" }),
      ]).toEqual(["0#rect", "1#circle"]);
    });

    it("restarts numbering on each frame, so ids are stable across frames", () => {
      const tracker = new PositionalIdentityTracker();

      tracker.beginFrame();
      const firstFrame = [tracker.nextId(), tracker.nextId()];

      tracker.beginFrame();
      const secondFrame = [tracker.nextId(), tracker.nextId()];

      expect(secondFrame).toEqual(firstFrame);
    });
  });

  describe("nextId — keyed", () => {
    it("identifies a keyed declaration by its key rather than its position", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(tracker.nextId({ primitiveType: "rect", key: "a" })).toBe(
        "key:a#rect",
      );
    });

    it("does not consume a positional index, so keying one item cannot shift its unkeyed siblings", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.nextId({ key: "a" });

      // Still slot 0: the keyed declaration above took no slot at all.
      expect(tracker.nextId()).toBe("0");
    });
  });

  describe("withScope", () => {
    it("roots ids inside the scope at the scope's own path", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(tracker.withScope(undefined, () => tracker.nextId())).toBe("0/0");
    });

    it("uses the explicit key as the path segment when given one", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(
        tracker.withScope("a", () => tracker.nextId({ primitiveType: "rect" })),
      ).toBe("key:a/0#rect");
    });

    it("consumes a parent index for an unkeyed scope but not for a keyed one", () => {
      // The same rule nextId applies to keyed declarations, applied one level
      // up. A keyed scope is identified by its key, so it takes no slot from
      // its parent and cannot shift its siblings.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.withScope("keyed", () => undefined);
      expect(tracker.nextId()).toBe("0");

      tracker.withScope(undefined, () => undefined);
      // The unkeyed scope took slot 1, so the next declaration is slot 2.
      expect(tracker.nextId()).toBe("2");
    });

    it("joins nested scope paths", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(
        tracker.withScope("x", () =>
          tracker.withScope("y", () => tracker.nextId()),
        ),
      ).toBe("key:x/key:y/0");
    });

    it("gives sibling scopes independent counters", () => {
      // This is the property the whole path-based scheme exists for: content
      // inside one container must not be renumbered by how much unrelated
      // content a sibling container happens to declare.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.withScope("a", () => {
        tracker.nextId();
        tracker.nextId();
        tracker.nextId();
      });

      expect(tracker.withScope("b", () => tracker.nextId())).toBe("key:b/0");
    });

    it("restores the parent scope when the callback throws", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(() =>
        tracker.withScope("a", () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");

      // Back at root, and the keyed scope consumed no slot on the way out.
      expect(tracker.nextId()).toBe("0");
    });
  });

  describe("seen tracking", () => {
    it("records every id it issues as seen", () => {
      // Issuing and recording are one operation inside nextId -- there is no
      // separate markSeen a caller could forget, which is what makes the
      // registry's endFrame sweep safe to rely on.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      expect(tracker.hasBeenSeen("0")).toBe(false);

      const id = tracker.nextId();

      expect(id).toBe("0");
      expect(tracker.hasBeenSeen(id)).toBe(true);
    });

    it("forgets what was seen at the start of each frame", () => {
      // Load-bearing in both directions: the registry's endFrame sweep deletes
      // anything NOT seen this frame, and nextId throws on anything seen twice
      // WITHIN a frame. A set that never cleared would make every declaration
      // look like a duplicate; one that never filled would make every
      // animatable look abandoned.
      const tracker = new PositionalIdentityTracker();

      tracker.beginFrame();
      const id = tracker.nextId();

      tracker.beginFrame();

      expect(tracker.hasBeenSeen(id)).toBe(false);
    });
  });

  describe("declaration counts", () => {
    it("records a scope's unkeyed declaration count against its path", () => {
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.withScope("a", () => {
        tracker.nextId();
        tracker.nextId();
      });

      expect(tracker.scopeDeclarationCounts.get("key:a")).toBe(2);
    });

    it("records zero for a scope whose only children are themselves keyed", () => {
      // Keyed declarations consume no positional index, so a fully-keyed
      // scope's count stays at zero and therefore never *changes* between
      // frames -- which is precisely why the unkeyed-reorder diagnostic can
      // never fire for a keyed list, without needing to special-case it.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.withScope("outer", () => {
        tracker.nextId({ key: "a" });
        tracker.nextId({ key: "b" });
      });

      expect(tracker.scopeDeclarationCounts.get("key:outer")).toBe(0);
    });

    it("rotates this frame's counts into previous on the next frame", () => {
      const tracker = new PositionalIdentityTracker();

      tracker.beginFrame();
      tracker.withScope("a", () => tracker.nextId());
      expect(tracker.scopeDeclarationCounts.get("key:a")).toBe(1);

      tracker.beginFrame();

      expect(tracker.previousScopeDeclarationCounts.get("key:a")).toBe(1);
      expect(tracker.scopeDeclarationCounts.size).toBe(0);
    });

    it("reset() discards both sets of counts, where beginFrame() preserves one", () => {
      const tracker = new PositionalIdentityTracker();

      tracker.beginFrame();
      tracker.withScope("a", () => tracker.nextId());

      expect(tracker.scopeDeclarationCounts.size).toBe(1);

      tracker.reset();

      // Nothing carried forward as a baseline -- a rotate would have moved
      // the populated map into previous rather than discarding it.
      expect(tracker.previousScopeDeclarationCounts.size).toBe(0);
      expect(tracker.scopeDeclarationCounts.size).toBe(0);
    });
  });

  describe("id helpers", () => {
    it("recognises a keyed local id", () => {
      expect(PositionalIdentityTracker.isKeyedLocalId("key:a#rect")).toBe(true);
      expect(PositionalIdentityTracker.isKeyedLocalId("0#rect")).toBe(false);
    });

    it("recovers the primitive type from an id", () => {
      expect(PositionalIdentityTracker.primitiveNameFromId("0#rect")).toBe(
        "rect",
      );
    });

    it("falls back to a generic name for an unqualified id", () => {
      expect(PositionalIdentityTracker.primitiveNameFromId("0")).toBe(
        "primitive",
      );
    });

    it("reads the type from the LAST separator, so a key containing one is safe", () => {
      expect(
        PositionalIdentityTracker.primitiveNameFromId("key:a#b#circle"),
      ).toBe("circle");
    });

    it("throws from nextId, naming the key and primitive, when a key is duplicated", () => {
      // Asserted through nextId rather than against a helper in isolation:
      // the guard living here is what lets a second registry inherit it, so
      // this should fail if it ever moves back out into a caller.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.nextId({ primitiveType: "rect", key: "bar-1" });

      expect(() =>
        tracker.nextId({ primitiveType: "rect", key: "bar-1" }),
      ).toThrow(/"bar-1".*"rect"/);
    });

    it("throws naming the container scope when the duplication came from a container key", () => {
      // The colliding declaration carries no key of its own: two sibling
      // containers shared one, so their contents collide on an id that is
      // only a scope path. The message has to point at the scope, not at the
      // primitive, or it sends the reader hunting in the wrong place.
      const tracker = new PositionalIdentityTracker();
      tracker.beginFrame();

      tracker.withScope("row", () => tracker.nextId());

      expect(() => tracker.withScope("row", () => tracker.nextId())).toThrow(
        /container scope "key:row"/,
      );
    });
  });
});
