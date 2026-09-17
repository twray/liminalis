import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEllipseTransformedAABB } from "./ellipse";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("ellipse rendering", () => {
  it("draws a full ellipse with independently-sized radiusX and radiusY", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
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
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("does not render when either radius is zero or negative", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 0,
          strokeStyle: "#333",
        });
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
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
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

  it("draws stroke at original radii when strokeAlignment is 'center' (default)", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 300,
          cy: 200,
          radiusX: 80,
          radiusY: 40,
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

    expect(mockContext.ellipse).toHaveBeenCalledWith(
      300,
      200,
      80,
      40,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("draws stroke with reduced radii when strokeAlignment is 'inside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 300,
          cy: 200,
          radiusX: 80,
          radiusY: 40,
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

    // Fill uses original radii.
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      300,
      200,
      80,
      40,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );

    // Stroke radii are reduced by strokeWidth/2 per axis.
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      300,
      200,
      75,
      35,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );
  });

  it("draws stroke with increased radii when strokeAlignment is 'outside'", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 300,
          cy: 200,
          radiusX: 80,
          radiusY: 40,
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

    // Fill uses original radii.
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      300,
      200,
      80,
      40,
      0,
      -Math.PI / 2,
      (Math.PI * 3) / 2,
    );

    // Stroke radii are increased by strokeWidth/2 per axis.
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      300,
      200,
      85,
      45,
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
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
          strokeStyle: "#333",
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.translate).toHaveBeenCalledWith(150, 120);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-150, -120);
  });

  it("does not apply rotation when rotate is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
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

  it("applies blend mode when specified", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({
          cx: 150,
          cy: 120,
          radiusX: 90,
          radiusY: 40,
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

  // lineJoin/miterLimit/lineCap intentionally don't apply here: ellipse has
  // no corners (JoinableStrokeStyles) and no open ends (CappableStrokeStyles)
  // -- EllipseProps doesn't extend either, so there's nothing to test. See
  // stroke-width-aware-bounds-plan.md 4.1.1.
});

describe("framed clipping for ellipse", () => {
  it("supports ellipse as a clipping frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.ellipse({ cx: 250, cy: 220, radiusX: 120, radiusY: 80 }, () => {
          d.line({
            start: { x: 0, y: 220 },
            end: { x: 500, y: 220 },
            strokeStyle: "#0f0",
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.ellipse).toHaveBeenCalledWith(
      250,
      220,
      120,
      80,
      0,
      0,
      Math.PI * 2,
    );
    expect(mockContext.lineTo).toHaveBeenCalledWith(500, 220);
  });
});

describe("axis-aligned bounds calculation for ellipse", () => {
  it("returns EMPTY_BOUNDS when either radius is invalid (non-positive)", () => {
    const transformedBounds = getEllipseTransformedAABB({
      cx: 100,
      cy: 100,
      radiusX: 40,
      radiusY: 0,
    });

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  // strokeStyle: "transparent" throughout this block (except the dedicated
  // stroke-width awareness describe below) -- these tests exist to check
  // pure rotation/scale geometry, not stroke behaviour, and the framework's
  // real default stroke ("#333", width 1) would otherwise silently pad
  // every one of these by a small, unrelated amount.
  it("returns the full untransformed bounds when there is no rotation or scale", () => {
    const transformedBounds = getEllipseTransformedAABB({
      cx: 100,
      cy: 100,
      radiusX: 40,
      radiusY: 20,
      strokeStyle: "transparent",
    });

    expect(transformedBounds).toEqual({
      x: 60,
      y: 80,
      width: 80,
      height: 40,
    });
  });

  // A genuine (non-circular) ellipse rotated 45 degrees, checked against the
  // hand-derived row-norm formula for a full sweep (see
  // common.test.ts's computeTransformedEllipticalAABB suite).
  it("computes the row-norm bounding box for a rotated true ellipse", () => {
    const transformedBounds = getEllipseTransformedAABB({
      cx: 100,
      cy: 100,
      radiusX: 40,
      radiusY: 20,
      rotate: 45,
      strokeStyle: "transparent",
    });

    expect(transformedBounds.x).toBeCloseTo(68.38, 2);
    expect(transformedBounds.y).toBeCloseTo(68.38, 2);
    expect(transformedBounds.width).toBeCloseTo(63.25, 2);
    expect(transformedBounds.height).toBeCloseTo(63.25, 2);
  });

  it("scales each radius independently along its own axis", () => {
    const transformedBounds = getEllipseTransformedAABB({
      cx: 100,
      cy: 100,
      radiusX: 40,
      radiusY: 20,
      scaleX: 2,
      scaleY: 1.5,
      strokeStyle: "transparent",
    });

    expect(transformedBounds.x).toBeCloseTo(20, 2);
    expect(transformedBounds.y).toBeCloseTo(70, 2);
    expect(transformedBounds.width).toBeCloseTo(160, 2);
    expect(transformedBounds.height).toBeCloseTo(60, 2);
  });

  // Breaking suite for stroke-width-aware-bounds-plan.md Phase 2 -- none of
  // this is implemented yet, so the "center"/"outside" cases below are
  // expected to FAIL until Phase 2 lands. EllipseProps has no lineJoin or
  // lineCap (see the plan's 4.1.1 table), so strokeWidth + strokeAlignment
  // are the only inputs that matter here.
  describe("stroke-width awareness (Phase 2 -- not yet implemented)", () => {
    it("inflates each radius outward by strokeWidth/2 by default (center alignment)", () => {
      const transformedBounds = getEllipseTransformedAABB({
        cx: 100,
        cy: 100,
        radiusX: 40,
        radiusY: 20,
        strokeWidth: 10,
      });

      expect(transformedBounds).toEqual({
        x: 55,
        y: 75,
        width: 90,
        height: 50,
      });
    });

    it("does not inflate either radius when strokeAlignment is 'inside'", () => {
      const transformedBounds = getEllipseTransformedAABB({
        cx: 100,
        cy: 100,
        radiusX: 40,
        radiusY: 20,
        strokeWidth: 10,
        strokeAlignment: "inside",
      });

      expect(transformedBounds).toEqual({
        x: 60,
        y: 80,
        width: 80,
        height: 40,
      });
    });

    it("inflates each radius outward by the full strokeWidth when strokeAlignment is 'outside'", () => {
      const transformedBounds = getEllipseTransformedAABB({
        cx: 100,
        cy: 100,
        radiusX: 40,
        radiusY: 20,
        strokeWidth: 10,
        strokeAlignment: "outside",
      });

      expect(transformedBounds).toEqual({
        x: 50,
        y: 70,
        width: 100,
        height: 60,
      });
    });
  });
});
