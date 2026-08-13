import { beforeEach, describe, expect, it, vi } from "vitest";

import DrawGroupBitmapCache from "./DrawGroupBitmapCache";

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
      width: 800,
      height: 600,
      draw,
    });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      width: 800,
      height: 600,
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
      width: 800,
      height: 600,
      draw,
    });

    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-b",
      targetContext,
      width: 800,
      height: 600,
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
      width: 800,
      height: 600,
      draw,
    });

    cache.beginFrame({ width: 1024, height: 600, devicePixelRatio: 1 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      width: 1024,
      height: 600,
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
      width: 800,
      height: 600,
      draw,
    });

    cache.beginFrame({ width: 800, height: 600, devicePixelRatio: 2 });
    cache.renderGroup({
      groupId: "group-0",
      signature: "sig-a",
      targetContext,
      width: 800,
      height: 600,
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
      width: 800,
      height: 600,
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
});
