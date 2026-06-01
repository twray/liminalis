import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SketchSettings } from "../types";
import CanvasRenderer from "./CanvasRenderer";

const createMockCanvas = () => {
  const context = {
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi.fn(() => context);
  const hasAttribute = vi.fn(() => false);

  const canvas = {
    width: 300,
    height: 150,
    isConnected: false,
    style: {} as Record<string, string>,
    getContext,
    hasAttribute,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    context,
    getContext,
    hasAttribute,
  };
};

const createSettings = (
  canvas: HTMLCanvasElement,
  overrides: Partial<SketchSettings> = {},
): SketchSettings => ({
  canvas,
  animate: true,
  fps: 60,
  playbackRate: "throttle",
  scaleToFit: false,
  ...overrides,
});

describe("CanvasRenderer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis as any).window = {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (globalThis as any).document = {
      body: {
        appendChild: vi.fn(),
      },
    };

    (globalThis as any).performance = {
      now: vi.fn(() => 0),
    };

    (globalThis as any).requestAnimationFrame = undefined;
    (globalThis as any).cancelAnimationFrame = undefined;
  });

  it("renders once when animation is disabled", () => {
    const { canvas, context } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, { animate: false }),
    );

    expect((globalThis as any).document.body.appendChild).toHaveBeenCalledWith(
      canvas,
    );
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect((canvas.style as any).width).toBe("1280px");
    expect((canvas.style as any).height).toBe("720px");
    expect((context as any).setTransform).toHaveBeenCalledWith(
      1,
      0,
      0,
      1,
      0,
      0,
    );
    expect(renderCallback).toHaveBeenCalledTimes(1);
    expect(renderCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
        width: 1280,
        height: 720,
        time: 0,
        frame: 0,
        playhead: 0,
      }),
    );
  });

  it("applies configured dimensions and context attributes", () => {
    const { canvas, getContext } = createMockCanvas();
    const renderer = new CanvasRenderer();

    renderer.start(
      () => vi.fn(),
      createSettings(canvas, {
        animate: false,
        dimensions: [640, 360],
        scaleToFit: true,
        attributes: { alpha: false },
      }),
    );

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(getContext).toHaveBeenCalledWith("2d", { alpha: false });
    expect((canvas.style as any).width).toBe("640px");
    expect((canvas.style as any).height).toBe("360px");
    expect((canvas.style as any).position).toBe("fixed");
    expect((canvas.style as any).left).toBe("50%");
    expect((canvas.style as any).top).toBe("50%");
    expect((canvas.style as any).transform).toBe("translate(-50%, -50%)");
    expect((canvas.style as any).boxShadow).toBe(
      "0 4px 16px rgba(0, 0, 0, 0.2)",
    );
  });

  it("uses viewport-sized scale-to-fit styles by default", () => {
    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();

    renderer.start(
      () => vi.fn(),
      createSettings(canvas, {
        animate: false,
        scaleToFit: true,
      }),
    );

    expect((canvas.style as any).width).toBe("100vw");
    expect((canvas.style as any).height).toBe("100vh");
    expect((canvas.style as any).margin).toBe("0");
  });

  it("updates viewport backing resolution and render dimensions on resize", () => {
    const frameCallbacks: FrameRequestCallback[] = [];

    (globalThis as any).requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    );

    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, {
        scaleToFit: true,
      }),
    );

    frameCallbacks[0]?.(0);

    expect(renderCallback).toHaveBeenCalledTimes(1);

    expect(renderCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        height: 720,
      }),
    );

    const resizeListener = (
      globalThis as any
    ).window.addEventListener.mock.calls.find(
      ([eventName]: [string]) => eventName === "resize",
    )?.[1];

    expect(resizeListener).toBeDefined();

    (globalThis as any).window.innerWidth = 900;
    (globalThis as any).window.innerHeight = 500;
    (globalThis as any).window.devicePixelRatio = 2;
    resizeListener();

    expect(canvas.width).toBe(1800);
    expect(canvas.height).toBe(1000);
    expect((canvas.style as any).width).toBe("100vw");
    expect((canvas.style as any).height).toBe("100vh");
    expect(renderCallback).toHaveBeenCalledTimes(2);
    expect(renderCallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        width: 900,
        height: 500,
      }),
    );

    frameCallbacks[1]?.(17);

    expect(renderCallback).toHaveBeenCalledTimes(3);

    expect(renderCallback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        width: 900,
        height: 500,
      }),
    );
  });

  it("updates viewport css dimensions on resize when scaleToFit is disabled", () => {
    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, {
        animate: false,
        scaleToFit: false,
      }),
    );

    expect(renderCallback).toHaveBeenCalledTimes(1);
    expect(renderCallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        width: 1280,
        height: 720,
        time: 0,
      }),
    );

    const resizeListener = (
      globalThis as any
    ).window.addEventListener.mock.calls.find(
      ([eventName]: [string]) => eventName === "resize",
    )?.[1];

    expect(resizeListener).toBeDefined();

    (globalThis as any).window.innerWidth = 1000;
    (globalThis as any).window.innerHeight = 600;
    resizeListener();

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(600);
    expect((canvas.style as any).width).toBe("1000px");
    expect((canvas.style as any).height).toBe("600px");
    expect(renderCallback).toHaveBeenCalledTimes(2);
    expect(renderCallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        width: 1000,
        height: 600,
        time: 0,
      }),
    );
  });

  it("matches internal pixel resolution to devicePixelRatio", () => {
    (globalThis as any).window.devicePixelRatio = 2;

    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, { animate: false }),
    );

    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1440);
    expect((canvas.style as any).width).toBe("1280px");
    expect((canvas.style as any).height).toBe("720px");
    expect(renderCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        height: 720,
      }),
    );
  });

  it("auto-scales down fixed dimensions to fit the viewport while preserving aspect ratio", () => {
    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();

    (globalThis as any).window.innerWidth = 900;
    (globalThis as any).window.innerHeight = 500;

    renderer.start(
      () => vi.fn(),
      createSettings(canvas, {
        animate: false,
        dimensions: [1600, 900],
        scaleToFit: true,
        autoScaleDown: true,
      }),
    );

    expect((canvas.style as any).width).toBe("832px");
    expect((canvas.style as any).height).toBe("468px");
    expect((canvas.style as any).position).toBe("fixed");
    expect((canvas.style as any).transform).toBe("translate(-50%, -50%)");
    expect((globalThis as any).window.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });

  it("recomputes auto-scale-down dimensions on resize and removes resize listener on stop", () => {
    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();

    (globalThis as any).window.innerWidth = 1200;
    (globalThis as any).window.innerHeight = 900;

    renderer.start(
      () => vi.fn(),
      createSettings(canvas, {
        animate: false,
        dimensions: [1000, 700],
        scaleToFit: true,
        autoScaleDown: true,
      }),
    );

    expect((canvas.style as any).width).toBe("1000px");
    expect((canvas.style as any).height).toBe("700px");

    const resizeListener = (
      globalThis as any
    ).window.addEventListener.mock.calls.find(
      ([eventName]: [string]) => eventName === "resize",
    )?.[1];

    expect(resizeListener).toBeDefined();

    (globalThis as any).window.innerWidth = 700;
    (globalThis as any).window.innerHeight = 500;
    resizeListener();

    expect((canvas.style as any).width).toBe("668px");
    expect((canvas.style as any).height).toBe("467px");

    renderer.stop();

    expect((globalThis as any).window.removeEventListener).toHaveBeenCalledWith(
      "resize",
      resizeListener,
    );
  });

  it("throttles animation frames according to fps when playbackRate is throttle", () => {
    const frameCallbacks: FrameRequestCallback[] = [];

    (globalThis as any).requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    );

    (globalThis as any).cancelAnimationFrame = vi.fn();

    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, {
        dimensions: [320, 200],
        fps: 60,
        playbackRate: "throttle",
      }),
    );

    expect(frameCallbacks).toHaveLength(1);

    frameCallbacks[0]?.(0);
    frameCallbacks[1]?.(5);
    frameCallbacks[2]?.(17);

    expect(renderCallback).toHaveBeenCalledTimes(2);

    renderer.stop();
    expect((globalThis as any).cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("supports fixed playback-rate frame stepping", () => {
    const frameCallbacks: FrameRequestCallback[] = [];

    (globalThis as any).requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    );

    const { canvas } = createMockCanvas();
    const renderer = new CanvasRenderer();
    const renderCallback = vi.fn();

    renderer.start(
      () => renderCallback,
      createSettings(canvas, {
        dimensions: [320, 200],
        fps: 10,
        playbackRate: "fixed",
      }),
    );

    frameCallbacks[0]?.(0);
    frameCallbacks[1]?.(50);
    frameCallbacks[2]?.(100);

    expect(renderCallback).toHaveBeenCalledTimes(2);
  });
});
