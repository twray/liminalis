import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DrawAPI } from "./types";

// A KNOWN FAILING TEST, added deliberately red: a primitive's blend mode stops
// reaching the real backdrop once the primitive sits inside a group whose
// surface has been promoted by the bitmap cache.
//
// Mechanism, traced end to end:
//
//   1. A static group's signature repeats, so DrawGroupBitmapCache.renderGroup
//      promotes it to an isolated offscreen surface
//      (#buildRenderAndCacheSurface).
//   2. The group's children now paint into THAT surface, so a child's
//      globalCompositeOperation composites against the surface's own empty
//      pixels rather than against whatever sits beneath the group.
//   3. The finished surface is blitted into the parent with the default
//      source-over, so the declared blend never reaches the backdrop at all.
//
// This is the same hazard CSS has with stacking contexts: creating a new layer
// cuts mix-blend-mode off from its backdrop, which is why `isolation: isolate`
// exists as an explicit opt-in there. Here the isolation is implicit and
// arrives only once the cache decides to promote, which is what makes it look
// intermittent -- it works on the scene's first frame and then stops.
//
// Not group-specific in principle: any group forced onto its own surface
// isolates its children's blending. Promotion is simply the common way to get
// there. A masking scope (text()'s destination-in pass) takes a surface on
// EVERY frame regardless of caching, so the same loss applies inside one.

const VIDEO_SRC = "clip.mp4";

// A white fill under "difference" is an exact per-channel invert of the
// backdrop, so "did the blend reach the backdrop" is unambiguous: either the
// blend arrives at the target context or nothing inverts.
const BLENDED_RECT = {
  x: 10,
  y: 10,
  width: 40,
  height: 40,
  fillStyle: "#ffffff",
  blend: "difference" as const,
};

interface PaintOp {
  surface: string;
  content: "rect" | "video" | "surface";
  blend: string;
  fillStyle?: string;
}

let paintOps: PaintOp[] = [];
let surfaceCount = 0;
let videoElements: FakeVideoElement[] = [];

class FakeVideoElement {
  src = "";
  duration = 10;
  readyState = 2;
  paused = true;
  ended = false;
  muted = false;
  playsInline = false;
  crossOrigin: string | null = null;
  loop = false;
  videoWidth = 640;
  videoHeight = 360;
  currentTime = 0;

  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn();
  load = vi.fn();
}

// save/restore are modelled, not stubbed. Without them the recorded blend is
// whatever was last assigned anywhere, which reports a stale "difference" long
// after the framework has restored the context -- an earlier version of this
// harness did exactly that and made the bug look like it wasn't there.
const createContext = (surface: string): CanvasRenderingContext2D => {
  let blend = "source-over";
  let alpha = 1;
  let fillStyle = "none";
  const savedBlends: string[] = [];

  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "save") {
        return () => {
          savedBlends.push(blend);
        };
      }

      if (property === "restore") {
        return () => {
          blend = savedBlends.pop() ?? "source-over";
        };
      }

      if (property === "fill" || property === "fillRect") {
        return () =>
          paintOps.push({ surface, content: "rect", blend, fillStyle });
      }

      if (property === "drawImage") {
        return (source: unknown) =>
          paintOps.push({
            surface,
            content: videoElements.includes(source as FakeVideoElement)
              ? "video"
              : "surface",
            blend,
          });
      }

      if (property === "canvas") {
        return { width: 800, height: 600, getContext: () => null };
      }

      if (property === "measureText") {
        return () => ({ width: 10 });
      }

      // Readable, not just writable. The framework now READS these back at
      // declare time to inherit them, so a mock that only records writes
      // silently defeats inheritance and makes it look absent.
      if (property === "globalCompositeOperation") {
        return blend;
      }

      if (property === "globalAlpha") {
        return alpha;
      }

      return () => undefined;
    },
    set: (_target, property, value) => {
      if (property === "globalCompositeOperation") {
        blend = String(value);
      }
      if (property === "fillStyle") {
        fillStyle = String(value);
      }
      if (property === "globalAlpha") {
        alpha = Number(value);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

class MockOffscreenCanvas {
  width: number;
  height: number;
  #context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#context = createContext(`offscreen#${surfaceCount++}`);
    (this.#context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.#context : null;
  }
}

beforeEach(() => {
  paintOps = [];
  surfaceCount = 0;
  videoElements = [];

  (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === "canvas") {
        return new MockOffscreenCanvas(0, 0);
      }

      const element = new FakeVideoElement();
      videoElements.push(element);
      return element;
    },
  };
});

