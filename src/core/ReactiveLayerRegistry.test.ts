import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReactiveLayerRegistry from "./ReactiveLayerRegistry";

// Envelope math (attack/sustain/release, status derivation, decay timing)
// has its own dedicated suite in ReactiveLayerEnvelope.test.ts. This file
// only exercises what the registry itself is responsible for: id-keyed
// lookup/creation/removal, and delegating attack()/sustain()/release() by
// id to the right envelope instance.
describe("ReactiveLayerRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getOrCreate", () => {
    it("creates an entry once and returns the same entry on subsequent calls", () => {
      const registry = new ReactiveLayerRegistry();

      const first = registry.getOrCreate("note1", true);
      const second = registry.getOrCreate("note1", true);

      expect(first).toBe(second);
    });

    it("stores the created entry so get() returns it, with the given isPermanent", () => {
      const registry = new ReactiveLayerRegistry();

      registry.getOrCreate("note1", false);

      expect(registry.get("note1")?.isPermanent).toBe(false);
    });

    it("returns undefined from get() for an id that has never been created", () => {
      const registry = new ReactiveLayerRegistry();

      expect(registry.get("never-seen")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes the entry so get() returns undefined afterward", () => {
      const registry = new ReactiveLayerRegistry();

      registry.getOrCreate("note1", true);
      registry.delete("note1");

      expect(registry.get("note1")).toBeUndefined();
    });
  });

  describe("attack/sustain/release by id", () => {
    it("auto-vivifies a permanent entry and delegates attack() to it", () => {
      const registry = new ReactiveLayerRegistry();

      registry.attack("note1", 0.75);
      const state = registry.get("note1")!;

      expect(state.isPermanent).toBe(true);
      expect(state.attackValue).toBe(0.75);
      expect(state.status).toBe("sustained");
    });

    it("sustain()/release() delegate to the same entry attack() created", () => {
      const registry = new ReactiveLayerRegistry();

      registry.attack("note1", 1);
      registry.sustain("note1", 200);
      registry.release("note1", 100);

      vi.advanceTimersByTime(200);
      expect(registry.get("note1")!.status).toBe("releasing");

      vi.advanceTimersByTime(100);
      expect(registry.get("note1")!.status).toBe("idle");
    });

    it("does nothing observable if the entry was deleted before a scheduled release fires", () => {
      const registry = new ReactiveLayerRegistry();

      registry.attack("note1", 1);
      registry.sustain("note1", 200);
      registry.release("note1", 100);

      registry.delete("note1");

      // The pending timer still fires against the now-orphaned envelope
      // instance, but nothing reads it back through the registry, so this
      // must not throw and the id must stay gone.
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
      expect(registry.get("note1")).toBeUndefined();
    });
  });
});
