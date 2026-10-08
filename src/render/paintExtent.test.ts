import { beforeEach, describe, expect, it } from "vitest";

import type { DrawAPI } from "./types";

// A container with EXPLICIT dimensions keeps those dimensions as its frame --
// that is what descendants measure and position against. But a transformed
// child can paint outside that frame, and the group's cached surface has to be
// big enough to hold what was actually painted, or the content is cropped by
// the surface edge once the group settles and gets promoted.
//
// The bug these cover: the surface was sized from the frame alone, so a
// rotated child was drawn correctly while animating (signature changing every
// frame, never promoted, drawn straight onto the target with no clip) and then
// cropped the instant it settled. Cache-dependent output, which is the worst
// kind -- it looks right until it stops moving.
//
// The fix separates two things that were one value: the FRAME (origin + the
// size getMeasurements reports) and the PAINT EXTENT (frame union'd with any
// overflow, which sizes the surface). The frame is never widened, which is
// what keeps descendants anchored -- see the anchoring tests at the bottom.

const SIDE = 300;
const FRAME_X = 100;
const FRAME_Y = 100;
const ROTATED_AABB_SIDE = SIDE * Math.SQRT2; // ~424.26 for a square at 45deg

interface Blit {
  into: string;
  surface: string;
  surfaceWidth: number;
  surfaceHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Stroke {
  on: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

let blits: Blit[] = [];
let strokes: Stroke[] = [];
let surfaceCount = 0;

// Each context tracks its own accumulated translate, so a draw call's position
// is known within whatever surface it landed on. Because a promoted group blits
// into its PARENT's surface rather than straight onto the canvas, an absolute
// position is only recoverable by composing those offsets -- see toAbsolute.
const createContext = (id: string): CanvasRenderingContext2D => {
  let tx = 0;
  let ty = 0;
  const stack: { tx: number; ty: number }[] = [];

  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property) => {
      if (property === "save") {
        return () => stack.push({ tx, ty });
      }
      if (property === "restore") {
        return () => {
          const previous = stack.pop();
          tx = previous?.tx ?? 0;
          ty = previous?.ty ?? 0;
        };
      }
      if (property === "translate") {
        return (x: number, y: number) => {
          tx += x;
          ty += y;
        };
      }
      // setTransform rebases to the device-pixel-ratio matrix, clearing any
      // translate accumulated on this surface so far.
      if (property === "setTransform") {
        return () => {
          tx = 0;
          ty = 0;
        };
      }
      // roundRect, not rect: a cornerRadius of 0 still routes through it.
      if (property === "rect" || property === "roundRect") {
        return (x: number, y: number, width: number, height: number) => {
          strokes.push({ on: id, x: tx + x, y: ty + y, width, height });
        };
      }
      if (property === "drawImage") {
        return (
          source: { width?: number; height?: number; __id?: string },
          x: number,
          y: number,
          width: number,
          height: number,
        ) => {
          blits.push({
            into: id,
            surface: source?.__id ?? "?",
            surfaceWidth: source?.width ?? -1,
            surfaceHeight: source?.height ?? -1,
            x: tx + x,
            y: ty + y,
            width,
            height,
          });
        };
      }
      if (property === "canvas") {
        return { width: 1000, height: 1000, getContext: () => null };
      }
      if (property === "measureText") {
        return () => ({ width: 10 });
      }
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
};

class MockOffscreenCanvas {
  width: number;
  height: number;
  __id: string;
  #context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.__id = `s${surfaceCount++}`;
    this.#context = createContext(this.__id);
    (this.#context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.#context : null;
  }
}

// Walks a draw call's position up through every surface that carried it, to an
// absolute canvas coordinate. This is what makes "did the rect move?" an
// answerable question rather than "was it handed the same local coordinates".
const toAbsolute = (stroke: Stroke): { x: number; y: number } => {
  let { x, y } = stroke;
  let surface = stroke.on;

  for (let hop = 0; hop < 10 && surface !== "target"; hop++) {
    const carrier = blits.find((blit) => blit.surface === surface);

    if (!carrier) {
      break;
    }

    x += carrier.x;
    y += carrier.y;
    surface = carrier.into;
  }

  return { x, y };
};

beforeEach(() => {
  blits = [];
  strokes = [];
  surfaceCount = 0;
  (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
  (globalThis as any).document = {
    createElement: () => new MockOffscreenCanvas(0, 0),
  };
});

// A static scene promotes on its second repeat, so a few frames are needed
// before the cached path is the one under test.
const renderSettled = async (
  scene: (draw: DrawAPI) => void,
  { caching = true, frames = 4 }: { caching?: boolean; frames?: number } = {},
) => {
  const { createDrawContext } = await import("./index");
  const drawContext = createDrawContext({ enableBitmapBasedCaching: caching });
  const target = createContext("target");

  const perFrame: { blits: Blit[]; strokes: Stroke[] }[] = [];

  for (let frame = 0; frame < frames; frame++) {
    blits = [];
    strokes = [];
    drawContext.executeDrawCallback(scene, target, 1000, 1000, frame * 16);
    perFrame.push({ blits: [...blits], strokes: [...strokes] });
  }

  // The LAST frame that actually painted its children, rather than the last
  // frame outright. Once everything settles, a cache hit blits a surface and
  // redraws nothing -- so the frame of interest is the one where the surface
  // was built, which is the cached path under test.
  const painted = [...perFrame].reverse().find((f) => f.strokes.length > 0);
  const chosen = painted ?? perFrame[perFrame.length - 1]!;

  // toAbsolute reads the module-level blits, so restore the chosen frame's.
  blits = chosen.blits;
  strokes = chosen.strokes;

  return chosen;
};

// The layer's own surface, as distinct from root's full-canvas one.
const layerSurfaceBlit = (observed: Blit[]) =>
  observed.find((blit) => blit.surfaceWidth > 0 && blit.surfaceWidth < 1000);

const layerAt = (
  draw: DrawAPI,
  body: (width: number, height: number) => void,
  options: Record<string, unknown> = {},
) =>
  draw.render.layer(
    (frame) => {
      const { width, height } = frame.util.getMeasurements();
      body(width, height);
    },
    { x: FRAME_X, y: FRAME_Y, width: SIDE, height: SIDE, ...options },
  );

// group() children author in the SURROUNDING coordinate space, not from a
// frame origin, so they are placed at absolute coordinates directly.
const groupAt = (
  draw: DrawAPI,
  body: () => void,
  options: Record<string, unknown> = {},
) => draw.render.group(body, { x: FRAME_X, y: FRAME_Y, ...options } as never);

// A small marker, found by its distinctive size, whose absolute position is
// the thing under test.
const MARKER = 12;

const marker = (draw: DrawAPI, at: { x: number; y: number }) =>
  draw.render.rect({ ...at, width: MARKER, height: MARKER });

const markerPosition = (strokeList: Stroke[]) => {
  const found = strokeList.find(
    (stroke) => Math.abs(stroke.width - MARKER) < 1,
  );

  expect(found).toBeDefined();

  return toAbsolute(found!);
};

// Content inside a group must hold its position in the scene no matter what
// transforms its siblings take on. It previously did not: groupOffset was
// derived from the content's own bounding box
// (frameBounds.x - derivedBounds.x), so a sibling rotating -- which grows that
// box leftward -- shifted everything inside to keep the box's left edge pinned
// to the declared x. A static marker drifted ~45px while nothing about it
// changed.
describe("group() anchoring: content never drifts", () => {
  const withSibling = async (transform: Record<string, number>) => {
    const { strokes: observed } = await renderSettled((draw) => {
      groupAt(draw, () => {
        marker(draw, { x: FRAME_X, y: FRAME_Y });

        draw.render.rect({
          x: FRAME_X,
          y: FRAME_Y,
          width: SIDE,
          height: SIDE,
          ...transform,
        });
      });
    });

    return markerPosition(observed);
  };

  it("holds a marker's position when a sibling rotates", async () => {
    const atRest = await withSibling({ rotate: 0 });
    const rotated = await withSibling({ rotate: 45 });

    expect(rotated).toEqual(atRest);
  });

  it("holds a marker's position when a sibling scales up", async () => {
    // Scaling about the sibling's own centre grows its bounds in every
    // direction, so this moves the content's bounding box too.
    const atRest = await withSibling({ scale: 1 });
    const scaled = await withSibling({ scale: 1.6 });

    expect(scaled).toEqual(atRest);
  });

  it("holds a marker's position across a range of sibling rotations", async () => {
    // Not just two samples: the drift was proportional to how far the bounding
    // box grew, so a partial rotation drifted by a partial amount.
    const positions: { x: number; y: number }[] = [];

    for (const rotate of [0, 15, 30, 45, 60, 90]) {
      positions.push(await withSibling({ rotate }));
    }

    positions.forEach((position) => {
      expect(position).toEqual(positions[0]);
    });
  });

  it("leaves content where it was authored when the group declares no x/y", async () => {
    const { strokes: observed } = await renderSettled((draw) => {
      draw.render.group(() => {
        marker(draw, { x: FRAME_X, y: FRAME_Y });
        draw.render.rect({
          x: FRAME_X,
          y: FRAME_Y,
          width: SIDE,
          height: SIDE,
          rotate: 45,
        });
      });
    });

    expect(markerPosition(observed)).toEqual({ x: FRAME_X, y: FRAME_Y });
  });

  it("does not compound drift through nested groups", async () => {
    const run = async (rotate: number) => {
      const { strokes: observed } = await renderSettled((draw) => {
        groupAt(draw, () => {
          draw.render.group(
            () => {
              marker(draw, { x: FRAME_X, y: FRAME_Y });
              draw.render.rect({
                x: FRAME_X,
                y: FRAME_Y,
                width: SIDE,
                height: SIDE,
                rotate,
              });
            },
            { x: FRAME_X, y: FRAME_Y } as never,
          );
        });
      });

      return markerPosition(observed);
    };

    expect(await run(45)).toEqual(await run(0));
  });
});

describe("container paint extent vs declared frame", () => {
  describe("a child that stays inside the frame", () => {
    it("reports the frame's own size to its children", async () => {
      // The explicit dimensions are what getMeasurements returns, and that
      // must not change -- a child sizing itself from an EXPANDED frame would
      // grow, which would grow the frame, without end.
      let measured: { width: number; height: number } | null = null;

      await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          measured = { width, height };
          draw.render.rect({ x: 0, y: 0, width, height, scale: 0.75 });
        });
      });

      expect(measured).toEqual({ width: SIDE, height: SIDE });
    });

    it("sizes the surface to the frame when a scaled-down child fits inside it", async () => {
      // scale 0.75 of a frame-filling rect sits entirely within the frame, so
      // there is nothing to expand for: 300x300, exactly as declared.
      const { blits: observed } = await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          draw.render.rect({ x: 0, y: 0, width, height, scale: 0.75 });
        });
      });

