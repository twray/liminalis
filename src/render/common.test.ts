import { describe, expect, it } from "vitest";

import { degreesToRadians } from "../util";
import {
  centerOf,
  computeTransformedMultipointAABB,
  computeTransformedRectangularAABB,
  createBoundsCollector,
  createNoopAnimatable,
  DEFAULT_BLEND_MODE,
  hasBounds,
  renderWithTransform,
  resolveTransformOrigin,
  setContextGlobals,
  toIsometricStyles,
  transformPoint,
} from "./common";

const createMockContext = () => {
  const callOrder: string[] = [];

  const context = {
    save: () => callOrder.push("save"),
    restore: () => callOrder.push("restore"),
    translate: (x: number, y: number) => callOrder.push(`translate:${x},${y}`),
    scale: (x: number, y: number) => callOrder.push(`scale:${x},${y}`),
    rotate: (radians: number) => callOrder.push(`rotate:${radians}`),
  } as unknown as CanvasRenderingContext2D;

  return { context, callOrder };
};

describe("resolveTransformOrigin", () => {
  it("defaults to the center of bounds when origin is undefined", () => {
    const origin = resolveTransformOrigin(undefined, {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });

    expect(origin).toEqual({ x: 60, y: 45 });
  });

  it("resolves 'center' to the center of bounds", () => {
    const origin = resolveTransformOrigin("center", {
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    });

    expect(origin).toEqual({ x: 20, y: 10 });
  });

  it("resolves an explicit point relative to the bounds origin", () => {
    const origin = resolveTransformOrigin(
      { x: 5, y: 5 },
      { x: 10, y: 10, width: 100, height: 100 },
    );

    expect(origin).toEqual({ x: 15, y: 15 });
  });
});

describe("renderWithTransform", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it("renders directly without save/restore when there is no rotation or scale", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, {}, bounds, renderShape);

    expect(callOrder).toEqual(["render"]);
  });

  it("applies scale around the resolved origin, then renders, then restores", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, { scale: 2 }, bounds, renderShape);

    expect(callOrder).toEqual([
      "save",
      "translate:50,50",
      "scale:2,2",
      "translate:-50,-50",
      "render",
      "restore",
    ]);
  });

  it("applies rotate around the resolved origin, then renders, then restores", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, { rotate: 90 }, bounds, renderShape);

    expect(callOrder[0]).toBe("save");
    expect(callOrder[1]).toBe("translate:50,50");
    expect(callOrder[2]).toBe(`rotate:${Math.PI / 2}`);
    expect(callOrder[3]).toBe("translate:-50,-50");
    expect(callOrder[4]).toBe("render");
    expect(callOrder[5]).toBe("restore");
  });

  it("applies scale before rotate when both are present", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, { scale: 2, rotate: 90 }, bounds, renderShape);

    expect(callOrder).toEqual([
      "save",
      "translate:50,50",
      "scale:2,2",
      "translate:-50,-50",
      "translate:50,50",
      `rotate:${Math.PI / 2}`,
      "translate:-50,-50",
      "render",
      "restore",
    ]);
  });

  it("treats scale of exactly 1 as no scale", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, { scale: 1 }, bounds, renderShape);

    expect(callOrder).toEqual(["render"]);
  });

  it("ignores a non-invertible (zero) scale", () => {
    const { context, callOrder } = createMockContext();
    const renderShape = () => callOrder.push("render");

    renderWithTransform(context, { scaleX: 0, scaleY: 2 }, bounds, renderShape);

    expect(callOrder).toEqual(["render"]);
  });
});

