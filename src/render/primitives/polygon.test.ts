import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeTransformedRectangularAABB } from "../common";
import { getPolygonTransformedAABB } from "./polygon";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("polygon rendering", () => {
  it("renders sequential line segments from points", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 120, y: 140 },
          ],
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(100, 100);
    expect(mockContext.lineTo).toHaveBeenNthCalledWith(1, 140, 100);
    expect(mockContext.lineTo).toHaveBeenNthCalledWith(2, 120, 140);
    expect(mockContext.closePath).not.toHaveBeenCalled();
  });

  it("closes the polygon when closePath is true", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          closePath: true,
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.closePath).toHaveBeenCalled();
  });

  it("applies strokeAlignment only when the polygon is closed", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "inside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).not.toHaveBeenCalled();
    expect(mockContext.lineWidth).toBe(10);

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          closePath: true,
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "inside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalledWith();
    expect(mockContext.lineWidth).toBe(20);
  });

  it("uses doubled stroke width for inside and outside closed polygons", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          closePath: true,
          strokeStyle: "#333",
          strokeWidth: 8,
          strokeAlignment: "inside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineWidth).toBe(16);

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          closePath: true,
          strokeStyle: "#333",
          strokeWidth: 8,
          strokeAlignment: "outside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineWidth).toBe(16);
  });

  it("keeps original stroke width for open polygons even when strokeAlignment is set", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
          ],
          strokeStyle: "#333",
          strokeWidth: 8,
          strokeAlignment: "outside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineWidth).toBe(8);
    expect(mockContext.clip).not.toHaveBeenCalled();
  });

  it("treats matching first and last points as a closed shape", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 125, y: 150 },
            { x: 100, y: 100 },
          ],
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "outside",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.closePath).toHaveBeenCalled();
    expect(mockContext.clip).toHaveBeenCalledWith("evenodd");
  });

  it("animates numeric point coordinates in the points array", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const initialPoints = [
      { x: 100, y: 100 },
      { x: 140, y: 100 },
      { x: 120, y: 140 },
    ];

    const targetPoints = [
      { x: 120, y: 80 },
      { x: 160, y: 120 },
      { x: 140, y: 160 },
    ];

    const drawAnimatedPolygon = () => {
      drawContext.executeDrawCallback(
        (d) => {
          d.polygon({
            points: initialPoints,
            closePath: true,
            strokeStyle: "#333",
          }).animateTo({ points: targetPoints }, { duration: 1000 });
        },
        mockContext,
        800,
        600,
        0,
      );
    };

    drawAnimatedPolygon();

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: initialPoints,
          closePath: true,
          strokeStyle: "#333",
        }).animateTo({ points: targetPoints }, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      500,
    );

    const moveToCall = vi.mocked(mockContext.moveTo).mock.calls[0];
    const lineToCalls = vi.mocked(mockContext.lineTo).mock.calls;

    expect(moveToCall[0]).toBeCloseTo(110);
    expect(moveToCall[1]).toBeCloseTo(90);

    expect(lineToCalls[0][0]).toBeCloseTo(150);
    expect(lineToCalls[0][1]).toBeCloseTo(110);

    expect(lineToCalls[1][0]).toBeCloseTo(130);
    expect(lineToCalls[1][1]).toBeCloseTo(150);
  });

  // Stroke-width-aware-bounds-plan.md 4.1.1: lineJoin/miterLimit are
  // accepted via JoinableStrokeStyles but not yet read by polygon()'s
  // render function -- expected to fail until that's wired up. Joins
  // happen at every vertex regardless of closePath, so an open polygon is
  // enough to exercise this.
  it("applies the given lineJoin and miterLimit to the stroke", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 120, y: 140 },
          ],
          strokeStyle: "#333",
          lineJoin: "round",
          miterLimit: 4,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineJoin).toBe("round");
    expect(mockContext.miterLimit).toBe(4);
  });

  it("defaults lineJoin and miterLimit to canvas's own native defaults when omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 120, y: 140 },
          ],
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineJoin).toBe("miter");
    expect(mockContext.miterLimit).toBe(10);
  });

  // PolygonProps also extends CappableStrokeStyles: an *open* polygon
  // (closePath: false, the default) has two free ends the lineCap applies
  // to -- a closed polygon has none (every vertex is a join).
  it("applies the given lineCap to the stroke of an open polygon", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 120, y: 140 },
          ],
          strokeStyle: "#333",
          lineCap: "round",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineCap).toBe("round");
  });

  it("defaults lineCap to canvas's own native default when omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon({
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
            { x: 120, y: 140 },
          ],
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.lineCap).toBe("butt");
  });
});

