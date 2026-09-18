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

    // Open shape: strokeAlignment is silently ignored, same as "center".
    expect(mockContext.moveTo).toHaveBeenCalledWith(100, 100);
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

    // Closed shape: points are actually offset inward -- verified by hand
    // (vertex (100,100)'s own corner angle is ~63.43 degrees, giving an
    // offset distance of (strokeWidth/2)/sin(31.72deg) =~ 9.512 along its
    // bisector). lineWidth stays the real strokeWidth; no clip involved.
    expect(mockContext.moveTo).toHaveBeenCalledWith(108.09016994374947, 105);
    expect(mockContext.lineWidth).toBe(10);
  });

  // This is the actual fix from stroke-alignment-geometric-offset-plan.md:
  // previously, "inside"/"outside" doubled the native lineWidth and relied
  // on a clip to hide the wrong half, which cut through the middle of each
  // join's real shape instead of along its true outward boundary --
  // visibly clipping/flattening every join. Both alignments now stroke the
  // real (undoubled) strokeWidth against a genuinely offset path instead,
  // with no clip at all -- fixing every join style, not just miter.
  it("no longer clips or doubles the stroke width for inside and outside closed polygons -- offsets the path instead", async () => {
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

    expect(mockContext.lineWidth).toBe(8);
    expect(mockContext.clip).not.toHaveBeenCalled();

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

    expect(mockContext.lineWidth).toBe(8);
    expect(mockContext.clip).not.toHaveBeenCalled();
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

  // The repeated closing point is the SAME ring vertex as the first one,
  // not a second distinct corner -- both must resolve to the same,
  // correctly-computed offset (not the degenerate "left unmoved" result a
  // naive per-index offset would give that vertex, seeing a zero-length
  // edge back to its own duplicate).
  it("treats matching first and last points as a closed shape, offsetting both copies identically", async () => {
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
    expect(mockContext.clip).not.toHaveBeenCalled();
    expect(mockContext.moveTo).toHaveBeenCalledWith(91.90983005625053, 95);
    expect(mockContext.lineTo).toHaveBeenLastCalledWith(91.90983005625053, 95);
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

    // No clip involved any more (see stroke-alignment-geometric-offset-
    // plan.md) -- this now holds for an exact algebraic reason instead: the
    // vertex is offset inward by L = (strokeWidth/2)/sin(theta/2) along its
    // bisector, then a "miter" join on that offset path (default lineJoin,
    // not overridden here) extends back outward by the SAME L along the
    // SAME bisector (identical theta and wedge direction, since a true
    // parallel offset preserves edge directions exactly) -- landing
    // exactly back on the original vertex, not past it. This is a
    // genuinely tighter guarantee than arc's "inside" case, whose radius-
    // shrink is only an approximation of a true offset and can overshoot.
    it("returns exactly the original bounds when strokeAlignment is 'inside' -- the inward offset and the outward miter reach cancel exactly", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        strokeAlignment: "inside",
      });

      expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    });

    // Since stroke-alignment-geometric-offset-plan.md landed, "outside" no
    // longer means "pad the ORIGINAL points by strokeWidth" -- it means
    // "actually offset the points outward by strokeWidth/2 first" (a true
    // parallel offset, reaching (strokeWidth/2)/sin(theta/2) from each
    // original vertex along its own bisector -- already MORE than a flat
    // strokeWidth/2 for any real corner), THEN pad THAT offset shape by
    // the plain round-pen strokeWidth/2. The two steps compound, so the
    // real reach from the original points is now correctly larger than
    // the simple old approximation -- which is the whole point of the fix:
    // the old, smaller number under-estimated how far the (now correctly
    // sharp-cornered) offset path actually reaches, which is exactly what
    // caused the reported clipping bug. Verified independently by hand:
    // offset points are (50,-9.43), (-9.02,85), (109.02,85); their own
    // tight bbox padded by 5 more (strokeWidth/2) gives the values below.
    it("pads the bounding box outward from the offset (not original) points when strokeAlignment is 'outside'", () => {
      const transformedBounds = getPolygonTransformedAABB({
        points: triangle,
        closePath: true,
        strokeWidth: 10,
        strokeAlignment: "outside",
        lineJoin: "round",
      });

      expect(transformedBounds.x).toBeCloseTo(-14.02, 1);
      expect(transformedBounds.y).toBeCloseTo(-14.43, 1);
      expect(transformedBounds.width).toBeCloseTo(128.04, 1);
      expect(transformedBounds.height).toBeCloseTo(104.43, 1);
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

    // No more doubled nativeStrokeWidth (see stroke-alignment-geometric-
    // offset-plan.md) -- the same final numbers now fall out of composing
    // two real, undoubled offsets instead: the vertex first moves outward
    // by L = (strokeWidth/2)/sin(theta/2) (the offset step), then a miter
    // join on THAT offset path extends outward by the same L again (same
    // theta and wedge direction as the original vertex, since a true
    // parallel offset preserves edge directions exactly) -- two
    // displacements of L in the same direction compose to exactly 2L, the
    // same total reach the old "doubled nativeStrokeWidth" formula gave.
    // Still the plan's most important gotcha for this family, just via a
    // different (now correct-by-construction, not a special case)
    // mechanism -- an implementation that reused the "center" formula for
    // every alignment would still under-report "outside" here.
    it("reaches twice the 'center' miter distance for a mitered 'outside' polygon, via composing two real offsets", () => {
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