describe("transformPoint", () => {
  const emptyTransformState = {
    hasRotate: false,
    hasScale: false,
    scaleX: 1,
    scaleY: 1,
    scaleOrigin: { x: 0, y: 0 },
    rotateOrigin: { x: 0, y: 0 },
    rotateRadians: 0,
  };

  it("returns the point unchanged when there is no rotation or scale", () => {
    const point = { x: 100, y: 100 };
    const transformedPoint = transformPoint(point, emptyTransformState);

    expect(transformedPoint).toEqual({ x: 100, y: 100 });
  });

  it("rotates a point around the resolved rotate origin", () => {
    const transformStateWithRotation = {
      ...emptyTransformState,
      hasRotate: true,
      rotateRadians: degreesToRadians(45),
      rotateOrigin: { x: 150, y: 150 },
    };

    const point = { x: 100, y: 100 };
    const transformedPoint = transformPoint(point, transformStateWithRotation);

    expect(transformedPoint.x).toBeCloseTo(150, 2);
    expect(transformedPoint.y).toBeCloseTo(79.29, 2);
  });

  it("scales a point around the resolved scale origin", () => {
    const transformStateWithScale = {
      ...emptyTransformState,
      hasScale: true,
      scaleX: 1.5,
      scaleY: 1.5,
      scaleOrigin: { x: 150, y: 150 },
    };

    const point = { x: 100, y: 100 };
    const transformedPoint = transformPoint(point, transformStateWithScale);

    expect(transformedPoint).toEqual({ x: 75, y: 75 });
  });

  it("applies rotate before scale when both are present", () => {
    const transformStateWithScaleAndRotation = {
      hasRotate: true,
      hasScale: true,
      scaleX: 2,
      scaleY: 1.5,
      scaleOrigin: { x: 150, y: 150 },
      rotateOrigin: { x: 150, y: 150 },
      rotateRadians: degreesToRadians(45),
    };

    const point = { x: 100, y: 100 };
    const transformedPoint = transformPoint(
      point,
      transformStateWithScaleAndRotation,
    );

    expect(transformedPoint.x).toBeCloseTo(150, 2);
    expect(transformedPoint.y).toBeCloseTo(43.93, 2);
  });
});

describe("computeTransformedRectangularAABB", () => {
  const squareBounds = { x: 100, y: 100, width: 100, height: 100 };
  const rectangularBounds = { x: 100, y: 100, width: 200, height: 100 };

  it("returns the bounds unchanged when there is no rotation or scale", () => {
    const transformedBounds = computeTransformedRectangularAABB(
      squareBounds,
      {},
    );

    expect(transformedBounds).toEqual(squareBounds);
  });

  it("returns the bounds unchanged when rotation and scale are at default values", () => {
    const transformedBounds = computeTransformedRectangularAABB(squareBounds, {
      rotate: 0,
      scale: 1,
    });

    expect(transformedBounds).toEqual(squareBounds);
  });

  it("computes the diagonal AABB of a square rotated 45 degrees around its centre when rotation origin is not specified", () => {
    const transformedBounds = computeTransformedRectangularAABB(squareBounds, {
      rotate: 45,
      scale: 1,
    });

    expect(transformedBounds.x).toBeCloseTo(79.29, 2);
    expect(transformedBounds.y).toBeCloseTo(79.29, 2);
    expect(transformedBounds.width).toBeCloseTo(141.42, 2);
    expect(transformedBounds.height).toBeCloseTo(141.42, 2);
  });

  it("grows the box uniformly around its center for a pure scale", () => {
    const transformedBounds = computeTransformedRectangularAABB(squareBounds, {
      scale: 2,
    });

    expect(transformedBounds).toEqual({
      x: 50,
      y: 50,
      width: 200,
      height: 200,
    });
  });

  it("swaps width and height for a 90 degree rotation of a non-square rect", () => {
    const transformedBounds = computeTransformedRectangularAABB(
      rectangularBounds,
      {
        rotate: 90,
      },
    );

    expect(transformedBounds).toEqual({
      x: 150,
      y: 50,
      width: 100,
      height: 200,
    });
  });

  it("shifts the box's position when rotating about an explicit non-center origin", () => {
    const transformedBounds = computeTransformedRectangularAABB(squareBounds, {
      rotate: 45,
      rotateOrigin: { x: 0, y: 0 },
    });

    expect(transformedBounds.x).toBeCloseTo(29.29, 2);
    expect(transformedBounds.y).toBeCloseTo(100.0, 2);
    expect(transformedBounds.width).toBeCloseTo(141.42, 2);
    expect(transformedBounds.height).toBeCloseTo(141.42, 2);
  });

  it("correctly computes bounding box when both rotation and scale are present", () => {
    const transformedBounds = computeTransformedRectangularAABB(squareBounds, {
      rotate: 45,
      scaleX: 2,
      scaleY: 1.5,
    });

    expect(transformedBounds.x).toBeCloseTo(8.58, 2);
    expect(transformedBounds.y).toBeCloseTo(43.93, 2);
    expect(transformedBounds.width).toBeCloseTo(282.84, 2);
    expect(transformedBounds.height).toBeCloseTo(212.13, 2);
  });
});

