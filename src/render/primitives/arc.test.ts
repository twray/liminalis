import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeTransformedRectangularAABB } from "../common";
import { getArcTransformedAABB } from "./arc";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

// arc()'s public start/end are degrees in a "0 = top, clockwise" convention;
// tracePath draws in standard math radians ("0 = +x axis"), via the same
// `degrees - 90` shift getArcAnglesInRadians applies internally. Tests below
// compute their own expectation with this helper rather than importing the
// internal conversion, so they'd actually catch a regression in it.
const toArcRadians = (degrees: number) => ((degrees - 90) * Math.PI) / 180;

describe("arc rendering", () => {
  it("renders a small sweep (30 degree) circular arc with the correct start and end angles", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 30,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      100,
      100,
      50,
      50,
      0,
      toArcRadians(0),
      toArcRadians(30),
    );
    expect(mockContext.stroke).toHaveBeenCalled();
    expect(mockContext.fill).not.toHaveBeenCalled();
  });

  it("renders a large sweep (300 degree) circular arc with the correct start and end angles", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 300,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      100,
      100,
      50,
      50,
      0,
      toArcRadians(0),
      toArcRadians(300),
    );
  });

  it("renders a full sweep (360 degree) arc across its entire circumference", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 360,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      100,
      100,
      50,
      50,
      0,
      toArcRadians(0),
      toArcRadians(360),
    );
  });

  it("renders an elliptical arc with independently-sized radiusX and radiusY", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
          start: 10,
          end: 200,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      150,
      120,
      90,
      40,
      0,
      toArcRadians(10),
      toArcRadians(200),
    );
  });

  it("applies rotation around the arc's own center by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 180,
          strokeStyle: "#333",
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-100, -100);
  });

  it("does not apply rotation when rotate is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 180,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rotate).not.toHaveBeenCalled();
  });

  it("renders an open arc (closePath: false, the default) without closing the path", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 180,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.closePath).not.toHaveBeenCalled();
  });

  it("renders a closed arc (closePath: true), closing the path after tracing", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 180,
          strokeStyle: "#333",
          closePath: true,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.closePath).toHaveBeenCalled();
  });

  it("draws both a fill pass and a stroke pass when both fillStyle and strokeStyle are set", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc({
          cx: 100,
          cy: 100,
          radius: 50,
          start: 0,
          end: 180,
          fillStyle: "#0f0",
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fill).toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
    // One ellipse() call to trace the fill path, one for the stroke path --
    // both at the same radii, since strokeAlignment defaults to "center".
    expect(mockContext.ellipse).toHaveBeenCalledTimes(2);
    expect(mockContext.ellipse).toHaveBeenNthCalledWith(
      1,
      100,
      100,
      50,
      50,
      0,
      toArcRadians(0),
      toArcRadians(180),
    );
    expect(mockContext.ellipse).toHaveBeenNthCalledWith(
      2,
      100,
      100,
      50,
      50,
      0,
      toArcRadians(0),
      toArcRadians(180),
    );
  });
});

