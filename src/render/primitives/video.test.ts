import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DrawAPI } from "../types";

// Step 7 of spec/video-primitive-plan.md: video() wired into
// createDrawContext, where the two registries run side by side. This is also
// where the `ownGroup` hook from step 3 finally becomes reachable -- it had no
// consumer until now, so its branch landed uncovered by design and is verified
// here.

const SRC = "clip.mp4";
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 360;

// Every <video> the scene creates, so a test can drive readiness and playback
// without a real media pipeline.
let videoElements: FakeVideoElement[] = [];

class FakeVideoElement {
  src = "";
  duration = 10;
  // Ready immediately: these tests are about wiring, not the readiness gate,
  // which VideoTransport.test.ts covers directly.
  readyState = 2;
  paused = true;
  muted = false;
  playsInline = false;
  crossOrigin: string | null = null;
  loop = false;
  videoWidth = VIDEO_WIDTH;
  videoHeight = VIDEO_HEIGHT;
  currentTime = 0;

  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
}

// Records the arguments of every composite, on whichever surface it landed --
// the target context or a group's offscreen cache surface.
interface DrawImageCall {
  source: unknown;
  args: number[];
}

let drawImageCalls: DrawImageCall[] = [];
let transformCalls: string[] = [];

const createRecordingContext = (): CanvasRenderingContext2D =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "drawImage") {
        return (source: unknown, ...args: number[]) => {
          drawImageCalls.push({ source, args });
        };
      }
      if (property === "rotate") {
        return (radians: number) => transformCalls.push(`rotate:${radians}`);
      }
      if (property === "scale") {
        return (x: number, y: number) => transformCalls.push(`scale:${x},${y}`);
      }
      if (property === "canvas") {
        return { width: 800, height: 600, getContext: () => null };
      }
      if (property === "measureText") {
        return () => ({ width: 10 });
      }
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;

class MockOffscreenCanvas {
  static instances: MockOffscreenCanvas[] = [];