describe("computeTransformedMultipointAABB", () => {
  const linePoints = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ];

  // Deliberately not all vertices sit on the local bbox's own corners (only
  // (0,80) and (100,80) do; (50,0) is the midpoint of the bbox's top edge)
  // so a rotation genuinely distinguishes "transform the real vertices"
  // from "transform the bbox proxy's 4 corners" -- unlike the diagonal line
  // fixture above, this triangle isn't degenerate at 45 degrees.
  const openPolygonPoints = [
    { x: 50, y: 0 },
    { x: 0, y: 80 },
    { x: 100, y: 80 },
  ];

  // Same triangle with an explicit closing vertex duplicating the first
  // point, mirroring how polygon()/closePath: true produce their point set.
  const closedPolygonPoints = [
    { x: 50, y: 0 },
    { x: 0, y: 80 },
    { x: 100, y: 80 },
    { x: 50, y: 0 },
  ];

  it("returns the bounds unchanged when there is no rotation or scale", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {});

    expect(transformedBounds.x).toEqual(0);
    expect(transformedBounds.y).toEqual(0);
    expect(transformedBounds.width).toEqual(100);
    expect(transformedBounds.height).toEqual(100);
  });

  it("returns the bounds unchanged when rotation and scale are at default values", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {
      rotate: 0,
      scale: 1,
    });

    expect(transformedBounds.x).toEqual(0);
    expect(transformedBounds.y).toEqual(0);
    expect(transformedBounds.width).toEqual(100);
    expect(transformedBounds.height).toEqual(100);
  });

  it("computes the diagonal AABB of a line rotated 45 degrees around its centre when rotation origin is not specified", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {
      rotate: 45,
      scale: 1,
    });

    expect(transformedBounds.x).toBeCloseTo(50.0, 2);
    expect(transformedBounds.y).toBeCloseTo(-20.71, 2);
    expect(transformedBounds.width).toBeCloseTo(0.0, 2);
    expect(transformedBounds.height).toBeCloseTo(141.42, 2);
  });

  it("grows the box uniformly around a line's center for a pure scale", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {
      scale: 2,
    });

    expect(transformedBounds.x).toBe(-50);
    expect(transformedBounds.y).toBe(-50);
    expect(transformedBounds.width).toBe(200);
    expect(transformedBounds.height).toBe(200);
  });

  it("shifts the box's position when rotating a line on a explicit non-center origin", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {
      rotate: 45,
      rotateOrigin: { x: 0, y: 0 },
    });

    expect(transformedBounds.x).toBe(0);
    expect(transformedBounds.y).toBe(0);
    expect(transformedBounds.width).toBeCloseTo(0.0, 2);
    expect(transformedBounds.height).toBeCloseTo(141.42, 2);
  });

  it("correctly computes bounding box of a line when both rotation and scale are present", () => {
    const transformedBounds = computeTransformedMultipointAABB(linePoints, {
      rotate: 45,
      scaleX: 2,
      scaleY: 1.5,
    });

    expect(transformedBounds.x).toBeCloseTo(50.0, 2);
    expect(transformedBounds.y).toBeCloseTo(-56.07, 2);
    expect(transformedBounds.width).toBeCloseTo(0.0, 2);
    expect(transformedBounds.height).toBeCloseTo(212.13, 2);
  });

  it("computes the diagonal AABB of an open polygon rotated 45 degrees around its centre when rotation origin is not specified", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      openPolygonPoints,
      {
        rotate: 45,
        scale: 1,
      },
    );

    expect(transformedBounds.x).toBeCloseTo(-13.64, 2);
    expect(transformedBounds.y).toBeCloseTo(11.72, 2);
    expect(transformedBounds.width).toBeCloseTo(91.92, 2);
    expect(transformedBounds.height).toBeCloseTo(91.92, 2);
  });

  it("grows the box uniformly around an open polygon's center for a pure scale", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      openPolygonPoints,
      {
        scale: 2,
      },
    );

    expect(transformedBounds.x).toBe(-50);
    expect(transformedBounds.y).toBe(-40);
    expect(transformedBounds.width).toBe(200);
    expect(transformedBounds.height).toBe(160);
  });

  it("shifts the box's position when rotating an open polygon on a explicit non-center origin", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      openPolygonPoints,
      {
        rotate: 45,
        rotateOrigin: { x: 0, y: 0 },
      },
    );

    expect(transformedBounds.x).toBeCloseTo(-56.57, 2);
    expect(transformedBounds.y).toBeCloseTo(35.36, 2);
    expect(transformedBounds.width).toBeCloseTo(91.92, 2);
    expect(transformedBounds.height).toBeCloseTo(91.92, 2);
  });

  it("correctly computes bounding box an open polygon when both rotation and scale are present", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      openPolygonPoints,
      {
        rotate: 45,
        scaleX: 2,
        scaleY: 1.5,
      },
    );

    expect(transformedBounds.x).toBeCloseTo(-77.28, 2);
    expect(transformedBounds.y).toBeCloseTo(-2.43, 2);
    expect(transformedBounds.width).toBeCloseTo(183.85, 2);
    expect(transformedBounds.height).toBeCloseTo(137.89, 2);
  });

  it("computes the diagonal AABB of an closed polygon rotated 45 degrees around its centre when rotation origin is not specified", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      closedPolygonPoints,
      {
        rotate: 45,
        scale: 1,
      },
    );

    // Identical to the open-polygon case above: the duplicated closing
    // vertex can never move the min/max, so it can't change the AABB.
    expect(transformedBounds.x).toBeCloseTo(-13.64, 2);
    expect(transformedBounds.y).toBeCloseTo(11.72, 2);
    expect(transformedBounds.width).toBeCloseTo(91.92, 2);
    expect(transformedBounds.height).toBeCloseTo(91.92, 2);
  });

  it("grows the box uniformly around an closed polygon's center for a pure scale", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      closedPolygonPoints,
      {
        scale: 2,
      },
    );

    expect(transformedBounds.x).toBe(-50);
    expect(transformedBounds.y).toBe(-40);
    expect(transformedBounds.width).toBe(200);
    expect(transformedBounds.height).toBe(160);
  });

  it("shifts the box's position when rotating an closed polygon on a explicit non-center origin", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      closedPolygonPoints,
      {
        rotate: 45,
        rotateOrigin: { x: 0, y: 0 },
      },
    );

    expect(transformedBounds.x).toBeCloseTo(-56.57, 2);
    expect(transformedBounds.y).toBeCloseTo(35.36, 2);
    expect(transformedBounds.width).toBeCloseTo(91.92, 2);
    expect(transformedBounds.height).toBeCloseTo(91.92, 2);
  });

  it("correctly computes bounding box an closed polygon when both rotation and scale are present", () => {
    const transformedBounds = computeTransformedMultipointAABB(
      closedPolygonPoints,
      {
        rotate: 45,
        scaleX: 2,
        scaleY: 1.5,
      },
    );

    expect(transformedBounds.x).toBeCloseTo(-77.28, 2);
    expect(transformedBounds.y).toBeCloseTo(-2.43, 2);
    expect(transformedBounds.width).toBeCloseTo(183.85, 2);
    expect(transformedBounds.height).toBeCloseTo(137.89, 2);
  });
});