describe("framed clipping for polygon", () => {
  it("supports closed polygon as a clipping frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon(
          {
            points: [
              { x: 100, y: 100 },
              { x: 300, y: 100 },
              { x: 200, y: 280 },
            ],
            closePath: true,
          },
          () => {
            d.circle({ cx: 200, cy: 150, radius: 120, fillStyle: "#00f" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.closePath).toHaveBeenCalled();
    expect(mockContext.ellipse).toHaveBeenCalled();
  });
  it("treats non-closed polygon frame as empty clip region", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.polygon(
          {
            points: [
              { x: 100, y: 100 },
              { x: 300, y: 100 },
              { x: 200, y: 280 },
            ],
            closePath: false,
          },
          () => {
            d.circle({ cx: 200, cy: 150, radius: 120, fillStyle: "#00f" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rect).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(mockContext.clip).toHaveBeenCalled();
  });
});

describe("axis-aligned bounds calculation for polygon", () => {
  // Deliberately not all vertices sit on the local bbox's own corners (only
  // (0,80) and (100,80) do; (50,0) is the midpoint of the bbox's top edge)
  // so a rotation genuinely distinguishes "transform the real vertices" from
  // "transform the bbox proxy's 4 corners".
  const triangle = [
    { x: 50, y: 0 },
    { x: 0, y: 80 },
    { x: 100, y: 80 },
  ];

  it("returns EMPTY_BOUNDS for a degenerate polygon with two or fewer points", () => {
    const transformedBounds = getPolygonTransformedAABB({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  // strokeStyle: "transparent" on these three -- they exist to check pure
  // rotation/scale geometry, not stroke behaviour, and the framework's real
  // default stroke ("#333", width 1) would otherwise silently pad every one
  // of these by a small, unrelated amount.
  it("returns the exact bounding box of a triangle when there is no rotation or scale", () => {
    const transformedBounds = getPolygonTransformedAABB({
      points: triangle,
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it("computes a tighter bounding box for a rotated triangle than naively rotating its corner-bbox proxy", () => {
    const transformedBounds = getPolygonTransformedAABB({
      points: triangle,
      rotate: 45,
      strokeStyle: "transparent",
    });

    expect(transformedBounds.x).toBeCloseTo(-13.64, 2);
    expect(transformedBounds.y).toBeCloseTo(11.72, 2);
    expect(transformedBounds.width).toBeCloseTo(91.92, 2);
    expect(transformedBounds.height).toBeCloseTo(91.92, 2);

    const naiveProxyBounds = computeTransformedRectangularAABB(
      { x: 0, y: 0, width: 100, height: 80 },
      { rotate: 45 },
    );

    expect(transformedBounds.width).toBeLessThan(naiveProxyBounds.width);
  });

  it("grows the bounding box uniformly around the triangle's center for a pure scale", () => {
    const transformedBounds = getPolygonTransformedAABB({
      points: triangle,
      scale: 2,
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({
      x: -50,
      y: -40,
      width: 200,
      height: 160,
    });
  });

  // Breaking suite for stroke-width-aware-bounds-plan.md Phase 2 -- none of
  // this is implemented yet, so every test below is expected to FAIL until
  // Phase 2 lands. Uses the closed `triangle` from above (tight fill bbox
  // {x:0,y:0,width:100,height:80}) throughout.
  describe("stroke-width awareness (Phase 2 -- not yet implemented)", () => {
    // lineJoin: "round" explicitly on these first three -- DEFAULT_STROKE_
    // LINE_JOIN is "miter", so omitting it would silently exercise the
    // miter path (with a real, if gentle, corner on this triangle) instead
    // of the plain round-pen padding these three are meant to isolate.
    it("pads the bounding box outward by strokeWidth/2 by default (center alignment, round/bevel join)", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        lineJoin: "round",
      });

      expect(transformedBounds).toEqual({
        x: -5,
        y: -5,
        width: 110,
        height: 90,
      });
    });

    it("does not pad the bounding box when strokeAlignment is 'inside' -- the interior clip removes the outward half regardless of join style", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        strokeAlignment: "inside",
      });

      expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    });

    it("pads the bounding box outward by the full strokeWidth when strokeAlignment is 'outside'", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        strokeAlignment: "outside",
        lineJoin: "round",
      });

      expect(transformedBounds).toEqual({
        x: -10,
        y: -10,
        width: 120,
        height: 100,
      });
    });

    // A closed polygon's vertices are real corners (see plan 4.1.1), so a
    // miter join can overshoot the plain round-pen padding above. Polygon
    // now computes the EXACT per-vertex miter tip (not a conservative
    // worst-case bound) the same way arc does: at each vertex, the real
    // angle between its two edges (each measured pointing AWAY from the
    // vertex, not one arriving and one departing -- see arc.ts's
    // getMiterTipLocal for why that distinction matters) is fully known,
    // so (strokeWidth/2)/sin(theta/2) -- capped at the bevel-fallback
    // threshold strokeWidth*miterLimit -- gives a tight bound instead of
    // always assuming the sharpest angle miterLimit would still honor.
    // Verified by hand for two of the three vertices: the apex (50,0) has
    // interior angle ~64.0 degrees, miterLength = (strokeWidth/2)/
    // sin(32deg) =~ 9.43, dominating the y-extent (pushing y from 0 down to
    // ~-9.43); base vertex (0,80) has interior angle ~58.0 degrees,
    // miterLength =~ 10.31, dominating the x-extent (pushing x from 0 to
    // ~-9.02, and by symmetry the other base vertex pushes maxX out by the
    // same amount on the right).
    it("uses the exact per-vertex miter tip for a mitered closed polygon, not the plain round-pen padding", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        lineJoin: "miter",
        miterLimit: 5,
      });

      expect(transformedBounds.x).toBeCloseTo(-9.02, 1);
      expect(transformedBounds.y).toBeCloseTo(-9.43, 1);
      expect(transformedBounds.width).toBeCloseTo(118.04, 1);
      expect(transformedBounds.height).toBeCloseTo(94.43, 1);
    });

    // polygon/bezier's "outside" alignment strokes at strokeWidth*2 (native)
    // and clips away the inward half -- so a mitered "outside" corner's
    // exact reach uses the DOUBLED width in the same formula:
    // ((strokeWidth*2)/2)/sin(theta/2) = strokeWidth/sin(theta/2), twice
    // the "center" case's reach for the same nominal strokeWidth and angle.
    // This is the plan's most important gotcha for this family -- an
    // implementation that reuses the "center" formula for every alignment
    // would under-report here.
    it("doubles the exact miter reach for a mitered 'outside' polygon, since outside alignment strokes at 2x the nominal strokeWidth", () => {
      const centerBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        lineJoin: "miter",
        miterLimit: 5,
      });
      const outsideBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        strokeAlignment: "outside",
        lineJoin: "miter",
        miterLimit: 5,
      });

      // Round-pen baseline is strokeWidth further out on every side than
      // center's, AND each vertex's own miter reach is doubled on top of
      // that (angles are unchanged by strokeWidth, only the reach scales).
      expect(outsideBounds.y).toBeLessThan(centerBounds.y);
      expect(outsideBounds.x).toBeCloseTo(-18.04, 1);
      expect(outsideBounds.y).toBeCloseTo(-18.87, 1);
      expect(outsideBounds.width).toBeCloseTo(136.08, 1);
      expect(outsideBounds.height).toBeCloseTo(108.87, 1);
    });
  });
});
