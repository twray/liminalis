import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeTransformedMultipointAABB } from "../common";
import type {
  BezierCurveSegment,
  BezierProps,
  CubicBezierSegment,
  QuadraticBezierSegment,
} from "../types";
import {
  getBezierTransformedAABB,
  getTightBezierBounds,
  getTightSegmentBounds,
} from "./bezier";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

// An upward arch: the control point (50,100) bulges well above the curve
// itself, which -- per the quadratic Bezier formula -- only ever reaches
// half that height (peaking at y=50 when t=0.5). A loose control-point hull
// bbox would (wrongly) report height 100; the tight bbox is 50.
const archStart = { x: 0, y: 0 };
const archSegment: QuadraticBezierSegment = {
  control: { x: 50, y: 100 },
  point: { x: 100, y: 0 },
};

// A "wiggle": the curve bulges up past y=0, then down below it, then back
// up to its endpoint, via two interior critical points on the y-axis --
// the genuine two-real-root case for a cubic's derivative quadratic (unlike
// the arch above, which only ever has one critical point per axis).
const wiggleStart = { x: 0, y: 0 };
const wiggleSegment: CubicBezierSegment = {
  control: [
    { x: 50, y: 100 },
    { x: 50, y: -100 },
  ],
  point: { x: 100, y: 0 },
};

