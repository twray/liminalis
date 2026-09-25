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

  it("reuses cached group bitmap once a signature has repeated (spec/bitmap-cache-strategy-plan.md: promotion is deferred one frame)", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = createTargetContext();
    const draw = vi.fn();

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

    const renderOnce = () =>
      cache.renderGroup({
        groupId: "group-0",
        signature: "sig-a",
        targetContext,
        bounds: fullCanvasBounds(800, 600),
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      });

    renderOnce(); // frame 1: not yet proven stable -- direct render, no surface
    renderOnce(); // frame 2: signature repeated -- promote (builds + blits)
    renderOnce(); // frame 3: real cache hit -- no draw, just blit

    expect(draw).toHaveBeenCalledTimes(2);
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

    const renderParams = {
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      bounds: fullCanvasBounds(800, 600),
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    };

    // A signature's first appearance is a direct render with no surface at
    // all (spec/bitmap-cache-strategy-plan.md's stability gate) -- repeat it
    // once so this signature is proven stable and gets promoted to a real
    // surface, which is what this test actually wants to inspect.
    cache.renderGroup(renderParams);
    cache.renderGroup(renderParams);

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

    const renderParams = {
      groupId: "group-1",
      signature: "sig-a",
      targetContext,
      bounds: { x: 100, y: 50, width: 40, height: 30 },
      useLocalCoordinateContext: false,
      scope: null,
      draw,
    };

    // Repeat the signature once to promote past the stability gate -- see
    // the DPR test above for why a single call has no surface to inspect.
    cache.renderGroup(renderParams);
    cache.renderGroup(renderParams);

    expect(MockOffscreenCanvas.instances[0]?.width).toBe(40);
    expect(MockOffscreenCanvas.instances[0]?.height).toBe(30);
  });

  describe("useLocalCoordinateContext offset handling", () => {
    it("remaps parent-relative authored coordinates onto the surface and blits at the group's bounds origin when false", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      const renderParams = {
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 100, y: 50, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      };

      // Repeat the signature once to promote past the stability gate -- see
      // the DPR test above for why a single call has no surface to inspect.
      cache.renderGroup(renderParams);
      cache.renderGroup(renderParams);

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

      const renderParams = {
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: 100, y: 50, width: 40, height: 30 },
        useLocalCoordinateContext: true,
        scope: null,
        draw,
      };

      // Repeat the signature once to promote past the stability gate -- see
      // the DPR test above for why a single call has no surface to inspect.
      cache.renderGroup(renderParams);
      cache.renderGroup(renderParams);

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

      const renderParams = {
        groupId: "group-1",
        signature: "sig-a",
        targetContext,
        bounds: { x: -20, y: -10, width: 40, height: 30 },
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      };

      // Repeat the signature once to promote past the stability gate -- see
      // the DPR test above for why a single call has no surface to inspect.
      cache.renderGroup(renderParams);
      cache.renderGroup(renderParams);

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
      const targetContext = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
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
      expect(draw).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0]?.context,
      );
      expect(scope.postProcessLocalSurface).toHaveBeenCalledTimes(1);
    });
  });

  describe("stability-gated surface promotion", () => {
    it("draws directly to targetContext on the very first render of a group, without creating a surface", () => {
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

      expect(MockOffscreenCanvas.instances).toHaveLength(0);
      expect(draw).toHaveBeenCalledWith(targetContext);
      expect(targetContext.drawImage).not.toHaveBeenCalled();
    });

    it("promotes to a cached surface only on the second consecutive frame with the same signature", () => {
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

      // Frame 1: no surface yet, expected per the previous test.
      expect(MockOffscreenCanvas.instances).toHaveLength(0);

      cache.renderGroup({
        groupId: "group-0",
        signature: "sig-a",
        targetContext,
        bounds: fullCanvasBounds(800, 600),
        useLocalCoordinateContext: false,
        scope: null,
        draw,
      });

      // Frame 2: same signature repeated -> promote. A surface is built,
      // rendered into, and blitted -- same cost profile as today's existing
      // miss path, just deferred by one frame.
      expect(MockOffscreenCanvas.instances).toHaveLength(1);
      expect(draw).toHaveBeenCalledTimes(2);
      expect(draw).toHaveBeenLastCalledWith(
        MockOffscreenCanvas.instances[0]?.context,
      );
      expect(targetContext.drawImage).toHaveBeenCalledTimes(1);
      expect(targetContext.drawImage).toHaveBeenCalledWith(
        MockOffscreenCanvas.instances[0],
        0,
        0,
        800,
        600,
      );
    });

    it("hits the now-populated cache on the third+ consecutive frame with the same signature", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      const renderOnce = () =>
        cache.renderGroup({
          groupId: "group-0",
          signature: "sig-a",
          targetContext,
          bounds: fullCanvasBounds(800, 600),
          useLocalCoordinateContext: false,
          scope: null,
          draw,
        });

      renderOnce(); // frame 1: direct render, no surface
      renderOnce(); // frame 2: promote -- builds + blits the surface
      renderOnce(); // frame 3: real cache hit

      // draw() only ran for frames 1 (direct) and 2 (building the surface);
      // frame 3 is a pure blit from the now-cached surface.
      expect(draw).toHaveBeenCalledTimes(2);
      expect(MockOffscreenCanvas.instances).toHaveLength(1);
      expect(targetContext.drawImage).toHaveBeenCalledTimes(2);
    });

    it("never creates a surface for a groupId whose signature changes every frame -- the regression case this plan fixes", () => {
      const cache = new DrawGroupBitmapCache();
      const targetContext = createTargetContext();
      const draw = vi.fn();

      cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 1 });

      for (let frame = 0; frame < 10; frame++) {
        cache.renderGroup({
          groupId: "group-0",
          signature: `sig-${frame}`,
          targetContext,
          bounds: fullCanvasBounds(800, 600),
          useLocalCoordinateContext: false,
          scope: null,
          draw,
        });
      }

      // Always-changing content should behave exactly like the
      // !requiresLocalSurface direct-render path, cost-wise: no surface
      // ever built, no clear, no composite blit -- just the unavoidable
      // draw() cost, every frame.
      expect(MockOffscreenCanvas.instances).toHaveLength(0);
      expect(draw).toHaveBeenCalledTimes(10);
      expect(targetContext.drawImage).not.toHaveBeenCalled();
    });
  });

  it("bypasses the cache entirely and draws directly when the target context isn't canvas-backed and no post-processing is needed", () => {
    const cache = new DrawGroupBitmapCache();
    const targetContext = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
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
