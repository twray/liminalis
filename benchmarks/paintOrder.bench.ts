import { afterEach, beforeEach, describe, it } from "vitest";

import type { DrawAPI } from "../src/render/types";

// Per-frame framework cost at scale, used to check that render-pipeline
// changes which add per-primitive work do not regress large scenes. Two
// changes have been measured through it so far; both result blocks are kept
// below, because the value of a benchmark like this is the trend line.
//
// It measures total cost, NOT the correctness properties those changes were
// made for -- those are covered by tests.
//
// Method notes, following tech-reports/render-pipeline-and-performance.md §8:
//
//   - ONE timing pair around the whole executeDrawCallback call. Per-primitive
//     timing sites cost ~110ns each, which at these primitive counts would be
//     larger than the effect being measured.
//   - The canvas context is a no-op stub, so painting is close to free and
//     what is actually being measured is declare + resolve + signature +
//     group-tree work. That is deliberate: it is where this change lands.
//   - Median and p95 are both reported. The mean is not, because GC pauses
//     make it unstable run to run.
//   - Warm-up frames are discarded, so the JIT has settled and (for the
//     static scenes) the bitmap cache has reached its promoted steady state.
//
// Result when the fix landed (min of 5 interleaved A/B runs, same machine --
// min rather than median because it is the estimator least perturbed by
// background load, and the interleaving is what cancels machine drift):
//
//                      before    after    delta
//   1024 static        2.49ms    2.54ms   +2.0%
//   1024 animating     7.53ms    8.00ms   +6.2%
//   4096 static       14.86ms   14.82ms   -0.3%
//   4096 animating    37.46ms   38.53ms   +2.9%
//
// Read as: no measurable regression. Run-to-run spread on medians was 7-9%,
// so every delta above sits inside the noise, and the signs are inconsistent.
// The decisive argument is that the deltas do not SCALE with primitive count
// -- a genuine per-primitive cost would show up more at 4096 than at 1024,
// and it shows up less. That matches theory: one array push plus one property
// write per primitive per frame is ~0.4% of a 4096-primitive frame.
//
// ---------------------------------------------------------------------------
//
// Inherited context globals (withInheritedContextGlobals in render/index.ts):
// a primitive declaring no blend/opacity now inherits whatever the caller left
// on the canvas, snapshotted into its props at declare time. That is two
// context property reads per primitive per frame. Min of 3 interleaved A/B
// runs:
//
//                      before    after    delta
//   1024 static        2.74ms    2.72ms   -0.7%
//   1024 animating     8.65ms    8.74ms   +1.0%
//   4096 static       16.41ms   15.12ms   -7.9%
//   4096 animating    41.56ms   40.00ms   -3.8%
//   16384 static      70.28ms   68.40ms   -2.7%
//
// Equal or slightly faster everywhere, which is not what adding per-primitive
// work predicts. The likely mechanism is that the same change stopped seeding
// `blend: "source-over"` into every primitive's applied styles -- so with an
// untouched context there is now one FEWER field per primitive flowing through
// stableSerialize, and that path is hot enough to have been optimised
// deliberately in an earlier round. Two reads added, one serialised field
// removed, netting out at or just under break-even.
//
// Stated conservatively: no measurable cost. The deltas are inside the same
// 7-9% noise band as before, so the apparent speedup is not claimed as one --
// only that the per-primitive reads did not show up, including at 16384
// primitives, which was added for this change precisely because the cost
// scales with primitive count.

const WARMUP_FRAMES = 30;
const MEASURED_FRAMES = 120;

const noopContext = (): CanvasRenderingContext2D =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "canvas") {
        return { width: 1920, height: 1080, getContext: () => null };
      }
      if (property === "measureText") {
        return () => ({ width: 10 });
      }
      if (property === "getImageData") {
        return () => ({ data: new Uint8ClampedArray(4) });
      }
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;

class MockOffscreenCanvas {
  width: number;
  height: number;
  #context = noopContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    (this.#context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.#context : null;
  }
}

const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;
const previousDocument = (globalThis as any).document;

beforeEach(() => {
  (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  (globalThis as any).document = {
    createElement: () => new MockOffscreenCanvas(0, 0),
  };
});

afterEach(() => {
  (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  (globalThis as any).document = previousDocument;
});

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;

const report = (label: string, samples: number[]): void => {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const min = sorted[0]!;

  console.log(
    `${label.padEnd(42)} median ${median.toFixed(2)}ms   ` +
      `p95 ${p95.toFixed(2)}ms   min ${min.toFixed(2)}ms`,
  );
};

const measure = async (
  label: string,
  scene: (draw: DrawAPI) => void,
): Promise<void> => {
  const { createDrawContext } = await import("../src/render/index");
  const drawContext = createDrawContext({ enableBitmapBasedCaching: true });
  const context = noopContext();

  let frame = 0;

  const renderOnce = () => {
    drawContext.executeDrawCallback(scene, context, 1920, 1080, frame * 16);
    frame += 1;
  };

  for (let i = 0; i < WARMUP_FRAMES; i++) {
    renderOnce();
  }

  const samples: number[] = [];

  for (let i = 0; i < MEASURED_FRAMES; i++) {
    const start = performance.now();
    renderOnce();
    samples.push(performance.now() - start);
  }

  report(label, samples);
};

// Half the primitives inside containers, half bare at root. That mix is the
// point: the fix changes how BOTH kinds land in a group's operation list, and
// a scene made only of one kind would hide half the cost.
const buildScene =
  (count: number, { animate }: { animate: boolean }) =>
  (draw: DrawAPI): void => {
    const perGroup = 32;
    const groupCount = Math.floor(count / 2 / perGroup);

    for (let g = 0; g < groupCount; g++) {
      draw.group(() => {
        for (let i = 0; i < perGroup; i++) {
          const handle = draw.rect({
            x: (g * 7 + i) % 1900,
            y: (g * 13 + i * 3) % 1000,
            width: 12,
            height: 12,
            fillStyle: "#3366aa",
          });

          if (animate) {
            handle.animateTo({ x: 1900 }, { at: 0, duration: 4000 });
          }
        }
      });
    }

    for (let i = 0; i < count / 2; i++) {
      const handle = draw.rect({
        x: (i * 11) % 1900,
        y: (i * 17) % 1000,
        width: 10,
        height: 10,
        fillStyle: "#aa6633",
      });

      if (animate) {
        handle.animateTo({ y: 1000 }, { at: 0, duration: 4000 });
      }
    }
  };

describe("render pipeline: per-frame cost", () => {
  it("1024 primitives", async () => {
    await measure(
      "1024 static  (512 grouped / 512 root)",
      buildScene(1024, { animate: false }),
    );
    await measure("1024 animating", buildScene(1024, { animate: true }));
  });

  it("16384 primitives", async () => {
    await measure(
      "16384 static (8192 grouped / 8192 root)",
      buildScene(16384, { animate: false }),
    );
  });

  it("4096 primitives", async () => {
    await measure(
      "4096 static  (2048 grouped / 2048 root)",
      buildScene(4096, { animate: false }),
    );
    await measure("4096 animating", buildScene(4096, { animate: true }));
  });
});
