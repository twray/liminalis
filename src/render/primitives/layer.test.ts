import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawAPI } from "../types";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("sceneMeasurements", () => {
  it("reports the full canvas size inside a nested layer() two levels deep, via the closed-over ambient DrawAPI", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    let seenSceneMeasurements: DrawAPI["sceneMeasurements"] | null = null;

    drawContext.executeDrawCallback(
      (d) => {
        d.layer(
          () => {
            d.layer(
              () => {
                seenSceneMeasurements = d.sceneMeasurements;
              },
              { x: 5, y: 5, width: 20, height: 20 },
            );
          },
          { x: 100, y: 100, width: 400, height: 300 },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(seenSceneMeasurements).toEqual({
      width: 800,
      height: 600,
      center: { x: 400, y: 300 },
    });
  });

  it("is available via the ambient DrawAPI inside a layer() even during the implicit measurement pass, unlike hasMeasurements/getMeasurements", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const observedPasses: Array<{
      hasMeasurements: boolean;
      sceneMeasurements: DrawAPI["sceneMeasurements"];
    }> = [];

    drawContext.executeDrawCallback(
      (d) => {
        // No explicit width/height -- triggers the implicit measurement
        // pass, where this layer's own hasMeasurements is false.
        d.layer(({ hasMeasurements }) => {
          observedPasses.push({
            hasMeasurements,
            sceneMeasurements: d.sceneMeasurements,
          });
          d.rect({ x: 0, y: 0, width: 50, height: 50, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(observedPasses.length).toBeGreaterThan(0);
    // sceneMeasurements is identical and correct on every pass, including
    // the one where hasMeasurements is false -- it never shares the
    // container's own "might not know my size yet" uncertainty.
    observedPasses.forEach(({ sceneMeasurements }) => {
      expect(sceneMeasurements).toEqual({
        width: 800,
        height: 600,
        center: { x: 400, y: 300 },
      });
    });
    expect(observedPasses.some((p) => p.hasMeasurements === false)).toBe(true);
  });
});