describe("setContextGlobals", () => {
  it("applies defaults when opacity and blend are not provided", () => {
    const context = {} as CanvasRenderingContext2D;

    setContextGlobals(context, {});

    expect(context.globalAlpha).toBe(0);
    expect(context.globalCompositeOperation).toBe(DEFAULT_BLEND_MODE);
  });

  it("applies explicit opacity and blend", () => {
    const context = {} as CanvasRenderingContext2D;

    setContextGlobals(context, { opacity: 0.5, blend: "multiply" });

    expect(context.globalAlpha).toBe(0.5);
    expect(context.globalCompositeOperation).toBe("multiply");
  });
});

describe("centerOf", () => {
  it("returns the midpoint of the given dimensions", () => {
    expect(centerOf({ width: 200, height: 50 })).toEqual({ x: 100, y: 25 });
  });
});

describe("hasBounds", () => {
  it("returns true when x, y, width, and height are all numbers", () => {
    expect(hasBounds({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });

  it("returns false when a required field is missing", () => {
    expect(hasBounds({ x: 0, y: 0, width: 10 })).toBe(false);
  });
});

describe("createBoundsCollector", () => {
  it("returns null bounds when nothing has been included", () => {
    const collector = createBoundsCollector();

    expect(collector.getBounds()).toBeNull();
  });

  it("ignores null bounds", () => {
    const collector = createBoundsCollector();

    collector.includeBounds(null);

    expect(collector.getBounds()).toBeNull();
  });

  it("ignores bounds with zero or negative width/height", () => {
    const collector = createBoundsCollector();

    collector.includeBounds({ x: 0, y: 0, width: 0, height: 10 });
    collector.includeBounds({ x: 0, y: 0, width: 10, height: -5 });

    expect(collector.getBounds()).toBeNull();
  });

  it("accumulates a bounding box across multiple included bounds", () => {
    const collector = createBoundsCollector();

    collector.includeBounds({ x: 10, y: 10, width: 20, height: 20 });
    collector.includeBounds({ x: -5, y: 40, width: 10, height: 10 });

    expect(collector.getBounds()).toEqual({
      x: -5,
      y: 10,
      width: 35,
      height: 40,
    });
  });
});

describe("createNoopAnimatable", () => {
  it("exposes the initial props via the currentProps getter", () => {
    const animatable = createNoopAnimatable({ x: 1 });

    expect(animatable.currentProps).toEqual({ x: 1 });
  });

  it("updates currentProps via updateInitialProps", () => {
    const animatable = createNoopAnimatable({ x: 1 });

    animatable.updateInitialProps({ x: 2 });

    expect(animatable.currentProps).toEqual({ x: 2 });
  });

  it("getCurrentProps returns currentProps regardless of the time given", () => {
    const animatable = createNoopAnimatable({ x: 1 });

    expect(animatable.getCurrentProps(0)).toEqual({ x: 1 });
    expect(animatable.getCurrentProps(9999)).toEqual({ x: 1 });
  });

  it("animateTo and withOptions are no-ops that return the same instance", () => {
    const animatable = createNoopAnimatable({ x: 1 });

    expect(animatable.animateTo({ x: 2 }, { duration: 100 })).toBe(animatable);
    expect(animatable.withOptions({ duration: 100 })).toBe(animatable);
    expect(animatable.currentProps).toEqual({ x: 1 });
  });

  it("lifecycle methods are safe no-ops", () => {
    const animatable = createNoopAnimatable({ x: 1 });

    expect(() => {
      animatable.setCurrentFrameTime(0);
      animatable.captureCurrentProps(0);
      animatable.clearSegments();
      animatable.clearSnapshot();
    }).not.toThrow();
  });
});

describe("toIsometricStyles", () => {
  it("extracts only fillStyle, strokeStyle, and strokeWidth", () => {
    const isometricStyles = toIsometricStyles({
      fillStyle: "#f00",
      strokeStyle: "#0f0",
      strokeWidth: 3,
      opacity: 0.5,
      blend: "source-over",
    });

    expect(isometricStyles).toEqual({
      fillStyle: "#f00",
      strokeStyle: "#0f0",
      strokeWidth: 3,
    });
  });
});
