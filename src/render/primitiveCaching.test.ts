import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { createDrawContext } from "./index";
import type { DrawMethods } from "./types";

// A single shared sink so we can tell which primitives actually issued a
// draw call, regardless of *which* surface it landed on — the real target
// context, root's own offscreen cache surface, or a nested group's offscreen
// cache surface. Bitmap caching applies uniformly to every group (including
// root), so a primitive declared directly under root draws into root's own
// offscreen surface just as much as nested content draws into its group's.
let roundRectWidths: number[] = [];

const makeMockContext = (width: number, height: number) =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    roundRect: (_x: number, _y: number, w: number) => roundRectWidths.push(w),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    canvas: { width, height },
  }) as unknown as CanvasRenderingContext2D;

// Reproduces the mock OffscreenCanvas pattern already used in index.test.ts's
// "(cache enabled)" tests, so DrawGroupBitmapCache's real bitmap-caching path
// (not the "no canvas.getContext, draw directly" bypass) is actually exercised.
class MockOffscreenCanvas {
  width: number;
  height: number;
  context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = makeMockContext(width, height);
    // A real OffscreenCanvas's context.canvas points back to the canvas
    // itself (which has its own getContext) — without this, a group nested
    // two or more levels deep sees a canvas with no getContext on the way
    // down and silently bypasses its own cache check.
    (this.context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

const createCacheableContext = (): CanvasRenderingContext2D => {
  const context = makeMockContext(800, 600);
  (context as unknown as { canvas: { getContext: () => void } }).canvas = {
    ...(context.canvas as object),
    getContext: vi.fn(),
  } as any;
  return context;
};

describe("bitmap caching skips unchanged nested content", () => {
  const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

  beforeEach(() => {
    roundRectWidths = [];
    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  });

  afterEach(() => {
    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });

  it("does not redraw a static group's content on a frame where nothing in it changed, while a sibling that does change still redraws", () => {
    const drawContext = createDrawContext();
    const context = createCacheableContext();

    // Distinguishable widths let us tell which primitives actually issued
    // draw calls, without depending on call ordering.
    const STATIC_RECT_WIDTH = 37;
    const ANIMATING_RECT_WIDTH = 41;
    const STATIC_RECT_COUNT = 20;

    const renderCallback = (d: DrawMethods, timeInMs: number) => {
      d.group(
        () => {
          for (let i = 0; i < STATIC_RECT_COUNT; i++) {
            d.rect({
              x: i * 10,
              y: 0,
              width: STATIC_RECT_WIDTH,
              height: 10,
              fillStyle: "#333",
              strokeStyle: "transparent",
            });
          }
        },
        { x: 0, y: 0, width: 300, height: 50 },
      );

      // Declared outside the group, and its position changes every frame —
      // this is what keeps the overall frame (and root's own signature)
      // genuinely non-static, so this isn't just "the whole canvas never
      // changes" caching.
      d.rect({
        x: timeInMs,
        y: 100,
        width: ANIMATING_RECT_WIDTH,
        height: 10,
        fillStyle: "#f00",
        strokeStyle: "transparent",
      });
    };

    drawContext.executeDrawCallback(
      (d) => renderCallback(d, 0),
      context,
      800,
      600,
      0,
    );

    const countFrame1Static = roundRectWidths.filter(
      (w) => w === STATIC_RECT_WIDTH,
    ).length;
    const countFrame1Animating = roundRectWidths.filter(
      (w) => w === ANIMATING_RECT_WIDTH,
    ).length;

    expect(countFrame1Static).toBe(STATIC_RECT_COUNT);
    expect(countFrame1Animating).toBe(1);

    roundRectWidths = [];

    drawContext.executeDrawCallback(
      (d) => renderCallback(d, 16),
      context,
      800,
      600,
      16,
    );

    const countFrame2Static = roundRectWidths.filter(
      (w) => w === STATIC_RECT_WIDTH,
    ).length;
    const countFrame2Animating = roundRectWidths.filter(
      (w) => w === ANIMATING_RECT_WIDTH,
    ).length;

    // The key assertion: the static group's cache hit, so none of its 20
    // rects re-issued their draw calls on the second frame...
    expect(countFrame2Static).toBe(0);
    // ...even though the frame as a whole is not static (root's own cache
    // still misses because of the animating sibling), so this is genuinely
    // proving per-group scoping, not "the whole canvas never changes".
    expect(countFrame2Animating).toBe(1);
  });

  it("redraws a group's content again once something inside it actually changes", () => {
    const drawContext = createDrawContext();
    const context = createCacheableContext();
    const RECT_WIDTH = 50;

    const renderCallback = (d: DrawMethods, x: number) => {
      d.group(
        () => {
          d.rect({ x, y: 0, width: RECT_WIDTH, height: 10, fillStyle: "#333", strokeStyle: "transparent" });
        },
        { x: 0, y: 0, width: 300, height: 50 },
      );
    };

    drawContext.executeDrawCallback(
      (d) => renderCallback(d, 0),
      context,
      800,
      600,
      0,
    );
    expect(roundRectWidths.filter((w) => w === RECT_WIDTH)).toHaveLength(1);
    roundRectWidths = [];

    // Same call, same props — should cache-hit and skip.
    drawContext.executeDrawCallback(
      (d) => renderCallback(d, 0),
      context,
      800,
      600,
      16,
    );
    expect(roundRectWidths.filter((w) => w === RECT_WIDTH)).toHaveLength(0);

    // Now the rect's own x prop changes — the group's content genuinely
    // changed, so it must redraw.
    drawContext.executeDrawCallback(
      (d) => renderCallback(d, 5),
      context,
      800,
      600,
      32,
    );
    expect(roundRectWidths.filter((w) => w === RECT_WIDTH)).toHaveLength(1);
  });
});