      const layerBlit = layerSurfaceBlit(observed);

      expect(layerBlit).toBeDefined();
      expect(layerBlit!.surfaceWidth).toBe(SIDE);
      expect(layerBlit!.surfaceHeight).toBe(SIDE);
    });
  });

  describe("a child that overflows the frame", () => {
    it("expands the surface to cover a 45-degree rotated child", async () => {
      // THE REGRESSION. A frame-filling square rotated 45deg has an AABB of
      // 300*sqrt(2) ~= 424 per side. Sized from the frame alone, the surface
      // was 300x300 and cropped ~62px off every edge once promoted.
      const { blits: observed } = await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
        });
      });

      const layerBlit = layerSurfaceBlit(observed);

      expect(layerBlit).toBeDefined();
      expect(layerBlit!.surfaceWidth).toBeGreaterThanOrEqual(
        Math.floor(ROTATED_AABB_SIDE),
      );
      expect(layerBlit!.surfaceHeight).toBeGreaterThanOrEqual(
        Math.floor(ROTATED_AABB_SIDE),
      );
    });

    it("blits the expanded surface back shifted up and left, not at the frame origin", async () => {
      // The overflow reaches above and left of the frame, into negative local
      // coordinates. A canvas has no negative pixels, so the surface origin
      // shifts to cover them -- and the blit shifts by the same amount in the
      // opposite direction, or the whole layer lands in the wrong place.
      const { blits: observed } = await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
        });
      });

      const layerBlit = layerSurfaceBlit(observed);

      expect(layerBlit!.x).toBeLessThan(FRAME_X);
      expect(layerBlit!.y).toBeLessThan(FRAME_Y);
    });

    it("still reports the declared frame size to its children while overflowing", async () => {
      // The whole reason expansion is safe: it is invisible to descendants.
      let measured: { width: number; height: number } | null = null;

      await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          measured = { width, height };
          draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
        });
      });

      expect(measured).toEqual({ width: SIDE, height: SIDE });
    });
  });

  // The question this design turns on: expanding the paint extent must not move
  // anything. The frame's origin is what descendants author against and is
  // deliberately left alone -- only the surface extent and the compensating
  // blit offset change.
  describe("anchoring: an absolutely positioned child does not move when the container expands", () => {
    const anchoredAt = async (
      overflowing: boolean,
      marker: { x: number; y: number },
    ) => {
      const { strokes: observed } = await renderSettled((draw) => {
        layerAt(draw, (width, height) => {
          // The anchored marker, small enough never to overflow on its own.
          draw.render.rect({ ...marker, width: 10, height: 10 });
          // A sibling that either fits, or forces the container to expand.
          draw.render.rect({
            x: 0,
            y: 0,
            width,
            height,
            ...(overflowing ? { rotate: 45 } : { scale: 0.75 }),
          });
        });
      });

      const markerStroke = observed[0];
      expect(markerStroke).toBeDefined();

      return toAbsolute(markerStroke!);
    };

    it("keeps a child at local 0,0 at the same absolute position", async () => {
      const withoutOverflow = await anchoredAt(false, { x: 0, y: 0 });
      const withOverflow = await anchoredAt(true, { x: 0, y: 0 });

      // Local 0,0 is the frame origin, which is where it must stay.
      expect(withoutOverflow).toEqual({ x: FRAME_X, y: FRAME_Y });
      expect(withOverflow).toEqual(withoutOverflow);
    });

    it("keeps a child at a non-zero local offset at the same absolute position", async () => {
      const withoutOverflow = await anchoredAt(false, { x: 40, y: 25 });
      const withOverflow = await anchoredAt(true, { x: 40, y: 25 });

      expect(withoutOverflow).toEqual({ x: FRAME_X + 40, y: FRAME_Y + 25 });
      expect(withOverflow).toEqual(withoutOverflow);
    });
  });

  // Paint extent propagates upward; SIZE does not. If the two shared one
  // channel, an implicitly-sized ancestor would grow to fit a descendant's
  // overflow -- and since its children size themselves from its measurements,
  // the growth would feed itself frame after frame without settling.
  describe("overflow does not grow an implicitly-sized ancestor", () => {
    it("sizes an implicit ancestor from its children's layout bounds, not their overflow", async () => {
      const { strokes: observed } = await renderSettled((draw) => {
        draw.render.layer(
          (outer) => {
            // An explicitly-sized inner container whose child overflows it.
            draw.render.layer(
              (inner) => {
                const { width, height } = inner.util.getMeasurements();
                draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
              },
              { x: 0, y: 0, width: SIDE, height: SIDE },
            );

            // Declared AFTER the inner container, so it measures the ancestor
            // once that container has reported upward. Its drawn width is the
            // ancestor's derived size, made observable.
            const { width } = outer.util.getMeasurements();
            draw.render.rect({ x: 0, y: 0, width, height: 5 });
          },
          // No width/height: this ancestor derives its own size.
          { x: FRAME_X, y: FRAME_Y },
        );
      });

      // The 5px-tall probe rect carries the measured width.
      const probe = observed.find((stroke) => Math.abs(stroke.height - 5) < 2);

      expect(probe).toBeDefined();
      // The inner container's declared 300, not the ~424 it paints. The
      // ancestor still PAINTS the overflow (covered above) -- it just is not
      // SIZED by it, which is what stops the growth feeding itself.
      expect(probe!.width).toBeLessThan(SIDE + 5);
    });
  });

  describe("showBounds reflects what is painted", () => {
    it("draws the debug rect around the expanded extent, not the declared frame", async () => {
      const { strokes: observed } = await renderSettled((draw) => {
        layerAt(
          draw,
          (width, height) => {
            draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
          },
          { showBounds: true },
        );
      });

      // The overlay rect spans the whole extent, so it is the widest rect
      // drawn in the layer's own space -- previously it was the declared 300.
      const widest = Math.max(...observed.map((stroke) => stroke.width));

      expect(widest).toBeGreaterThanOrEqual(Math.floor(ROTATED_AABB_SIDE));
    });

    it("keeps the debug rect at the declared frame when nothing overflows", async () => {
      const { strokes: observed } = await renderSettled((draw) => {
        layerAt(
          draw,
          (width, height) => {
            draw.render.rect({ x: 0, y: 0, width, height, scale: 0.75 });
          },
          { showBounds: true },
        );
      });

      // A scaled-down child sits inside the frame, so the overlay still spans
      // the declared size rather than something larger.
      const widest = Math.max(...observed.map((stroke) => stroke.width));

      expect(widest).toBeLessThan(SIDE + 5);
    });
  });

  describe("the cached and uncached paths agree", () => {
    it("draws the overflowing child at the same absolute position either way", async () => {
      // The defect was that these two disagreed: uncached rendered the
      // overflow, cached cropped it. Whatever else changes, a child's absolute
      // position must not depend on whether its group happened to be promoted.
      const scene = (draw: DrawAPI) => {
        layerAt(draw, (width, height) => {
          draw.render.rect({ x: 0, y: 0, width: 10, height: 10 });
          draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
        });
      };

      const uncached = await renderSettled(scene, { caching: false });
      const uncachedPosition = toAbsolute(uncached.strokes[0]!);

      const cached = await renderSettled(scene, { caching: true });
      const cachedPosition = toAbsolute(cached.strokes[0]!);

      expect(uncachedPosition).toEqual({ x: FRAME_X, y: FRAME_Y });
      expect(cachedPosition).toEqual(uncachedPosition);
    });
  });

  // Two deliberate limitations, asserted so they are recorded facts rather
  // than assumptions, and so the day either is addressed the test says so.
  describe("known limits of this fix", () => {
    it("never widens a group(), whose frame is always its content", async () => {
      // group() cannot be given dimensions at all, so its frame IS the union
      // of what its children painted and overflow cannot arise. The surface
      // should match the content, not be inflated on top of it.
      const { blits: observed } = await renderSettled((draw) => {
        draw.render.group(() => {
          draw.render.rect({ x: 0, y: 0, width: SIDE, height: SIDE, rotate: 45 });
        });
      });

      const groupBlit = layerSurfaceBlit(observed);

      if (groupBlit) {
        // The child's own AABB, give or take stroke inflation -- NOT that
        // union'd with a separate 300x300 frame on top of it.
        expect(groupBlit.surfaceWidth).toBeLessThan(ROTATED_AABB_SIDE + 5);
      }
    });

    it("propagates overflow to an ancestor, not just the nearest container", async () => {
      // The inner layer expands for its rotated child, and reports that
      // expanded extent upward, so the OUTER layer's surface covers it too.
      // Without propagation the overflow was simply cropped one level higher.
      const { blits: observed } = await renderSettled((draw) => {
        draw.render.layer(
          () => {
            draw.render.layer(
              (inner) => {
                const { width, height } = inner.util.getMeasurements();
                draw.render.rect({ x: 0, y: 0, width, height, rotate: 45 });
              },
              { x: 0, y: 0, width: SIDE, height: SIDE },
            );
          },
          { x: FRAME_X, y: FRAME_Y, width: SIDE, height: SIDE },
        );
      });

      // Every container surface between the rotated child and the canvas has
      // to be at least as big as the child's AABB, or whichever one is too
      // small becomes the new crop.
      const containerSurfaces = observed
        .filter((blit) => blit.surfaceWidth > 0 && blit.surfaceWidth < 1000)
        .map((blit) => blit.surfaceWidth);

      expect(containerSurfaces.length).toBeGreaterThanOrEqual(2);
      containerSurfaces.forEach((width) => {
        expect(width).toBeGreaterThanOrEqual(Math.floor(ROTATED_AABB_SIDE));
      });
    });
  });
});