// Five frames, reporting only the last: promotion needs a repeated signature,
// so the isolation this covers does not exist on frame one.
const renderSettled = async (
  scene: (draw: DrawAPI) => void,
  { caching = true }: { caching?: boolean } = {},
): Promise<PaintOp[]> => {
  const { createDrawContext } = await import("./index");
  const drawContext = createDrawContext({ enableBitmapBasedCaching: caching });
  const target = createContext("target");

  for (let frame = 0; frame < 5; frame++) {
    paintOps = [];
    // A playing video advances its clock every frame, so the root group's
    // signature never repeats and the root itself never promotes. Without
    // this the whole scene settles into one root blit and the difference
    // between these cases disappears under it.
    videoElements.forEach((element) => {
      element.currentTime = frame * 0.016;
    });

    drawContext.executeDrawCallback(scene, target, 800, 600, frame * 16);
  }

  return paintOps;
};

const onTarget = (ops: PaintOp[]) =>
  ops.filter((op) => op.surface === "target");

describe("blend modes across a group boundary", () => {
  it("applies a blend against a sibling when the primitive is at root", async () => {
    // The control, and what the grouped case below should match. Passes today.
    const ops = await renderSettled((draw) => {
      draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      draw.rect(BLENDED_RECT);
    });

    expect(
      onTarget(ops).map(({ content, blend }) => ({ content, blend })),
    ).toEqual([
      { content: "video", blend: "source-over" },
      { content: "rect", blend: "difference" },
    ]);
  });

  it("applies a blend against a sibling when the primitive is inside a group", async () => {
    // FAILS TODAY. Both operations reaching the target arrive as source-over:
    //
    //   [ video  source-over,  surface  source-over ]
    //
    // The rect is not among them -- it was painted into the group's own
    // promoted surface, where "difference" had nothing but empty pixels to
    // invert, and that surface was then blitted with the default blend.
    //
    // The assertion is deliberately LOOSE about which operation carries the
    // blend, because more than one fix is defensible: refusing to promote a
    // group that contains a non-default blend would land `rect/difference` on
    // the target, whereas compositing the group's surface under its child's
    // blend would land `surface/difference`. Both satisfy the property that
    // actually matters, so the test pins the property rather than the repair.
    const ops = await renderSettled((draw) => {
      draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      draw.group(() => {
        draw.rect(BLENDED_RECT);
      });
    });

    expect(onTarget(ops).some((op) => op.blend === BLENDED_RECT.blend)).toBe(
      true,
    );
  });

  it("propagates the veto up through every intervening group", async () => {
    // The nesting case: the blend is two levels down, so BOTH the inner and
    // the outer group have to refuse promotion. If only the immediate parent
    // were vetoed, the outer group would still promote and re-isolate the
    // whole subtree -- the blend would be cut off one level higher up
    // instead, which looks identical on screen.
    const ops = await renderSettled((draw) => {
      draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      draw.group(() => {
        draw.group(() => {
          draw.rect(BLENDED_RECT);
        });
      });
    });

    expect(onTarget(ops).some((op) => op.blend === BLENDED_RECT.blend)).toBe(
      true,
    );
  });

  it("does not veto a group whose descendants are all source-over", async () => {
    // The veto has to stay narrow, or it silently disables bitmap caching for
    // every group in every scene. An unblended static group must still settle
    // to a blit rather than repainting its children forever.
    const ops = await renderSettled((draw) => {
      draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      draw.group(() => {
        const { blend: _blend, ...withoutBlend } = BLENDED_RECT;
        draw.rect(withoutBlend);
      });
    });

    expect(onTarget(ops).map((op) => op.content)).toEqual(["video", "surface"]);
  });

  it("applies the blend inside a group while bitmap caching is disabled", async () => {
    // Passes today, and isolates the trigger: with caching off, renderGroup
    // takes its direct draw(targetContext) path, no surface exists, and the
    // blend reaches the real backdrop. Worth keeping as the pin on WHY the
    // case above fails -- it is promotion, not group() itself.
    const ops = await renderSettled(
      (draw) => {
        draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
        draw.group(() => {
          draw.rect(BLENDED_RECT);
        });
      },
      { caching: false },
    );

    expect(
      onTarget(ops).map(({ content, blend }) => ({ content, blend })),
    ).toEqual([
      { content: "video", blend: "source-over" },
      { content: "rect", blend: "difference" },
    ]);
  });
});

