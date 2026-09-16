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

  it("returns the exact bounding box of a triangle when there is no rotation or scale", () => {
    const transformedBounds = getPolygonTransformedAABB({ points: triangle });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it("computes a tighter bounding box for a rotated triangle than naively rotating its corner-bbox proxy", () => {
    const transformedBounds = getPolygonTransformedAABB({
      points: triangle,
      rotate: 45,
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
    });

    expect(transformedBounds).toEqual({
      x: -50,
      y: -40,
      width: 200,
      height: 160,
    });
  });
});