describe("bezier rendering", () => {
  it("renders quadratic and cubic bezier segments in sequence", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            {
              point: { x: 100, y: 120 },
            },
            {
              control: { x: 140, y: 80 },
              point: { x: 180, y: 120 },
            },
            {
              control: [
                { x: 220, y: 160 },
                { x: 260, y: 60 },
              ],
              point: { x: 300, y: 120 },
            },
          ],
          fillStyle: "transparent",
          strokeStyle: "#333",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalledWith(100, 120);
    expect(mockContext.quadraticCurveTo).toHaveBeenCalledWith(
      140,
      80,
      180,
      120,
    );
    expect(mockContext.bezierCurveTo).toHaveBeenCalledWith(
      220,
      160,
      260,
      60,
      300,
      120,
    );
    expect(mockContext.closePath).not.toHaveBeenCalled();
  });

  it("ignores bezier input when the first segment includes control points", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        const invalidBezierInput = {
          segments: [
            {
              control: { x: 140, y: 80 },
              point: { x: 180, y: 120 },
            },
            {
              control: { x: 220, y: 90 },
              point: { x: 260, y: 140 },
            },
          ],
          fillStyle: "transparent",
          strokeStyle: "#333",
        } as unknown as Parameters<typeof d.bezier>[0];

        d.bezier(invalidBezierInput);
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).not.toHaveBeenCalled();
    expect(mockContext.quadraticCurveTo).not.toHaveBeenCalled();
    expect(mockContext.bezierCurveTo).not.toHaveBeenCalled();
  });

  it("closes the bezier shape when closePath is true", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            {
              point: { x: 100, y: 120 },
            },
            {
              control: { x: 140, y: 80 },
              point: { x: 180, y: 120 },
            },
          ],
          closePath: true,
          fillStyle: "transparent",
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

  it("applies strokeAlignment only when the bezier shape is closed", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            {
              point: { x: 100, y: 120 },
            },
            {
              control: { x: 140, y: 80 },
              point: { x: 180, y: 120 },
            },
          ],
          fillStyle: "transparent",
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
        d.bezier({
          segments: [
            {
              point: { x: 100, y: 120 },
            },
            {
              control: { x: 140, y: 80 },
              point: { x: 180, y: 120 },
            },
          ],
          closePath: true,
          fillStyle: "transparent",
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

  it("treats matching start and end points as a closed bezier shape", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            {
              point: { x: 100, y: 120 },
            },
            {
              control: { x: 140, y: 80 },
              point: { x: 100, y: 120 },
            },
          ],
          fillStyle: "transparent",
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
    expect(mockContext.lineWidth).toBe(20);
  });

  it("animates start, control, and end points on bezier segments", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const initialPath: Pick<BezierProps, "segments"> = {
      segments: [
        {
          point: { x: 100, y: 100 },
        },
        {
          control: { x: 120, y: 60 },
          point: { x: 160, y: 100 },
        },
        {
          control: [
            { x: 190, y: 140 },
            { x: 230, y: 60 },
          ],
          point: { x: 260, y: 100 },
        },
      ],
    };

    const targetPath: Pick<BezierProps, "segments"> = {
      segments: [
        {
          point: { x: 120, y: 90 },
        },
        {
          control: { x: 150, y: 40 },
          point: { x: 180, y: 120 },
        },
        {
          control: [
            { x: 220, y: 170 },
            { x: 260, y: 80 },
          ],
          point: { x: 290, y: 130 },
        },
      ],
    };

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          ...initialPath,
          fillStyle: "transparent",
          strokeStyle: "#333",
        }).animateTo(targetPath, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      0,
    );

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          ...initialPath,
          fillStyle: "transparent",
          strokeStyle: "#333",
        }).animateTo(targetPath, { duration: 1000 });
      },
      mockContext,
      800,
      600,
      500,
    );

    const moveToCall = vi.mocked(mockContext.moveTo).mock.calls[0];
    const quadraticCurveCall = vi.mocked(mockContext.quadraticCurveTo).mock
      .calls[0];
    const cubicCurveCall = vi.mocked(mockContext.bezierCurveTo).mock.calls[0];

    expect(moveToCall[0]).toBeCloseTo(110);
    expect(moveToCall[1]).toBeCloseTo(95);

    expect(quadraticCurveCall[0]).toBeCloseTo(135);
    expect(quadraticCurveCall[1]).toBeCloseTo(50);
    expect(quadraticCurveCall[2]).toBeCloseTo(170);
    expect(quadraticCurveCall[3]).toBeCloseTo(110);

    expect(cubicCurveCall[0]).toBeCloseTo(205);
    expect(cubicCurveCall[1]).toBeCloseTo(155);
    expect(cubicCurveCall[2]).toBeCloseTo(245);
    expect(cubicCurveCall[3]).toBeCloseTo(70);
    expect(cubicCurveCall[4]).toBeCloseTo(275);
    expect(cubicCurveCall[5]).toBeCloseTo(115);
  });

  it("draws a fill pass when fillStyle is set, and skips it when transparent", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const segments: BezierProps["segments"] = [
      { point: { x: 0, y: 0 } },
      { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
    ];

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({ segments, fillStyle: "#0f0", strokeStyle: "transparent" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fill).toHaveBeenCalled();
    expect(mockContext.stroke).not.toHaveBeenCalled();

    vi.clearAllMocks();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments,
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

  it("applies rotation around the curve's own tight-bbox center by default", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
          ],
          strokeStyle: "#333",
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
  });

  it("does not apply rotation when rotate is omitted", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
          ],
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
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
          ],
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

  // Stroke-width-aware-bounds-plan.md 4.1.1: lineJoin/miterLimit are
  // accepted via JoinableStrokeStyles but not yet read by bezier()'s
  // render function -- expected to fail until that's wired up.
  it("applies the given lineJoin and miterLimit to the stroke", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
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
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
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

  // BezierProps also extends CappableStrokeStyles: an *open* curve
  // (closePath: false, the default) has two free ends the lineCap applies
  // to -- a closed one has none (every segment boundary is a join).
  it("applies the given lineCap to the stroke of an open bezier", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
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
        d.bezier({
          segments: [
            { point: { x: 0, y: 0 } },
            { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
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

describe("framed clipping for bezier", () => {
  it("supports closed bezier as a clipping frame", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier(
          {
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
              {
                control: { x: 220, y: 160 },
                point: { x: 100, y: 120 },
              },
            ],
          },
          () => {
            d.circle({ cx: 150, cy: 120, radius: 60, fillStyle: "#00f" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.clip).toHaveBeenCalled();
    expect(mockContext.quadraticCurveTo).toHaveBeenCalled();
    expect(mockContext.closePath).toHaveBeenCalled();
    expect(mockContext.ellipse).toHaveBeenCalled();
  });
  it("treats non-closed bezier frame as empty clip region", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.bezier(
          {
            segments: [
              {
                point: { x: 100, y: 120 },
              },
              {
                control: { x: 140, y: 80 },
                point: { x: 180, y: 120 },
              },
            ],
            closePath: false,
          },
          () => {
            d.circle({ cx: 150, cy: 120, radius: 60, fillStyle: "#00f" });
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

describe("axis-aligned bounds calculation for bezier", () => {
  describe("getTightSegmentBounds", () => {
    it("computes the tight bbox of a quadratic segment, strictly smaller than its control-point hull", () => {
      const tightBounds = getTightSegmentBounds(archStart, archSegment);

      expect(tightBounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
      // Loose control-hull bbox for this segment would be height 100 (from
      // control.y=100, which the curve itself never reaches).
      expect(tightBounds.height).toBeLessThan(100);
    });

    it("computes the tight bbox of a cubic segment via both real roots of its derivative, strictly smaller than its control-point hull", () => {
      const tightBounds = getTightSegmentBounds(wiggleStart, wiggleSegment);

      expect(tightBounds.x).toBeCloseTo(0, 2);
      expect(tightBounds.y).toBeCloseTo(-28.87, 2);
      expect(tightBounds.width).toBeCloseTo(100, 2);
      expect(tightBounds.height).toBeCloseTo(57.74, 2);
      // Loose control-hull bbox for this segment would be height 200 (control
      // points range from y=-100 to y=100).
      expect(tightBounds.height).toBeLessThan(200);
    });
  });

  describe("getTightBezierBounds", () => {
    // Chains the two segments above end-to-end: the quadratic arch from
    // (0,0)->(100,0) [peaking at y=50], then the cubic wiggle continuing from
    // (100,0)->(200,0) [ranging y -28.87..28.87]. Exercises the union step --
    // the final bbox's y-max comes from segment 1, its y-min from segment 2.
    const multiSegmentStart = { x: 0, y: 0 };
    const multiSegmentCurve: BezierCurveSegment[] = [
      { control: { x: 50, y: 100 }, point: { x: 100, y: 0 } },
      {
        control: [
          { x: 150, y: 100 },
          { x: 150, y: -100 },
        ],
        point: { x: 200, y: 0 },
      },
    ];

    it("unions each segment's own tight bbox across a multi-segment path mixing quadratic and cubic segments", () => {
      const tightBounds = getTightBezierBounds(
        multiSegmentStart,
        multiSegmentCurve,
      );

      expect(tightBounds.x).toBeCloseTo(0, 2);
      expect(tightBounds.y).toBeCloseTo(-28.87, 2);
      expect(tightBounds.width).toBeCloseTo(200, 2);
      expect(tightBounds.height).toBeCloseTo(78.87, 2);
      // Loose control-point hull bbox across the whole path would be height
      // 200 (y ranges -100..100 across both segments' control points).
      expect(tightBounds.height).toBeLessThan(200);
    });
  });

  describe("getBezierTransformedAABB", () => {
    const archProps: BezierProps = {
      segments: [{ point: archStart }, archSegment],
    };

    const wiggleProps: BezierProps = {
      segments: [{ point: wiggleStart }, wiggleSegment],
    };

    // strokeStyle: "transparent" on these and the next two rotation tests --
    // they exist to check pure fill/rotation geometry, not stroke
    // behaviour, and the framework's real default stroke ("#333", width 1)
    // would otherwise silently pad every one of these by a small, unrelated
    // amount.
    it("returns the tight untransformed bounds when there is no rotation or scale", () => {
      const transformedBounds = getBezierTransformedAABB({
        ...archProps,
        strokeStyle: "transparent",
      });

      expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });

    it("returns the tight untransformed bounds when rotation and scale are at default values", () => {
      const transformedBounds = getBezierTransformedAABB({
        ...archProps,
        rotate: 0,
        scale: 1,
        strokeStyle: "transparent",
      });

      expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    });

    // The most direct proof of Step 6: relocating the ORIGINAL curve's own
    // critical points (t=0, t=0.5, t=1) after rotating them -- rather than
    // rotating the control points and re-deriving fresh critical points on
    // the rotated curve -- misses the rotated curve's true x-minimum (at
    // t=0.25) and y-maximum (at t=0.75) entirely, since neither survives the
    // 45 degree rotation at the same parameter value. The naive relocation
    // is computed live below via computeTransformedMultipointAABB (the
    // correct tool for actual fixed vertices -- but the curve's extrema are
    // not fixed vertices, they move under rotation, which is exactly why
    // reusing it here is the bug).
    it("computes the true tight bbox of a rotated quadratic segment, not the naive relocation of its untransformed critical points", () => {
      const transformedBounds = getBezierTransformedAABB({
        ...archProps,
        rotate: 45,
        strokeStyle: "transparent",
      });

      expect(transformedBounds.x).toBeCloseTo(23.48, 2);
      expect(transformedBounds.y).toBeCloseTo(-28.03, 2);
      expect(transformedBounds.width).toBeCloseTo(79.55, 2);
      expect(transformedBounds.height).toBeCloseTo(79.55, 2);

      const naiveRelocatedBounds = computeTransformedMultipointAABB(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 50 },
        ],
        { rotate: 45 },
      );

      expect(transformedBounds.width).toBeGreaterThan(
        naiveRelocatedBounds.width,
      );
      expect(transformedBounds.height).toBeGreaterThan(
        naiveRelocatedBounds.height,
      );
    });

    it("computes the true tight bbox of a rotated cubic segment, not the naive relocation of its untransformed critical points", () => {
      const transformedBounds = getBezierTransformedAABB({
        ...wiggleProps,
        rotate: 45,
        strokeStyle: "transparent",
      });

      expect(transformedBounds.x).toBeCloseTo(8.92, 2);
      expect(transformedBounds.y).toBeCloseTo(-35.36, 2);
      expect(transformedBounds.width).toBeCloseTo(82.16, 2);
      expect(transformedBounds.height).toBeCloseTo(70.71, 2);

      const naiveRelocatedBounds = computeTransformedMultipointAABB(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 74.05626121623442, y: -28.867513459481287 },
          { x: 25.943738783765593, y: 28.867513459481287 },
        ],
        { rotate: 45 },
      );

      expect(transformedBounds.width).toBeGreaterThan(
        naiveRelocatedBounds.width,
      );
      expect(transformedBounds.x).toBeLessThan(naiveRelocatedBounds.x);
    });

    // Breaking suite for stroke-width-aware-bounds-plan.md Phase 2 -- none of
    // this is implemented yet, so every test below is expected to FAIL until
    // Phase 2 lands. Uses `archProps` from above (closed via closePath: true,
    // tight fill bbox {x:0,y:0,width:100,height:50}) -- closing a single
    // curve segment still creates two real corners (curve-end-meets-chord,
    // chord-meets-curve-start), the same "one curve + implicit closing chord"
    // shape as a closed arc's chord seam.
    describe("stroke-width awareness", () => {
      // lineJoin: "round" explicit here -- DEFAULT_STROKE_LINE_JOIN is
      // "miter", so omitting it would silently exercise the miter path
      // (this closed arch has a real corner where the curve meets its
      // closing chord) instead of the plain round-pen padding this test is
      // meant to isolate.
      it("pads the bounding box outward by strokeWidth/2 by default (center alignment, round/bevel join)", () => {
        const transformedBounds = getBezierTransformedAABB({
          ...archProps,
          closePath: true,
          strokeWidth: 10,
          lineJoin: "round",
        });

        expect(transformedBounds).toEqual({
          x: -5,
          y: -5,
          width: 110,
          height: 60,
        });
      });

      it("does not pad the bounding box when strokeAlignment is 'inside' -- the interior clip removes the outward half regardless of join style", () => {
        const transformedBounds = getBezierTransformedAABB({
          ...archProps,
          closePath: true,
          strokeWidth: 10,
          strokeAlignment: "inside",
        });

        expect(transformedBounds).toEqual({
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        });
      });

      // Same family and formula as polygon's equivalent test (see
      // polygon.test.ts): the exact per-joint miter tip, not a conservative
      // worst-case bound -- at each of the two joints where the closing
      // chord meets the curve (start and end), the real angle between the
      // chord and the curve's own tangent there is fully known. Verified by
      // hand: both joints have interior angle ~63.43 degrees by symmetry,
      // miterLength = (strokeWidth/2)/sin(31.72deg) =~ 9.512 -- well under
      // the strokeWidth*miterLimit=50 cap. The end joint's tip (x =~
      // 108.09) dominates the x-extent; both joints agree on the y-extent
      // (~-5, same as the round-pen baseline -- no extra y overshoot here).
      it("uses the exact per-joint miter tip for a mitered closed curve, not the plain round-pen padding", () => {
        const transformedBounds = getBezierTransformedAABB({
          ...archProps,
          closePath: true,
          strokeWidth: 10,
          lineJoin: "miter",
          miterLimit: 5,
        });

        expect(transformedBounds.x).toBeCloseTo(-8.09, 1);
        expect(transformedBounds.y).toBeCloseTo(-5, 1);
        expect(transformedBounds.width).toBeCloseTo(116.18, 1);
        expect(transformedBounds.height).toBeCloseTo(60, 1);
      });

      // polygon/bezier's "outside" alignment strokes at strokeWidth*2
      // (native) and clips away the inward half -- so a mitered "outside"
      // joint's exact reach uses the DOUBLED width in the same formula,
      // roughly twice the "center" case's reach for the same nominal
      // strokeWidth and angle. Same gotcha as polygon: an implementation
      // that reuses the "center" formula for every alignment would
      // under-report "outside" here.
      it("doubles the exact miter reach for a mitered 'outside' curve, since outside alignment strokes at 2x the nominal strokeWidth", () => {
        const centerBounds = getBezierTransformedAABB({
          ...archProps,
          closePath: true,
          strokeWidth: 10,
          lineJoin: "miter",
          miterLimit: 5,
        });
        const outsideBounds = getBezierTransformedAABB({
          ...archProps,
          closePath: true,
          strokeWidth: 10,
          strokeAlignment: "outside",
          lineJoin: "miter",
          miterLimit: 5,
        });

        expect(outsideBounds.x).toBeLessThan(centerBounds.x);
        expect(outsideBounds.x).toBeCloseTo(-16.18, 1);
        expect(outsideBounds.y).toBeCloseTo(-10, 1);
        expect(outsideBounds.width).toBeCloseTo(132.36, 1);
        expect(outsideBounds.height).toBeCloseTo(70, 1);
      });
    });
  });
});