// background() is a queued operation in the group tree rather than a direct
// paint on the target context. These cover what that buys.
describe("background() inside the group tree", () => {
  const BACKGROUND = "#101010";

  it("puts the background in the same surface as a blended primitive at root", async () => {
    // The reason root is exempt from the blend veto. A fully static scene
    // promotes root, so a blended primitive at root ends up compositing
    // against root's surface -- which is only correct if the background is in
    // there with it. Painted straight onto the target instead, the blend
    // would invert transparency rather than the background.
    // Every frame's ops, not just the last: root renders into its surface on
    // the frame it is promoted and is a pure blit from then on, so the last
    // frame alone shows no fills at all.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext({ enableBitmapBasedCaching: true });
    const target = createContext("target");
    const allOps: PaintOp[] = [];

    const scene = (draw: DrawAPI) => {
      draw.background({ color: BACKGROUND });
      draw.rect(BLENDED_RECT);
    };

    for (let frame = 0; frame < 4; frame++) {
      paintOps = [];
      drawContext.executeDrawCallback(scene, target, 800, 600, frame * 16);
      allOps.push(...paintOps);
    }

    // Only the fills that landed in an offscreen surface, which is where the
    // question "did the blend have the background beneath it" is decided.
    const fills = allOps.filter(
      (op) => op.content === "rect" && op.surface.startsWith("offscreen"),
    );
    const backgroundFill = fills.find((op) => op.fillStyle === BACKGROUND);
    const blendedFill = fills.find(
      (op) => op.fillStyle === BLENDED_RECT.fillStyle,
    );

    expect(backgroundFill).toBeDefined();
    expect(blendedFill).toBeDefined();
    // Same surface, background first: the blend has it underneath to invert.
    expect(blendedFill!.surface).toBe(backgroundFill!.surface);
    expect(fills.indexOf(backgroundFill!)).toBeLessThan(
      fills.indexOf(blendedFill!),
    );
    expect(blendedFill!.blend).toBe(BLENDED_RECT.blend);
  });

  it("repaints when only the background colour changes", async () => {
    // Being in the tree means being in root's signature. Outside it, a colour
    // change moved no signature, so a settled root would keep blitting a
    // surface rendered with the old colour.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext({ enableBitmapBasedCaching: true });
    const target = createContext("target");

    const sceneWith = (color: string) => (draw: DrawAPI) => {
      draw.background({ color });
      draw.rect({ x: 0, y: 0, width: 10, height: 10, fillStyle: "#ffffff" });
    };

    // Settle on one colour first, so the next frame is a cache hit unless the
    // colour genuinely invalidates.
    for (let frame = 0; frame < 4; frame++) {
      paintOps = [];
      drawContext.executeDrawCallback(
        sceneWith(BACKGROUND),
        target,
        800,
        600,
        frame * 16,
      );
    }

    expect(paintOps.filter((op) => op.content === "rect")).toHaveLength(0);

    paintOps = [];
    drawContext.executeDrawCallback(
      sceneWith("#ff00ff"),
      target,
      800,
      600,
      4 * 16,
    );

    expect(paintOps.some((op) => op.fillStyle === "#ff00ff")).toBe(true);
  });

  it("queues the background exactly once inside an implicitly-sized container", async () => {
    // An implicitly-sized container re-runs its children to measure them
    // before declaring them for real. Without the measurement-pass guard the
    // background is queued twice -- once into the enclosing group by the
    // measurement pass, once into the container -- which double-fills every
    // frame and puts a stray full-canvas fill in the parent.
    const ops = await renderSettled(
      (draw) => {
        draw.group(() => {
          draw.background({ color: BACKGROUND });
          draw.rect({
            x: 20,
            y: 20,
            width: 30,
            height: 30,
            fillStyle: "#abcdef",
          });
        }, {});
      },
      { caching: false },
    );

    expect(ops.filter((op) => op.fillStyle === BACKGROUND)).toHaveLength(1);
  });
});

