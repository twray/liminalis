import { beforeEach, describe, expect, it } from "vitest";
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
    let seenSceneMeasurements: DrawAPI["util"]["sceneMeasurements"] | null = null;

    drawContext.executeDrawCallback(
      (d) => {
        seenSceneMeasurements = d.util.sceneMeasurements;
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
    let seenSceneMeasurements: DrawAPI["util"]["sceneMeasurements"] | null = null;

    drawContext.executeDrawCallback(
      (d) => {
        d.render.group(
          () => {
            seenSceneMeasurements = d.util.sceneMeasurements;
          },
          { x: 10, y: 20 },
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

  it("does not accept explicit dimensions", () => {
    // A type-level guard, which is the only kind available: group() having no
    // width/height is a property of GroupOptions, so nothing at runtime can
    // observe its absence. Without this, the option could be reintroduced by
    // adding Dimensions2D back and no test would notice.
    //
    // group() derives its frame from its children; a container that needs a
    // declared size is layer() or place().
    const accepts = (draw: DrawAPI) => {
      // @ts-expect-error -- width is not part of GroupOptions
      draw.group(() => {}, { width: 100 });
      // @ts-expect-error -- height is not part of GroupOptions
      draw.group(() => {}, { height: 100 });

      // x/y, transforms and container props remain valid.
      draw.render.group(() => {}, { x: 10, y: 20, rotate: 45, showBounds: true });
    };

    expect(typeof accepts).toBe("function");
  });
});
