import { describe, expect, it } from "vitest";

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

  it("returns the tight untransformed bounds when there is no rotation or scale", () => {
    const transformedBounds = getBezierTransformedAABB(archProps);

    expect(transformedBounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("returns the tight untransformed bounds when rotation and scale are at default values", () => {
    const transformedBounds = getBezierTransformedAABB({
      ...archProps,
      rotate: 0,
      scale: 1,
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
    });

    expect(transformedBounds.x).toBeCloseTo(23.48, 2);
    expect(transformedBounds.y).toBeCloseTo(-28.03, 2);
    expect(transformedBounds.width).toBeCloseTo(79.55, 2);
    expect(transformedBounds.height).toBeCloseTo(79.55, 2);

    const naiveRelocatedBounds = computeTransformedMultipointAABB(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }],
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
});
