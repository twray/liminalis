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
      const registry = new ReactiveLayerRegistry(Date.now);

      const first = registry.getOrCreate("note1", true);
      const second = registry.getOrCreate("note1", true);

      expect(first).toBe(second);
    });

    it("stores the created entry so get() returns it, with the given isPermanent", () => {
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreate("note1", false);

      expect(registry.get("note1")?.isPermanent).toBe(false);
    });

    it("returns undefined from get() for an id that has never been created", () => {
      const registry = new ReactiveLayerRegistry(Date.now);

      expect(registry.get("never-seen")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes the entry so get() returns undefined afterward", () => {
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreate("note1", true);
      registry.delete("note1");

      expect(registry.get("note1")).toBeUndefined();
    });
  });

  describe("unplaced attack warning", () => {
    const THRESHOLD_FRAMES = 10;

    const runFrames = (registry: ReactiveLayerRegistry, count: number) => {
      for (let frame = 0; frame < count; frame++) {
        registry.endFrame();
      }
    };

    const unplacedWarnings = (warn: ReturnType<typeof vi.spyOn>) =>
      warn.mock.calls.filter(([message]) =>
        String(message).includes("no component has been placed"),
      );

    it("warns once, naming the id, when an attacked envelope is never placed", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreate("F#", true).attack(1);

      runFrames(registry, THRESHOLD_FRAMES - 1);
      expect(unplacedWarnings(warn)).toHaveLength(0);

      runFrames(registry, 1);
      expect(unplacedWarnings(warn)).toHaveLength(1);
      expect(String(warn.mock.calls[0]![0])).toContain('"F#"');

      runFrames(registry, THRESHOLD_FRAMES * 3);
      expect(unplacedWarnings(warn)).toHaveLength(1);

      warn.mockRestore();
    });

    it("does not warn for an envelope that has been placed", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreate("C", true).attack(1);
      runFrames(registry, 1);
      registry.getOrCreateForPlacement("C", true);

      runFrames(registry, THRESHOLD_FRAMES * 3);
      expect(unplacedWarnings(warn)).toHaveLength(0);

      warn.mockRestore();
    });

    it("does not warn for an unplaced envelope that has never been attacked", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreate("C", true);

      runFrames(registry, THRESHOLD_FRAMES * 3);
      expect(unplacedWarnings(warn)).toHaveLength(0);

      warn.mockRestore();
    });

    it("forgets a deleted id, so a later envelope with that id is judged afresh", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const registry = new ReactiveLayerRegistry(Date.now);

      registry.getOrCreateForPlacement("pulse", false);
      registry.delete("pulse");

      registry.getOrCreate("pulse", true).attack(1);
      runFrames(registry, THRESHOLD_FRAMES);
      expect(unplacedWarnings(warn)).toHaveLength(1);

      warn.mockRestore();
    });
  });
});
