import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DrawAPI } from "./types";

// Paint order must equal declaration order, for every combination of
// containers and plain primitives.
//
// These run end-to-end through executeDrawCallback rather than against
// DrawGroupManager directly, and that is the whole point. The manager is
// append-only and preserves order perfectly when driven synchronously, which
// is how its own unit tests drive it -- so a unit test there cannot see the
// bug these cover. The defect was a TIMING asymmetry between two callers:
// containers push their group node while the scene callback is still running,
// while every queueAnimatable primitive resolves at flush, after it has
// unwound. Appending at flush put every container beneath every sibling
// primitive regardless of source order.
//
// The fix is that capturing a group handle RESERVES the declaration's slot,
// which is then filled at flush. See DrawGroupManager.captureCurrentGroupHandle.

const VIDEO_SRC = "clip.mp4";

// Colours are the labels: they are the cleanest way to tell which primitive
// produced a given fill, since every shape bottoms out in the same calls.
const RED = "#ff0000";
const GREEN = "#00ff00";
const BLUE = "#0000ff";

let paintLog: string[] = [];
let videoElements: FakeVideoElement[] = [];

class FakeVideoElement {
  src = "";
  duration = 10;
  readyState = 2; // HAVE_CURRENT_DATA -- ready to paint immediately
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

// Only operations reaching the REAL target context are logged as "paint".
// Anything drawn into an offscreen surface is a cache detail, not paint order.
const createContext = (isTarget: boolean): CanvasRenderingContext2D => {
  let fillStyle = "none";

  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "drawImage") {
        return (source: unknown) => {
          if (!isTarget) {
            return;
          }

          paintLog.push(
            videoElements.includes(source as FakeVideoElement)
              ? "video"
              : "surface",
          );
        };
      }

      if (property === "fill" || property === "fillRect") {
        return () => {
          if (isTarget) {
            paintLog.push(fillStyle);
          }
        };
      }

      if (property === "canvas") {
        return { width: 800, height: 600, getContext: () => null };
      }

      if (property === "measureText") {
        return () => ({ width: 10 });
      }

