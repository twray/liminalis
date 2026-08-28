import { describe, expect, it } from "vitest";

import {
  centerOf,
  createBoundsCollector,
  createNoopAnimatable,
  DEFAULT_BLEND_MODE,
  hasBounds,
  renderWithTransform,
  resolveTransformOrigin,
  setContextGlobals,
  toIsometricStyles,
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

    renderWithTransform(
      context,
      { scale: 2, rotate: 90 },
      bounds,
      renderShape,
    );

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
