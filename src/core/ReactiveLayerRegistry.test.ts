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
});