// Ambient globals set straight on the canvas (reachable via
// RenderProps.context) are snapshotted into a primitive's props at declare
// time. These cover the two things that buys beyond simply painting right.
describe("context globals inherited from the canvas", () => {
  it("vetoes promotion for a group whose child only inherited its blend", async () => {
    // The primitive declares no blend at all -- it inherits "difference" from
    // the canvas. If the snapshot did not reach props, blendsWithBackdrop
    // would read false, the group would promote, and the blend would be lost
    // to surface isolation exactly as a declared one used to be.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext({ enableBitmapBasedCaching: true });
    const target = createContext("target");

    const scene = (draw: DrawAPI) => {
      draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      (
        target as unknown as { globalCompositeOperation: string }
      ).globalCompositeOperation = "difference";
      draw.group(() => {
        draw.rect({
          x: 10,
          y: 10,
          width: 40,
          height: 40,
          fillStyle: "#ffffff",
        });
      });
    };

    for (let frame = 0; frame < 5; frame++) {
      paintOps = [];
      videoElements.forEach((element) => {
        element.currentTime = frame * 0.016;
      });
      drawContext.executeDrawCallback(scene, target, 800, 600, frame * 16);
    }

    // The rect itself reaches the target, under the inherited blend, rather
    // than being sealed inside a promoted surface.
    expect(
      onTarget(paintOps).some(
        (op) => op.content === "rect" && op.blend === "difference",
      ),
    ).toBe(true);
  });

  it("invalidates the cache when only the ambient blend changes", async () => {
    // The correctness hazard that made snapshotting necessary rather than
    // optional. Props are identical across these frames; only the canvas
    // state differs. If the inherited value never entered the signature, the
    // second pass would be a cache hit and would blit a surface rendered
    // under the previous blend -- stale pixels, silently.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext({ enableBitmapBasedCaching: true });
    const target = createContext("target");

    const sceneWith = (blend: string) => (draw: DrawAPI) => {
      draw.background({ color: "#101010" });
      (
        target as unknown as { globalCompositeOperation: string }
      ).globalCompositeOperation = blend;
      draw.rect({ x: 10, y: 10, width: 40, height: 40, fillStyle: "#ffffff" });
    };

    for (let frame = 0; frame < 4; frame++) {
      paintOps = [];
      drawContext.executeDrawCallback(
        sceneWith("difference"),
        target,
        800,
        600,
        frame * 16,
      );
    }

    paintOps = [];
    drawContext.executeDrawCallback(
      sceneWith("screen"),
      target,
      800,
      600,
      4 * 16,
    );

    // The RECT specifically, not just any operation. background() applies
    // whatever blend is live when it paints, so asserting on the whole log
    // passed even with inheritance entirely removed -- it was reading
    // background's ambient behaviour, not the rect's snapshotted blend.
    expect(
      paintOps.some(
        (op) =>
          op.content === "rect" &&
          op.fillStyle === "#ffffff" &&
          op.blend === "screen",
      ),
    ).toBe(true);
  });
});