      return () => undefined;
    },
    set: (_target, property, value) => {
      if (property === "fillStyle") {
        fillStyle = String(value);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

class MockOffscreenCanvas {
  width: number;
  height: number;
  #context = createContext(false);

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
  paintLog = [];
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

afterEach(() => {
  (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  (globalThis as any).document = previousDocument;
});

// Caching is off for the ordering cases: a promoted surface would replace the
// very fills being asserted with a single blit, hiding the order under it.
// The steady-state caching behaviour gets its own test at the bottom.
const renderScene = async (
  scene: (draw: DrawAPI) => void,
  { frames = 2, caching = false }: { frames?: number; caching?: boolean } = {},
): Promise<string[]> => {
  const { createDrawContext } = await import("./index");
  const drawContext = createDrawContext({ enableBitmapBasedCaching: caching });
  const context = createContext(true);

  for (let frame = 0; frame < frames; frame++) {
    // Cleared each frame so the log holds only the final frame. A video's
    // first frame only assigns its src (the transport is not ready yet), so
    // at least two frames are needed before it composites at all.
    paintLog = [];
    drawContext.executeDrawCallback(scene, context, 800, 600, frame * 16);
  }

  return paintLog;
};

const square = (draw: DrawAPI, fillStyle: string) =>
  draw.rect({ x: 10, y: 10, width: 40, height: 40, fillStyle });

describe("paint order follows declaration order", () => {
  describe("plain primitives against containers", () => {
    it("paints a primitive declared BEFORE a container underneath it", async () => {
      // The general form of the bug, with no video involved: before the fix
      // this produced [GREEN, RED] -- the container jumping in front of a
      // primitive declared ahead of it.
      const log = await renderScene((draw) => {
        square(draw, RED);
        draw.group(() => {
          square(draw, GREEN);
        });
      });

      expect(log).toEqual([RED, GREEN]);
    });

    it("paints a primitive declared AFTER a container on top of it", async () => {
      const log = await renderScene((draw) => {
        draw.group(() => {
          square(draw, GREEN);
        });
        square(draw, RED);
      });

      expect(log).toEqual([GREEN, RED]);
    });

    it("orders a nested container against its own siblings", async () => {
      // The same defect one level down: inside the outer group, RED and BLUE
      // are flush-time primitives while the inner group is declare-time, so
      // before the fix this produced [GREEN, RED, BLUE].
      const log = await renderScene((draw) => {
        draw.group(() => {
          square(draw, RED);
          draw.group(() => {
            square(draw, GREEN);
          });
          square(draw, BLUE);
        });
      });

      expect(log).toEqual([RED, GREEN, BLUE]);
    });

    it("interleaves containers and primitives in declaration order", async () => {
      // The case no amount of "containers first, then overlays" authoring
      // discipline can work around, and the one that pins the fix hardest.
      const log = await renderScene((draw) => {
        square(draw, RED);
        draw.group(() => {
          square(draw, GREEN);
        });
        square(draw, BLUE);
      });

      expect(log).toEqual([RED, GREEN, BLUE]);
    });
  });

  describe("same-kind siblings (regression guards, correct before the fix too)", () => {
    it("keeps two plain primitives in declaration order", async () => {
      const log = await renderScene((draw) => {
        square(draw, RED);
        square(draw, GREEN);
      });

      expect(log).toEqual([RED, GREEN]);
    });

    it("keeps two containers in declaration order", async () => {
      const log = await renderScene((draw) => {
        draw.group(() => square(draw, RED));
        draw.group(() => square(draw, GREEN));
      });

      expect(log).toEqual([RED, GREEN]);
    });
  });

  describe("video(), which has its own group", () => {
    it("paints a video underneath a container declared after it", async () => {
      // The originally reported symptom: a full-canvas video declared first
      // appeared on top of -- and so completely hid -- a group declared after
      // it. video() is the only primitive that nests its own group at flush
      // time, so it exercises the reserved-slot path for groups rather than
      // for primitives.
      const log = await renderScene((draw) => {
        draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
        draw.group(() => {
          square(draw, RED);
        });
      });

      expect(log).toEqual(["video", RED]);
    });

    it("paints a video on top of a container declared before it", async () => {
      const log = await renderScene((draw) => {
        draw.group(() => {
          square(draw, RED);
        });
        draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
      });

      expect(log).toEqual([RED, "video"]);
    });

    it("paints a video underneath a plain primitive declared after it", async () => {
      const log = await renderScene((draw) => {
        draw.video(VIDEO_SRC, { x: 0, y: 0, width: 800, height: 600 });
        square(draw, RED);
      });

      expect(log).toEqual(["video", RED]);
    });
  });

  describe("interaction with the bitmap cache and measurement passes", () => {
    it("still reaches the settled one-blit steady state with containers", async () => {
      // Not a guard on the ordering fix (it passed before it too) but on the
      // fix not having broken caching: reserving a slot per declaration adds
      // an entry to every group's operation list, and if a reserved slot ever
      // reached a group signature, a static scene would re-sign every frame
      // and never settle. A static scene must still collapse to a single
      // full-canvas drawImage -- see the render pipeline report, §2.5.
      const log = await renderScene(
        (draw) => {
          square(draw, RED);
          draw.group(() => {
            square(draw, GREEN);
          });
        },
        { frames: 4, caching: true },
      );

      expect(log).toEqual(["surface"]);
    });

    it("orders correctly around an implicitly-sized container", async () => {
      // An implicitly-sized container runs a measurement pass over its
      // children before declaring them for real, so this path declares each
      // child twice. Ordering has to survive that, and the measurement pass
      // must not leave a slot behind -- which is why the handle is captured
      // after the measurement guard in queueAnimatable rather than before it.
      const log = await renderScene((draw) => {
        square(draw, RED);
        draw.group(() => {
          square(draw, GREEN);
        });
        square(draw, BLUE);
      });

      expect(log).toEqual([RED, GREEN, BLUE]);
    });
  });
});
