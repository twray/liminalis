import { describe, expect, it } from "vitest";

import ActiveMeasurementsManager from "./ActiveMeasurementsManager";

const measurements = (width: number, height: number) => ({
  width,
  height,
  center: { x: width / 2, y: height / 2 },
});

describe("ActiveMeasurementsManager", () => {
  describe("getActiveMeasurements", () => {
    it("returns undefined when nothing has been pushed", () => {
      const manager = new ActiveMeasurementsManager();

      expect(manager.getActiveMeasurements()).toBeUndefined();
    });

    it("returns the most recently pushed measurements", () => {
      const manager = new ActiveMeasurementsManager();

      manager.withMeasurements(
        () => measurements(800, 600),
        () => {
          expect(manager.getActiveMeasurements()).toEqual(
            measurements(800, 600),
          );

          manager.withMeasurements(
            () => measurements(100, 50),
            () => {
              expect(manager.getActiveMeasurements()).toEqual(
                measurements(100, 50),
              );
            },
          );

          expect(manager.getActiveMeasurements()).toEqual(
            measurements(800, 600),
          );
        },
      );

      expect(manager.getActiveMeasurements()).toBeUndefined();
    });

    it("re-reads the getter on every call rather than snapshotting", () => {
      const manager = new ActiveMeasurementsManager();
      let width = 100;

      manager.withMeasurements(
        () => measurements(width, 50),
        () => {
          expect(manager.getActiveMeasurements()?.width).toBe(100);

          width = 200;

          expect(manager.getActiveMeasurements()?.width).toBe(200);
        },
      );
    });
  });

  describe("withMeasurements", () => {
    it("returns the callback's result", () => {
      const manager = new ActiveMeasurementsManager();

      const result = manager.withMeasurements(
        () => measurements(1, 1),
        () => 42,
      );

      expect(result).toBe(42);
    });

    it("pops back to the previous entry even when the callback throws", () => {
      const manager = new ActiveMeasurementsManager();
      const error = new Error("frame failed");

      manager.withMeasurements(
        () => measurements(800, 600),
        () => {
          expect(() => {
            manager.withMeasurements(
              () => measurements(1, 1),
              () => {
                throw error;
              },
            );
          }).toThrow(error);

          expect(manager.getActiveMeasurements()).toEqual(
            measurements(800, 600),
          );
        },
      );
    });
  });
});
