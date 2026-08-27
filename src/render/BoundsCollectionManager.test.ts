import { describe, expect, it, vi } from "vitest";
import type { BoundsCollector } from "./types";

import BoundsCollectionManager from "./BoundsCollectionManager";

const createMockCollector = (): BoundsCollector => ({
  includeBounds: vi.fn(),
  getBounds: vi.fn(),
});

describe("BoundsCollectionManager", () => {
  describe("getActiveCollector", () => {
    it("returns undefined when no collector is active", () => {
      const manager = new BoundsCollectionManager();

      expect(manager.getActiveCollector()).toBeUndefined();
    });

    it("returns the most recently pushed collector", () => {
      const manager = new BoundsCollectionManager();
      const collectorA = createMockCollector();
      const collectorB = createMockCollector();

      manager.withCollector(collectorA, () => {
        expect(manager.getActiveCollector()).toBe(collectorA);

        manager.withCollector(collectorB, () => {
          expect(manager.getActiveCollector()).toBe(collectorB);
        });

        expect(manager.getActiveCollector()).toBe(collectorA);
      });

      expect(manager.getActiveCollector()).toBeUndefined();
    });
  });

  describe("withCollector", () => {
    it("pops the collector even when the frame throws", () => {
      const manager = new BoundsCollectionManager();
      const collector = createMockCollector();
      const error = new Error("frame failed");

      expect(() => {
        manager.withCollector(collector, () => {
          throw error;
        });
      }).toThrow(error);

      expect(manager.getActiveCollector()).toBeUndefined();
    });
  });

  describe("shouldCollectBounds", () => {
    it("is true by default", () => {
      const manager = new BoundsCollectionManager();

      expect(manager.shouldCollectBounds()).toBe(true);
    });

    it("is false while inside withSuppressedBounds", () => {
      const manager = new BoundsCollectionManager();

      manager.withSuppressedBounds(() => {
        expect(manager.shouldCollectBounds()).toBe(false);
      });

      expect(manager.shouldCollectBounds()).toBe(true);
    });

    it("supports reentrant suppression", () => {
      const manager = new BoundsCollectionManager();

      manager.withSuppressedBounds(() => {
        manager.withSuppressedBounds(() => {
          expect(manager.shouldCollectBounds()).toBe(false);
        });

        expect(manager.shouldCollectBounds()).toBe(false);
      });

      expect(manager.shouldCollectBounds()).toBe(true);
    });

    it("restores suppression depth even when the frame throws", () => {
      const manager = new BoundsCollectionManager();
      const error = new Error("frame failed");

      expect(() => {
        manager.withSuppressedBounds(() => {
          throw error;
        });
      }).toThrow(error);

      expect(manager.shouldCollectBounds()).toBe(true);
    });
  });
});
