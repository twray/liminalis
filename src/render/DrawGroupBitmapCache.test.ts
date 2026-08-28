import { beforeEach, describe, expect, it, vi } from "vitest";

import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import type { Bounds, ClipScope } from "./types";

class MockOffscreenCanvas {
  static instances: MockOffscreenCanvas[] = [];

  width: number;
  height: number;
  context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    MockOffscreenCanvas.instances.push(this);

    this.context = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      translate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }

  getContext(kind: string) {
    if (kind !== "2d") {
      return null;
    }

    return this.context;
  }
}

const createTargetContext = () =>
  ({
    drawImage: vi.fn(),
    canvas: {
      getContext: vi.fn(),
    },
  }) as unknown as CanvasRenderingContext2D;

const fullCanvasBounds = (width: number, height: number): Bounds => ({
  x: 0,
  y: 0,
  width,
  height,
});

describe("DrawGroupBitmapCache", () => {
  beforeEach(() => {
    MockOffscreenCanvas.instances = [];
    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  });

  it("reuses cached group bitmap when signature is unchanged", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(targetContext.drawImage).toHaveBeenCalledTimes(2);
  });

  it("invalidates and redraws when signature changes", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-b",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("clears cache when environment dimensions change", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    cache.beginFrame({ width: 1024, height: 600, devicePixelRatio: 1 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(1024, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("clears cache when devicePixelRatio changes", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 2 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("renders cached groups at DPR-scaled backing size and logical output size", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 2 });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(MockOffscreenCanvas.instances).toHaveLength(1);
    expect(MockOffscreenCanvas.instances[0]?.width).toBe(1600);
    expect(MockOffscreenCanvas.instances[0]?.height).toBe(1200);
    expect(targetContext.drawImage).toHaveBeenCalledWith(
      MockOffscreenCanvas.instances[0],
      0,
      0,
      800,
      600,
    );
  });

  it("sizes a group's surface to its own local bounds, not the full canvas — the point of local-bounds caching", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

    cache.renderGroup({
      groupId: "group-1",
      signature: "sig-a",
      targetContext,
      bounds: { x: 100, y: 50, width: 40, height: 30 },
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(MockOffscreenCanvas.instances[0]?.width).toBe(40);
    expect(MockOffscreenCanvas.instances[0]?.height).toBe(30);
  });

  describe("useLocalCoordinateContext offset handling", () => {
    it("remaps parent-relative authored coordinates onto the surface and blits at the group's bounds origin when false", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 100, y: 50, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      });

      const surfaceContext = MockOffscreenCanvas.instances[0]?.context;

      expect(surfaceContext?.translate).toHaveBeenCalledWith(-100, -50);
      expect(targetContext.drawImage).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0],
        100,
        50,
        40,
        30,
      );
    });

    it("blits at the surface's own origin with no extra translate when true (the parent context was already shifted by apply())", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 100, y: 50, width: 40, height: 30 },
        useLocalCoordinateContext: true,
        scope: null,
        draw,
      });

      const surfaceContext = MockOffscreenCanvas.instances[0]?.context;

      expect(surfaceContext?.translate).not.toHaveBeenCalled();
      expect(targetContext.drawImage).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0],
        0,
        0,
        40,
        30,
      );
    });

    it("handles negative-origin bounds sign-agnostically: a positive internal translate and a negative blit target", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: -20, y: -10, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      });

      const surfaceContext = MockOffscreenCanvas.instances[0]?.context;

      expect(surfaceContext?.translate).toHaveBeenCalledWith(20, 10);
      expect(targetContext.drawImage).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0],
        -20,
        -10,
        40,
        30,
      );
    });
  });

  describe("postProcessLocalSurface", () => {
    it("runs once, after draw() and before the surface is cached, in the same local coordinate frame", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const order: string[] = [];
      const draw = vi.fn(() => order.push("draw"));
      const scope: ClipScope = {
        postProcessLocalSurface: vi.fn(() => order.push("postProcess")),
      };

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 5, y: 10, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope,
        draw,
      });

      expect(order).toEqual(["draw", "postProcess"]);
      expect(scope.postProcessLocalSurface).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0]?.context,
        { x: 5, y: 10, width: 40, height: 30 },
      );

      // A second frame with the same signature is a cache hit — draw() and
      // the post-process step both skip.
      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 5, y: 10, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope,
        draw,
      });

      expect(draw).toHaveBeenCalledTimes(1);
      expect(scope.postProcessLocalSurface).toHaveBeenCalledTimes(1);
    });

    it("forces an isolated local surface even when the target context fails the generic bitmap-caching duck-type check", () => {
      const cache = new DrawGroupBitmapCache();
      // No canvas.getContext here — on its own this would take the
      // "draw directly on the shared target" bypass, which would be wrong
      // for a masking scope: destination-in must never run against a
      // surface that might already hold unrelated sibling content.
      const targetContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      const draw = vi.fn();
      const scope: ClipScope = {
        postProcessLocalSurface: vi.fn(),
      };

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      cache.renderGroup({
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 0, y: 0, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope,
        draw,
      });

      expect(MockOffscreenCanvas.instances).toHaveLength(1);
      expect(draw).toHaveBeenCalledWith(MockOffscreenCanvas.instances[0]?.context);
      expect(scope.postProcessLocalSurface).toHaveBeenCalledTimes(1);
    });
  });

  it("bypasses the cache entirely and draws directly when the target context isn't canvas-backed and no post-processing is needed", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    });

    expect(MockOffscreenCanvas.instances).toHaveLength(0);
    expect(draw).toHaveBeenCalledWith(targetContext);
  });
});
