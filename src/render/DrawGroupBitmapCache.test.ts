import { beforeEach, describe, expect, it, vi } from "vitest";

import DrawGroupBitmapCache from "./DrawGroupBitmapCache";
import type { Bounds, ClipScope, DrawAPI } from "./types";

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

// ---------------------------------------------------------------------------
// The root group is not a special case in DrawGroupManager.renderToContext --
// it takes the same cache.renderGroup path as every other group, with an
// identity scope and full-canvas bounds. That means a scene where nothing
// changed collapses to a single full-canvas blit, because the root's
// signature is built recursively from every descendant's.
//
// These go through the real createDrawContext rather than driving the cache
// directly, because the property under test is the INTERACTION between
// signature propagation and the stability gate -- neither half proves it
// alone. It was previously asserted only by a comment.
// ---------------------------------------------------------------------------

const createRecordingContext = () => {
  const calls: string[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push(method);
      void args;
    };

  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(record("beginPath")),
    closePath: vi.fn(),
    clip: vi.fn(record("clip")),
    rect: vi.fn(record("rect")),
    arc: vi.fn(),
    ellipse: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(record("fill")),
    stroke: vi.fn(record("stroke")),
    fillRect: vi.fn(record("fillRect")),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(record("drawImage")),
    roundRect: vi.fn(record("roundRect")),
    measureText: vi.fn(() => ({ width: 10 }) as TextMetrics),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;

  (context as unknown as { canvas: unknown }).canvas = {
    width: 400,
    height: 300,
    getContext: vi.fn(),
  };

  return { context, calls };
};

// Distinct from the MockOffscreenCanvas above: that one is a minimal stub for
// asserting surface dimensions, this one records every call made against its
// context so a blit can be told apart from a repaint. createSceneDriver
// installs it per test, and the suite above reinstalls its own in beforeEach,
// so the two never interfere regardless of execution order.
class RecordingOffscreenCanvas {
  width: number;
  height: number;
  context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = createRecordingContext().context;
    (this.context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

// Returns a driver rather than rendering a fixed list, so a test can clear
// the call log BETWEEN frames. Accumulating across the warm-up frames is
// what made the invalidation test below vacuous on its first attempt: those
// frames paint every primitive by definition, so any assertion that the log
// merely contains a paint call passes whatever the cache does.
const createSceneDriver = async () => {
  (globalThis as unknown as Record<string, unknown>).OffscreenCanvas =
    RecordingOffscreenCanvas;

  const { createDrawContext } = await import("./index");
  const drawContext = createDrawContext();
  const { context, calls } = createRecordingContext();

  let frameIndex = 0;

  return {
    context,
    calls,
    render: (scene: (d: DrawAPI) => void) => {
      drawContext.executeDrawCallback(
        scene,
        context,
        400,
        300,
        frameIndex * 16,
      );
      frameIndex += 1;
    },
  };
};

const twentyRects =
  (firstRectX: number) =>
  (d: DrawAPI): void => {
    for (let index = 0; index < 20; index++) {
      d.rect({
        x: index === 0 ? firstRectX : index * 10,
        y: 5,
        width: 8,
        height: 8,
        fillStyle: "#333",
      });
    }
  };

describe("root bitmap cache", () => {
  it("collapses an unchanged scene to a single full-canvas blit", async () => {
    // Two frames to establish the repeat the cache promotes on, then a third
    // to observe.
    const scene = await createSceneDriver();

    scene.render(twentyRects(0));
    scene.render(twentyRects(0));

    scene.calls.length = 0;
    vi.mocked(scene.context.drawImage).mockClear();

    scene.render(twentyRects(0));

    // Nothing but the blit reaches the target context, and its dimensions
    // are the full canvas -- a per-primitive cache blit would also be a
    // drawImage, so the count alone would not prove the ROOT hit.
    expect(scene.calls).toEqual(["drawImage"]);
    expect(
      vi
        .mocked(scene.context.drawImage)
        .mock.calls.map((call) => call.slice(1)),
    ).toEqual([[0, 0, 400, 300]]);
  });

  it("repaints the root when any single descendant changes", async () => {
    // The root's signature is built from every descendant's, so one rect
    // moving has to invalidate the whole canvas. Without that propagation
    // the root would blit a stale surface and the move would never appear.
    const scene = await createSceneDriver();

    scene.render(twentyRects(0));
    scene.render(twentyRects(0));
    scene.render(twentyRects(0));

    // Cleared AFTER the scene has settled into blitting, so anything the
    // log contains from here is caused by the move alone.
    scene.calls.length = 0;

    scene.render(twentyRects(77));

    expect(scene.calls).toContain("roundRect");
  });
});