  width: number;
  height: number;
  context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    MockOffscreenCanvas.instances.push(this);
    this.width = width;
    this.height = height;
    this.context = createRecordingContext();
    (this.context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

// Surfaces handed to VideoFrameHold, in creation order.
let holdCanvases: MockOffscreenCanvas[] = [];

const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;
const previousDocument = (globalThis as any).document;

beforeEach(() => {
  videoElements = [];
  drawImageCalls = [];
  transformCalls = [];
  MockOffscreenCanvas.instances = [];
  holdCanvases = [];

  (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  (globalThis as any).document = {
    createElement: (tag: string) => {
      // "canvas" is the frame hold's retained-frame surface (see
      // VideoFrameHold). It is recorded rather than merely tolerated so that
      // the held-frame tests below can assert a frame was actually captured
      // into it, and so an unexpected number of surfaces is still caught.
      if (tag === "canvas") {
        const canvas = new MockOffscreenCanvas(0, 0);
        holdCanvases.push(canvas);
        return canvas;
      }

      if (tag !== "video") {
        throw new Error(`unexpected createElement("${tag}")`);
      }

      const element = new FakeVideoElement();
      videoElements.push(element);
      return element;
    },
  };
});

afterEach(() => {
  (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  (globalThis as any).document = previousDocument;
});

const createScene = async (enableBitmapBasedCaching = false) => {
  const { createDrawContext } = await import("../index");
  const drawContext = createDrawContext({ enableBitmapBasedCaching });
  const context = createRecordingContext();

  let frame = 0;

  return {
    context,
    render: (scene: (draw: DrawAPI) => void) => {
      drawContext.executeDrawCallback(scene, context, 800, 600, frame * 16);
      frame += 1;
    },
  };
};

const videoScene =
  (props: Record<string, unknown> = {}) =>
  (draw: DrawAPI): void => {
    draw.video(SRC, { x: 10, y: 20, width: 200, height: 100, ...props });
  };

describe("video() through the draw API", () => {
  it("creates one <video> element per declaration site and reuses it", async () => {
    const scene = await createScene();

    scene.render(videoScene());
    scene.render(videoScene());
    scene.render(videoScene());

    // One element, not one per frame -- playback would restart otherwise.
    expect(videoElements).toHaveLength(1);
    expect(videoElements[0]?.src).toBe(SRC);
  });

  it("composites the live element itself, not a copy", async () => {
    const scene = await createScene();

    scene.render(videoScene());

    // The element reaching drawImage is what makes this a live video rather
    // than a snapshot -- the browser supplies whichever frame is current.
    expect(drawImageCalls.map((call) => call.source)).toContain(
      videoElements[0],
    );
  });

  it("draws nothing at all before any frame has ever decoded", async () => {
    const scene = await createScene();

    // Only one frame rendered before readiness is withdrawn, so the transport
    // never got as far as its first seek and has no frame retained. This is
    // the one case that legitimately paints nothing.
    scene.render(videoScene());
    const element = videoElements[0]!;
    drawImageCalls = [];

    element.readyState = 0;
    scene.render(videoScene());

    expect(drawImageCalls).toHaveLength(0);
    expect(holdCanvases).toHaveLength(0);
  });

  it("holds the outgoing frame through a readiness gap instead of flashing", async () => {
    // The loop-flash regression, at the level it is actually visible. Seeking
    // drops readyState below paintable for a frame or two; if that window
    // draws nothing, every loop iteration shows a blank frame.
    const scene = await createScene();

    scene.render(videoScene());
    const element = videoElements[0]!;

    // Second frame reaches #beginPlayback, whose seek captures the frame.
    scene.render(videoScene());
    expect(holdCanvases).toHaveLength(1);

    drawImageCalls = [];
    element.readyState = 1; // HAVE_METADATA -- mid-seek, no decoded frame
    scene.render(videoScene());

    // Something was composited, and specifically the retained surface rather
    // than the element (which at this readyState would draw nothing).
    expect(drawImageCalls).toHaveLength(1);
    expect(drawImageCalls[0]?.source).toBe(holdCanvases[0]);
  });

  it("goes back to the live element as soon as it is paintable again", async () => {
    const scene = await createScene();

    scene.render(videoScene());
    const element = videoElements[0]!;
    scene.render(videoScene());

    element.readyState = 1;
    scene.render(videoScene());

    drawImageCalls = [];
    element.readyState = 2;
    scene.render(videoScene());

    // Staying on the held frame would freeze the video permanently -- a much
    // worse bug than the flash it replaced.
    expect(drawImageCalls[0]?.source).toBe(element);
  });

  it("returns an animatable whose container can be animated", async () => {
    const scene = await createScene();

    // The requirement that forced the whole deferred-flush design: the
    // container moves like any other primitive's.
    scene.render((draw) => {
      draw
        .video(SRC, { x: 0, y: 0, width: 100, height: 100 })
        .animateTo({ x: 400 }, { at: 0, duration: 1000 });
    });

    expect(videoElements).toHaveLength(1);
  });

  it("honours fit by cropping the source, not the frame", async () => {
    const scene = await createScene();

    scene.render(videoScene({ fit: "cover", width: 100, height: 100 }));

    const composite = drawImageCalls.find(
      (call) => call.source === videoElements[0],
    );

    // cover against a square frame crops the 640x360 source horizontally, so
    // the call carries source-rect arguments rather than just a destination.
    expect(composite?.args).toHaveLength(8);
  });

  describe("its own cache boundary (the step 3 ownGroup hook)", () => {
    it("gives the video a group of its own, separate from root", async () => {
      // Two surfaces once everything settles: root's and the video's. Without
      // the hook the video would be a bare primitive in root, giving one.
      const scene = await createScene(true);

      for (let frame = 0; frame < 4; frame++) {
        scene.render(videoScene());
        // Playback advancing keeps the video's signature changing, exactly as
        // it would in a real scene.
        videoElements[0]!.currentTime = frame * 0.1;
      }

      expect(MockOffscreenCanvas.instances.length).toBeGreaterThanOrEqual(2);
    });

    it("sizes the video's own surface to its frame, not the canvas", async () => {
      const scene = await createScene(true);

      for (let frame = 0; frame < 4; frame++) {
        scene.render(videoScene({ width: 200, height: 100 }));
        videoElements[0]!.currentTime = frame * 0.1;
      }

      // The group's surface is its own bounds, which is the whole point of a
      // local cache boundary -- a canvas-sized surface per video would defeat
      // it. Device pixel ratio is 1 in this environment.
      const sizes = MockOffscreenCanvas.instances.map(
        (surface) => `${surface.width}x${surface.height}`,
      );

      expect(sizes).toContain("200x100");
    });

    it("uses the ANIMATED bounds for the group, not the declare-time ones", async () => {
      // The direct test of the §5b timing fix, and the one that could not be
      // written at step 3 because nothing consumed the hook yet. The group is
      // opened at flush, so its scope must see the animated width -- opening
      // it at declare time would size the surface from the initial props.
      const scene = await createScene(true);

      const animatedScene = (draw: DrawAPI) => {
        draw
          .video(SRC, { x: 0, y: 0, width: 50, height: 50 })
          .animateTo({ width: 300, height: 300 }, { at: 0, duration: 100 });
      };

      // currentTime deliberately NOT advanced: the video's own signature has
      // to be stable for its group to clear the cache's two-frame promotion
      // gate at all. Ten frames at 16ms puts the last few past the 100ms
      // animation, so the size that gets cached is the settled one.
      for (let frame = 0; frame < 10; frame++) {
        scene.render(animatedScene);
      }

      const sizes = MockOffscreenCanvas.instances.map(
        (surface) => `${surface.width}x${surface.height}`,
      );

      // 300x300 is the animated size; 50x50 would mean the group was built
      // from declare-time props.
      expect(sizes).toContain("300x300");
      expect(sizes).not.toContain("50x50");
    });

    it("does not double-apply the container's transform", async () => {
      // The group's scope applies rotation once, at composite time, so the
      // primitive's own draw must not apply it again. Two rotate calls of the
      // same angle would mean the video is drawn at twice the angle.
      const scene = await createScene(true);

      scene.render(videoScene({ rotate: 45 }));
      scene.render(videoScene({ rotate: 45 }));

      // Counted, not de-duplicated. A Set of distinct angles is size 1 whether
      // the rotation is applied once or twice, so it would pass either way --
      // this assertion was vacuous on the first attempt for exactly that
      // reason. One forward rotation per frame is correct; two would mean the
      // video is drawn at double the declared angle.
      const forwardRotations = transformCalls.filter(
        (call) => call.startsWith("rotate:") && !call.startsWith("rotate:-"),
      );

      expect(forwardRotations).toHaveLength(2);
    });
  });

  describe("teardown", () => {
    it("disposes the element when the declaration stops appearing", async () => {
      const scene = await createScene();

      scene.render(videoScene());
      const element = videoElements[0]!;

      scene.render(() => {
        // Video no longer declared.
      });

      // Paused, src cleared and reloaded -- releasing the decode pipeline and
      // any in-flight request, which dropping the reference alone would not.
      expect(element.pause).toHaveBeenCalled();
      expect(element.src).toBe("");
    });
  });

  describe("keys", () => {
    it("keeps each video's own element across a reorder", async () => {
      const scene = await createScene();

      const list = (ids: string[]) => (draw: DrawAPI) => {
        ids.forEach((id) =>
          draw.video(`${id}.mp4`, {
            key: id,
            x: 0,
            y: 0,
            width: 50,
            height: 50,
          }),
        );
      };

      scene.render(list(["a", "b"]));
      const [elementA, elementB] = videoElements;

      scene.render(list(["b", "a"]));

      // No new elements: each key kept its own. Without the key reaching the
      // transport registry, the two would have swapped -- each drawn in the
      // right place showing the other's footage.
      expect(videoElements).toHaveLength(2);
      expect(elementA?.src).toBe("a.mp4");
      expect(elementB?.src).toBe("b.mp4");
    });

    it("throws on a duplicated video key", async () => {
      const scene = await createScene();

      expect(() =>
        scene.render((draw) => {
          draw.video(SRC, { key: "dup", x: 0, y: 0, width: 10, height: 10 });
          draw.video(SRC, { key: "dup", x: 0, y: 0, width: 10, height: 10 });
        }),
      ).toThrow(/Duplicate key/);
    });
  });
});