describe("framed clipping for arc", () => {
  it("supports closed arc as a clipping frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc(
          {
            cx: 240,
            cy: 240,
            radius: 120,
            start: 30,
            end: 320,
            closePath: true,
          },
          () => {
            d.line({
              start: { x: 80, y: 240 },
              end: { x: 400, y: 240 },
              strokeStyle: "#0a0",
            });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    const clippedArcCall = vi.mocked(mockContext.ellipse).mock.calls[0];
    expect(clippedArcCall[0]).toBe(240);
    expect(clippedArcCall[1]).toBe(240);
    expect(clippedArcCall[2]).toBe(120);
    expect(clippedArcCall[3]).toBe(120);
    expect(clippedArcCall[4]).toBe(0);
    expect(clippedArcCall[5]).toBeCloseTo(
      (30 * Math.PI) / 180 - Math.PI / 2,
      12,
    );
    expect(clippedArcCall[6]).toBeCloseTo(
      (320 * Math.PI) / 180 - Math.PI / 2,
      12,
    );
    expect(mockContext.closePath).toHaveBeenCalled();
    expect(mockContext.lineTo).toHaveBeenCalledWith(400, 240);
  });

  it("uses a closed path for arc clipping even when closePath is false", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.arc(
          {
            cx: 240,
            cy: 240,
            radius: 120,
            start: 30,
            end: 320,
            closePath: false,
          },
          () => {
            d.circle({ cx: 240, cy: 240, radius: 80, fillStyle: "#f80" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rect).not.toHaveBeenCalledWith(0, 0, 0, 0);
    expect(mockContext.closePath).toHaveBeenCalled();
    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.ellipse).toHaveBeenCalled();
  });
});

describe("axis-aligned bounds calculation for arc", () => {
  it("returns EMPTY_BOUNDS for an invalid (non-positive) radius", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 0,
      start: 0,
      end: 180,
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  // Scope guard: with no rotate/scale, the reported bbox is the FULL
  // circle's untransformed bounds, not tightened to the swept region --
  // matching computeTransformedEllipticalAABB's own early-return behavior
  // (see common.test.ts). Sweep-aware tightening only ever kicks in once a
  // transform is actually applied (see the rotated case below).
  it("returns the full untransformed circle bounds for a partial sweep when there is no rotation or scale", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 50,
      start: 0,
      end: 90,
    });

    expect(transformedBounds).toEqual({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
  });

  it("is rotation-invariant for a full circular sweep rotated about its own center", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 150,
      cy: 150,
      radius: 50,
      start: 0,
      end: 360,
      rotate: 45,
    });

    expect(transformedBounds.x).toBeCloseTo(100, 2);
    expect(transformedBounds.y).toBeCloseTo(100, 2);
    expect(transformedBounds.width).toBeCloseTo(100, 2);
    expect(transformedBounds.height).toBeCloseTo(100, 2);
  });

  it("produces an axis-aligned ellipse bounding box for a full circular sweep scaled non-uniformly", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 40,
      start: 0,
      end: 360,
      scaleX: 2,
      scaleY: 1,
    });

    expect(transformedBounds.x).toBeCloseTo(20, 2);
    expect(transformedBounds.y).toBeCloseTo(60, 2);
    expect(transformedBounds.width).toBeCloseTo(160, 2);
    expect(transformedBounds.height).toBeCloseTo(80, 2);
  });

  it("computes the row-norm bounding box for a rotated true ellipse (independent radiusX/radiusY) across a full sweep", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 100,
      cy: 100,
      radiusX: 40,
      radiusY: 20,
      start: 0,
      end: 360,
      rotate: 45,
    });

    expect(transformedBounds.x).toBeCloseTo(68.38, 2);
    expect(transformedBounds.y).toBeCloseTo(68.38, 2);
    expect(transformedBounds.width).toBeCloseTo(63.25, 2);
    expect(transformedBounds.height).toBeCloseTo(63.25, 2);
  });

  // The most direct proof that the public start/end (degrees, "0 = top,
  // clockwise") are correctly converted before feeding the elliptical AABB
  // math: public start:90/end:150 here map to the exact same internal
  // sweep (0 to PI/3 radians, standard math convention) already verified
  // by hand against computeTransformedEllipticalAABB directly in
  // common.test.ts, so this result must match that test's values exactly.
  // Also confirms the fix is real: the tight bbox is strictly smaller than
  // naively rotating the full-circle proxy bounds.
  it("computes a tighter bounding box for a rotated partial sweep than naively rotating the full-circle proxy bounds", () => {
    const transformedBounds = getArcTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 50,
      start: 90,
      end: 150,
      rotate: 45,
    });

    expect(transformedBounds.x).toBeCloseTo(87.06, 2);
    expect(transformedBounds.y).toBeCloseTo(135.36, 2);
    expect(transformedBounds.width).toBeCloseTo(48.3, 2);
    expect(transformedBounds.height).toBeCloseTo(14.64, 2);

    const naiveProxyBounds = computeTransformedRectangularAABB(
      { x: 50, y: 50, width: 100, height: 100 },
      { rotate: 45 },
    );

    expect(transformedBounds.width).toBeLessThan(naiveProxyBounds.width);
    expect(transformedBounds.height).toBeLessThan(naiveProxyBounds.height);
  });
});
