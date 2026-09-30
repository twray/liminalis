import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VideoFrameHold from "./VideoFrameHold";

class FakeContext {
  calls: string[] = [];

  #throwOnDraw = false;

  clearRect = vi.fn((...args: number[]) => {
    this.calls.push(`clearRect:${args.join(",")}`);
  });

  drawImage = vi.fn((_source: unknown, ...args: number[]) => {
    this.calls.push(`drawImage:${args.join(",")}`);

    if (this.#throwOnDraw) {
      throw new Error("decode failed");
    }
  });

  __throwOnDraw(): void {
    this.#throwOnDraw = true;
  }
}

class FakeCanvas {
  resizes: string[] = [];

  #width = 0;
  #height = 0;

  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
    this.resizes.push(`w:${value}`);
  }

  get height(): number {
    return this.#height;
  }

  set height(value: number) {
    this.#height = value;
    this.resizes.push(`h:${value}`);
  }

  context = new FakeContext();

  getContext = vi.fn((kind: string) =>
    kind === "2d" ? this.context : null,
  ) as unknown as HTMLCanvasElement["getContext"];
}

let canvases: FakeCanvas[] = [];
const previousDocument = (globalThis as any).document;

beforeEach(() => {
  canvases = [];
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag !== "canvas") {
        throw new Error(`unexpected createElement("${tag}")`);
      }

      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  };
});

afterEach(() => {
  (globalThis as any).document = previousDocument;
});

const SOURCE = { theVideo: true } as unknown as CanvasImageSource;

describe("VideoFrameHold", () => {
  it("holds nothing until something is captured", () => {
    expect(new VideoFrameHold().get()).toBeNull();
  });

  it("returns the surface it drew into once captured", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);

    expect(hold.get()).toBe(canvases[0]);
    expect(canvases[0]?.context.drawImage).toHaveBeenCalled();
  });

  it("sizes the surface to the frame, so no scaling is baked in", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);

    // Any mismatch here would silently resample every held frame, making the
    // hold visibly softer than the live video it stands in for.
    expect(canvases[0]?.width).toBe(640);
    expect(canvases[0]?.height).toBe(360);
    expect(canvases[0]?.context.calls).toContain("drawImage:0,0,640,360");
  });

  it("reuses one surface across captures rather than allocating per frame", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);
    hold.capture(SOURCE, 640, 360);
    hold.capture(SOURCE, 640, 360);

    // A fresh canvas per capture would churn a full-resolution allocation on
    // every loop.
    expect(canvases).toHaveLength(1);
  });

  it("does not reassign the dimensions when they are unchanged", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);
    expect(canvases[0]?.resizes).toEqual(["w:640", "h:360"]);

    hold.capture(SOURCE, 640, 360);
    hold.capture(SOURCE, 640, 360);

    // Unchanged: an unconditional reassignment would clear the surface on
    // every capture. It happens to still work today because the draw follows
    // immediately -- which is exactly what would mask the bug the day anything
    // was reordered between the two.
    expect(canvases[0]?.resizes).toEqual(["w:640", "h:360"]);
  });

  it("still holds a frame after the source dimensions change", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);
    hold.capture(SOURCE, 1280, 720);

    // The resize clears the surface, so the capture has to draw AFTER it.
    expect(canvases[0]?.width).toBe(1280);
    expect(hold.get()).toBe(canvases[0]);
  });

  it("holds nothing rather than a torn frame when the draw fails", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);
    expect(hold.get()).not.toBeNull();

    canvases[0]!.context.__throwOnDraw();
    hold.capture(SOURCE, 640, 360);

    // Degrades to the old blank behaviour, which beats letting a decode
    // failure escape and take down the whole render frame.
    expect(hold.get()).toBeNull();
  });

  it("ignores a degenerate frame size instead of creating a surface", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 0, 0);

    expect(canvases).toHaveLength(0);
    expect(hold.get()).toBeNull();
  });

  it("drops the frame and its surface on release", () => {
    const hold = new VideoFrameHold();

    hold.capture(SOURCE, 640, 360);
    hold.release();

    expect(hold.get()).toBeNull();

    // And a later capture starts a genuinely new surface, rather than
    // resurrecting the released one.
    hold.capture(SOURCE, 640, 360);
    expect(canvases).toHaveLength(2);
  });

  it("holds nothing when there is no document to create a surface in", () => {
    (globalThis as any).document = undefined;
    const hold = new VideoFrameHold();

    expect(() => hold.capture(SOURCE, 640, 360)).not.toThrow();
    expect(hold.get()).toBeNull();
  });
});
