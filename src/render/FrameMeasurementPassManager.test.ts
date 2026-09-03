import { describe, expect, it, vi } from "vitest";

import FrameMeasurementPassManager from "./FrameMeasurementPassManager";

describe("FrameMeasurementPassManager", () => {
  describe("pass lifecycle", () => {
    it("starts outside a measurement pass", () => {
      const manager = new FrameMeasurementPassManager();

      expect(manager.isMeasuringFrameBounds()).toBe(false);
    });

    it("enters measuring state for the callback duration", () => {
      const manager = new FrameMeasurementPassManager();

      manager.withFrameBoundsMeasurementPass(() => {
        expect(manager.isMeasuringFrameBounds()).toBe(true);
      });

      expect(manager.isMeasuringFrameBounds()).toBe(false);
    });

    it("supports nested measurement passes", () => {
      const manager = new FrameMeasurementPassManager();

      manager.withFrameBoundsMeasurementPass(() => {
        expect(manager.isMeasuringFrameBounds()).toBe(true);

        manager.withFrameBoundsMeasurementPass(() => {
          expect(manager.isMeasuringFrameBounds()).toBe(true);
        });

        expect(manager.isMeasuringFrameBounds()).toBe(true);
      });

      expect(manager.isMeasuringFrameBounds()).toBe(false);
    });

    it("restores pass depth when callback throws", () => {
      const manager = new FrameMeasurementPassManager();
      const expectedError = new Error("boom");

      expect(() => {
        manager.withFrameBoundsMeasurementPass(() => {
          throw expectedError;
        });
      }).toThrow(expectedError);

      expect(manager.isMeasuringFrameBounds()).toBe(false);
    });

    it("returns callback result", () => {
      const manager = new FrameMeasurementPassManager();

      const result = manager.withFrameBoundsMeasurementPass(() => 123);

      expect(result).toBe(123);
    });
  });

  describe("measurement contexts", () => {
    it("warns once when dynamic measurements are read while unavailable", () => {
      const manager = new FrameMeasurementPassManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const dynamicContext = manager.createMeasurementContext(
          () => ({
            width: 0,
            height: 0,
            center: { x: 0, y: 0 },
          }),
          false,
          true,
        );

        dynamicContext.getMeasurements();
        dynamicContext.getMeasurements();

        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("does not warn when warnOnUnavailableRead is false", () => {
      const manager = new FrameMeasurementPassManager();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const dynamicContext = manager.createMeasurementContext(
          () => ({
            width: 0,
            height: 0,
            center: { x: 0, y: 0 },
          }),
          false,
          false,
        );

        dynamicContext.getMeasurements();

        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
