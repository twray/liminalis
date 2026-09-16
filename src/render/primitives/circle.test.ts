import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCircleTransformedAABB } from "./circle";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("circle rendering", () => {
  it("draws a full circle via ellipse() with matching radiusX/radiusY", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({ cx: 100, cy: 100, radius: 50, strokeStyle: "#333" });
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
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("does not render when radius is zero or negative", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({ cx: 100, cy: 100, radius: 0, strokeStyle: "#333" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.ellipse).not.toHaveBeenCalled();
  });

  it("does not draw a fill when fillStyle is transparent", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 100,
          cy: 100,
          radius: 50,
          fillStyle: "transparent",
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fill).not.toHaveBeenCalled();
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it("draws stroke at original radius when strokeAlignment is 'center' (default)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 200,
          cy: 200,
          radius: 50,
          strokeStyle: "#333",
          strokeWidth: 10,
          strokeAlignment: "center",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Both fill and stroke should use original radius (50)
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      200,
      200,
      50,
      50,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("draws stroke with reduced radius when strokeAlignment is 'inside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 200,
          cy: 200,
          radius: 50,
          fillStyle: "#333",
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

    // Fill uses original radius (50)
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      200,
      200,
      50,
      50,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
    // Stroke should use radius - strokeWidth/2 = 50 - 5 = 45
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      200,
      200,
      45,
      45,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("draws stroke with increased radius when strokeAlignment is 'outside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 200,
          cy: 200,
          radius: 50,
          fillStyle: "#333",
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

    // Fill uses original radius (50)
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      200,
      200,
      50,
      50,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
    // Stroke should use radius + strokeWidth/2 = 50 + 5 = 55
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      200,
      200,
      55,
      55,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("applies rotation around center by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 100,
          cy: 100,
          radius: 50,
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Circle center is already (100, 100), center of bounding box is same
    expect(mockContext.translate).toHaveBeenCalledWith(100, 100);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-100, -100);
  });

  it("does not apply rotation when rotate is 0", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 100,
          cy: 100,
          radius: 50,
          rotate: 0,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // No rotation should be applied
    expect(mockContext.rotate).not.toHaveBeenCalled();
  });

  it("does not apply rotation when rotate is undefined", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({
          cx: 100,
          cy: 100,
          radius: 50,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rotate).not.toHaveBeenCalled();
  });

  it("applies blend mode from withStyles context", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.withStyles({ blend: "multiply" }, () => {
          d.circle({ cx: 100, cy: 100, radius: 30 });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalCompositeOperation).toBe("multiply");
  });

  it("allows shape blend to override withStyles blend", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.withStyles({ blend: "multiply" }, () => {
          d.circle({
            cx: 100,
            cy: 100,
            radius: 30,
            blend: "screen",
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalCompositeOperation).toBe("screen");
  });

  // lineJoin/miterLimit/lineCap intentionally don't apply here: circle has
  // no corners (JoinableStrokeStyles) and no open ends (CappableStrokeStyles)
  // -- CircleProps doesn't extend either, so there's nothing to test. See
  // stroke-width-aware-bounds-plan.md 4.1.1.
});

describe("framed clipping for circle", () => {
  it("supports circle as a clipping frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.circle({ cx: 200, cy: 200, radius: 100 }, () => {
          d.line({
            start: { x: 0, y: 0 },
            end: { x: 400, y: 400 },
            strokeStyle: "#f00",
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.arc).toHaveBeenCalledWith(200, 200, 100, 0, Math.PI * 2);
    expect(mockContext.lineTo).toHaveBeenCalledWith(400, 400);
  });
});

describe("axis-aligned bounds calculation for circle", () => {
  it("returns EMPTY_BOUNDS for an invalid (non-positive) radius", () => {
    const transformedBounds = getCircleTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 0,
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("returns the full untransformed bounds when there is no rotation or scale", () => {
    const transformedBounds = getCircleTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 50,
    });

    expect(transformedBounds).toEqual({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
  });

  it("is rotation-invariant when rotated about its own center", () => {
    const transformedBounds = getCircleTransformedAABB({
      cx: 150,
      cy: 150,
      radius: 50,
      rotate: 45,
    });

    expect(transformedBounds.x).toBeCloseTo(100, 2);
    expect(transformedBounds.y).toBeCloseTo(100, 2);
    expect(transformedBounds.width).toBeCloseTo(100, 2);
    expect(transformedBounds.height).toBeCloseTo(100, 2);
  });

  it("produces an axis-aligned ellipse bounding box when scaled non-uniformly", () => {
    const transformedBounds = getCircleTransformedAABB({
      cx: 100,
      cy: 100,
      radius: 40,
      scaleX: 2,
      scaleY: 1,
    });

    expect(transformedBounds.x).toBeCloseTo(20, 2);
    expect(transformedBounds.y).toBeCloseTo(60, 2);
    expect(transformedBounds.width).toBeCloseTo(160, 2);
    expect(transformedBounds.height).toBeCloseTo(80, 2);
  });
});
