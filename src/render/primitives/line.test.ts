import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLineTransformedAABB } from "./line";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("line rendering", () => {
  it("draws a straight stroke path between the start and end points", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 10, y: 20 },
          end: { x: 110, y: 220 },
          strokeStyle: "#0a0",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(10, 20);
    expect(mockContext.lineTo).toHaveBeenCalledWith(110, 220);
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it("applies the given strokeStyle and strokeWidth", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 0 },
          strokeStyle: "#f00",
          strokeWidth: 6,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.strokeStyle).toBe("#f00");
    expect(mockContext.lineWidth).toBe(6);
  });

  it("renders a horizontal line", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 50 },
          end: { x: 100, y: 50 },
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(0, 50);
    expect(mockContext.lineTo).toHaveBeenCalledWith(100, 50);
  });

  it("renders a vertical line", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 50, y: 0 },
          end: { x: 50, y: 100 },
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(50, 0);
    expect(mockContext.lineTo).toHaveBeenCalledWith(50, 100);
  });

  it("renders a degenerate (zero-length) line where start and end coincide", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 25, y: 25 },
          end: { x: 25, y: 25 },
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(25, 25);
    expect(mockContext.lineTo).toHaveBeenCalledWith(25, 25);
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it("applies opacity", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
          strokeStyle: "#333",
          opacity: 0.5,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalAlpha).toBe(0.5);
  });

  it("defaults blend mode to source-over when blend is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    mockContext.globalCompositeOperation = "multiply";

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalCompositeOperation).toBe("source-over");
  });

  it("applies blend mode when specified", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
          strokeStyle: "#333",
          blend: "multiply",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalCompositeOperation).toBe("multiply");
  });

  it("applies rotation around the line's own center by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Line from (0,0) to (100,100) has center at (50, 50)
    expect(mockContext.translate).toHaveBeenCalledWith(50, 50);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-50, -50);
  });

  it("does not apply rotation when rotate is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
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

  // LineProps doesn't extend JoinableStrokeStyles -- a single segment has
  // no corners at all, so lineJoin/miterLimit genuinely don't apply here
  // (unlike polygon/bezier, which always have at least one join). It does
  // extend CappableStrokeStyles, though: a line always has two free ends.
  // See stroke-width-aware-bounds-plan.md 4.1.1.
  it("applies the given lineCap to the stroke", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
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
        d.line({
          start: { x: 0, y: 0 },
          end: { x: 100, y: 100 },
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

describe("axis-aligned bounds calculation for line", () => {
  // strokeStyle: "transparent" throughout this block (except the dedicated
  // stroke-width awareness describe below) -- these tests exist to check
  // pure endpoint/rotation/scale geometry, not stroke behaviour, and the
  // framework's real default stroke ("#333", width 1) would otherwise
  // silently pad every one of these by a small, unrelated amount.
  it("returns the exact bounding box of a diagonal line when there is no rotation or scale", () => {
    const transformedBounds = getLineTransformedAABB({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 50 },
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  // A line's fill-geometry AABB is exact by construction (its two
  // endpoints ARE its extrema), so a perfectly horizontal line legitimately
  // reports zero height here -- no artificial minimum is applied.
  it("returns a zero-height bounding box for a perfectly horizontal line", () => {
    const transformedBounds = getLineTransformedAABB({
      start: { x: 0, y: 50 },
      end: { x: 100, y: 50 },
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({ x: 0, y: 50, width: 100, height: 0 });
  });

  it("returns a zero-width bounding box for a perfectly vertical line", () => {
    const transformedBounds = getLineTransformedAABB({
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 },
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({ x: 50, y: 0, width: 0, height: 100 });
  });

  it("computes the diagonal AABB of a line rotated 45 degrees around its centre", () => {
    const transformedBounds = getLineTransformedAABB({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
      rotate: 45,
      strokeStyle: "transparent",
    });

    expect(transformedBounds.x).toBeCloseTo(50.0, 2);
    expect(transformedBounds.y).toBeCloseTo(-20.71, 2);
    expect(transformedBounds.width).toBeCloseTo(0.0, 2);
    expect(transformedBounds.height).toBeCloseTo(141.42, 2);
  });

  it("grows the bounding box uniformly around the line's center for a pure scale", () => {
    const transformedBounds = getLineTransformedAABB({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
      scale: 2,
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({
      x: -50,
      y: -50,
      width: 200,
      height: 200,
    });
  });

  // LineProps has no strokeAlignment (always the "center" case, see plan
  // Section 3) and no lineJoin (a single segment has no corners), so
  // strokeWidth and lineCap are the only relevant inputs.
  describe("stroke-width awareness", () => {
    it("pads the bounding box outward by strokeWidth/2 by default (butt cap)", () => {
      const transformedBounds = getLineTransformedAABB({
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 },
        strokeWidth: 10,
      });

      expect(transformedBounds).toEqual({
        x: -5,
        y: 45,
        width: 110,
        height: 10,
      });
    });

    // A "square" cap extends the stroke past each endpoint along the line's
    // own tangent direction, not just perpendicular to it -- so its corner
    // can reach up to strokeWidth/2 * sqrt(2) from the endpoint (see the
    // plan's step-by-step section for the derivation), exceeding the plain
    // round-pen pad above for some orientations. Applied as a conservative,
    // orientation-independent multiplier, same spirit as the miter
    // overshoot bound for joinable shapes.
    it("uses the conservative sqrt(2) overshoot for a 'square' cap, not the plain round-pen pad", () => {
      const transformedBounds = getLineTransformedAABB({
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 },
        strokeWidth: 10,
        lineCap: "square",
      });

      // (strokeWidth / 2) * sqrt(2) =~ 7.07, not strokeWidth/2 = 5
      expect(transformedBounds.x).toBeCloseTo(-7.07, 2);
      expect(transformedBounds.y).toBeCloseTo(42.93, 2);
      expect(transformedBounds.width).toBeCloseTo(114.14, 2);
      expect(transformedBounds.height).toBeCloseTo(14.14, 2);
    });
  });
});
