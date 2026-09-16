import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawAPI } from "../types";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("sceneMeasurements", () => {
  it("is available directly on the ambient DrawAPI at root, matching the canvas size", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    let seenSceneMeasurements: DrawAPI["sceneMeasurements"] | null = null;

    drawContext.executeDrawCallback(
      (d) => {
        seenSceneMeasurements = d.sceneMeasurements;
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

  // group()'s own raw callback receives only FrameContext
  // (hasMeasurements/getMeasurements) -- it does NOT get sceneMeasurements
  // merged into that parameter directly, unlike a place()'d LayerComponent's
  // ambient props (see place.test.ts). Primitives and sceneMeasurements
  // alike are reached the same way inside a raw group() callback: via the
  // outer, closed-over `d` (the ambient DrawAPI), not via anything spread
  // into the callback's own argument. Worth knowing -- someone reading
  // "available on all renderable surfaces" could reasonably expect
  // `group(({ sceneMeasurements }) => ...)` destructuring to work
  // uniformly, and it currently doesn't for the raw-callback form.
  it("reports the full canvas size inside a group() via the closed-over ambient DrawAPI, not the group's own smaller explicit size", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    let seenSceneMeasurements: DrawAPI["sceneMeasurements"] | null = null;

    drawContext.executeDrawCallback(
      (d) => {
        d.group(
          () => {
            seenSceneMeasurements = d.sceneMeasurements;
          },
          { x: 10, y: 20, width: 200, height: 120 },
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
});
