import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ISOMETRIC_STYLES } from "../common";
import {
  createSpyMockContext,
  createMinimalMockCanvasContext as createMockContext,
} from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("isometric overlay warnings", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns only once when 2D primitives are called inside isometric(), even across frames", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.isometric(() => {
          d.render.rect({ x: 10, y: 20, width: 30, height: 40 });
          d.render.rect({ x: 40, y: 60, width: 30, height: 40 });
          d.render.circle({ cx: 100, cy: 120, radius: 12 });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    drawContext.executeDrawCallback(
      (d) => {
        d.render.isometric(() => {
          d.render.circle({ cx: 150, cy: 150, radius: 16 });
        });
      },
      mockContext,
      800,
      600,
      16,
    );

    const warningMessages = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes("[liminalis] 2D shape primitive"));

    expect(warningMessages).toHaveLength(1);
  });

  it("does not warn for 2D primitives used outside isometric()", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.rect({ x: 10, y: 20, width: 30, height: 40 });
        d.render.circle({ cx: 100, cy: 120, radius: 12 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("respects top-level draw order between circle and isometric cuboid", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.circle({
          cx: 200,
          cy: 200,
          radius: 120,
          fillStyle: "#fff",
          strokeStyle: "transparent",
        });

        d.render.isometric(({ render }) => {
          render.cuboid({
            isoX: 0,
            isoY: 0,
            isoZ: -10,
            lengthX: 10,
            lengthY: 10,
            lengthZ: 10,
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    const circleOrder = vi.mocked(mockContext.ellipse).mock
      .invocationCallOrder[0];
    const isometricOrder = vi.mocked(mockContext.moveTo).mock
      .invocationCallOrder[0];

    expect(circleOrder).toBeDefined();
    expect(isometricOrder).toBeDefined();

    if (circleOrder === undefined || isometricOrder === undefined) {
      throw new Error("Expected both circle and isometric draw calls");
    }

    expect(circleOrder).toBeLessThan(isometricOrder);
  });
});

describe("isometric() default viewport sizing", () => {
  it("defaults to the outer canvas size at the top level", async () => {
    vi.resetModules();
    vi.doMock("../IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("../index");
    const { default: MockedIsometricView } =
      (await import("../IsometricView")) as unknown as {
        default: { calls: Array<{ width: number; height: number }> };
      };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.isometric(() => {});
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 800, height: 600 }]);

    vi.doUnmock("../IsometricView");
  });

  it("defaults to the nearest enclosing container's measurements when nested in layer()", async () => {
    vi.resetModules();
    vi.doMock("../IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("../index");
    const { default: MockedIsometricView } =
      (await import("../IsometricView")) as unknown as {
        default: { calls: Array<{ width: number; height: number }> };
      };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.layer(
          () => {
            d.render.isometric(() => {});
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 200, height: 100 }]);

    vi.doUnmock("../IsometricView");
  });

  it("defaults to the innermost container's measurements when doubly nested", async () => {
    vi.resetModules();
    vi.doMock("../IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("../index");
    const { default: MockedIsometricView } =
      (await import("../IsometricView")) as unknown as {
        default: { calls: Array<{ width: number; height: number }> };
      };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.layer(
          () => {
            // A layer, not a group: the innermost container here exists to
            // give its descendants a sized coordinate space, which is
            // layer()'s role. group() derives its frame from its children and
            // has no dimensions to declare.
            d.render.layer(
              () => {
                d.render.isometric(() => {});
              },
              { x: 0, y: 0, width: 50, height: 40 },
            );
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 50, height: 40 }]);

    vi.doUnmock("../IsometricView");
  });

  it("still honors an explicit width/height even when nested", async () => {
    vi.resetModules();
    vi.doMock("../IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("../index");
    const { default: MockedIsometricView } =
      (await import("../IsometricView")) as unknown as {
        default: { calls: Array<{ width: number; height: number }> };
      };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.layer(
          () => {
            d.render.isometric(() => {}, { width: 30, height: 20 });
          },
          { x: 0, y: 0, width: 200, height: 100 },
        );
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 30, height: 20 }]);

    vi.doUnmock("../IsometricView");
  });

  it("reverts to the outer canvas size again after leaving the container", async () => {
    vi.resetModules();
    vi.doMock("../IsometricView", () => {
      class MockIsometricView {
        static calls: Array<{ width: number; height: number }> = [];

        constructor(_context: unknown, width: number, height: number) {
          MockIsometricView.calls.push({ width, height });
        }

        render(): void {}
      }

      return { default: MockIsometricView };
    });

    const { createDrawContext } = await import("../index");
    const { default: MockedIsometricView } =
      (await import("../IsometricView")) as unknown as {
        default: { calls: Array<{ width: number; height: number }> };
      };

    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.layer(() => {}, { x: 0, y: 0, width: 200, height: 100 });
        d.render.isometric(() => {});
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(MockedIsometricView.calls).toEqual([{ width: 800, height: 600 }]);

    vi.doUnmock("../IsometricView");
  });
});

// Records what each frame's IsometricView was asked to lay out, so a test can
// read the props a tile or cuboid was RESOLVED to (after animation) without
// reverse-engineering them from canvas path calls. One record per view, and
// a view is constructed once per isometric() per painted frame.
interface RecordedIsometricView {
  tiles: Array<Record<string, unknown>>;
  cuboids: Array<Record<string, unknown>>;
}

const loadDrawContextWithRecordingIsometricView = async () => {
  vi.resetModules();

  const views: RecordedIsometricView[] = [];

  vi.doMock("../IsometricView", () => {
    class RecordingIsometricView {
      #record: RecordedIsometricView = { tiles: [], cuboids: [] };

      constructor() {
        views.push(this.#record);
      }

      addTileAt(props: Record<string, unknown>): void {
        this.#record.tiles.push(props);
      }

      addCuboidAt(props: Record<string, unknown>): void {
        this.#record.cuboids.push(props);
      }

      render(): void {}
    }

    return { default: RecordingIsometricView };
  });

  const { createDrawContext } = await import("../index");

  return { createDrawContext, views };
};

describe("isometric primitive animation", () => {
  afterEach(() => {
    vi.doUnmock("../IsometricView");
  });

  it("interpolates a tile's transform and opacity across frames, leaving its grid position untouched", async () => {
    const { createDrawContext, views } =
      await loadDrawContextWithRecordingIsometricView();
    const drawContext = createDrawContext();

    for (const timeInMs of [0, 500, 1000]) {
      drawContext.executeDrawCallback(
        (d) => {
          d.render.isometric(({ render }) => {
            render
              .tile({
                type: "base",
                isoX: 2,
                isoY: 1,
                isoZ: 0,
                width: 1,
                height: 1,
              })
              .animateTo(
                { translateZ: 40, opacity: 0, scale: 0.5 },
                { duration: 1000 },
              );
          });
        },
        createMockContext(),
        800,
        600,
        timeInMs,
      );
    }

    expect(views).toHaveLength(3);
    expect(views.map((view) => view.tiles[0])).toMatchObject([
      { translateZ: 0, opacity: 1, scale: 1, isoX: 2, isoY: 1, isoZ: 0 },
      { translateZ: 20, opacity: 0.5, scale: 0.75, isoX: 2, isoY: 1, isoZ: 0 },
      { translateZ: 40, opacity: 0, scale: 0.5, isoX: 2, isoY: 1, isoZ: 0 },
    ]);
  });

  it("interpolates a cuboid's transform and opacity across frames", async () => {
    const { createDrawContext, views } =
      await loadDrawContextWithRecordingIsometricView();
    const drawContext = createDrawContext();

    for (const timeInMs of [0, 250, 1000]) {
      drawContext.executeDrawCallback(
        (d) => {
          d.render.isometric(({ render }) => {
            render
              .cuboid({
                isoX: 0,
                isoY: 0,
                isoZ: 0,
                lengthX: 2,
                lengthY: 2,
                lengthZ: 3,
                translateX: 10,
              })
              .animateTo({ translateX: 50, opacity: 0.2 }, { duration: 1000 });
          });
        },
        createMockContext(),
        800,
        600,
        timeInMs,
      );
    }

    expect(views.map((view) => view.cuboids[0])).toMatchObject([
      { translateX: 10, opacity: 1, lengthZ: 3 },
      { translateX: 20, opacity: 0.8, lengthZ: 3 },
      { translateX: 50, opacity: expect.closeTo(0.2), lengthZ: 3 },
    ]);
  });

  it("gives each primitive in one view its own animation", async () => {
    const { createDrawContext, views } =
      await loadDrawContextWithRecordingIsometricView();
    const drawContext = createDrawContext();

    for (const timeInMs of [0, 500]) {
      drawContext.executeDrawCallback(
        (d) => {
          d.render.isometric(({ render }) => {
            render
              .tile({
                type: "base",
                isoX: 0,
                isoY: 0,
                isoZ: 0,
                width: 1,
                height: 1,
              })
              .animateTo({ translateZ: 100 }, { duration: 1000 });
            render.tile({
              type: "base",
              isoX: 1,
              isoY: 0,
              isoZ: 0,
              width: 1,
              height: 1,
            });
            render
              .cuboid({
                isoX: 3,
                isoY: 3,
                isoZ: 0,
                lengthX: 1,
                lengthY: 1,
                lengthZ: 1,
              })
              .animateTo({ translateY: -10 }, { duration: 500 });
          });
        },
        createMockContext(),
        800,
        600,
        timeInMs,
      );
    }

    const [, secondFrame] = views;

    expect(secondFrame?.tiles[0]).toMatchObject({ translateZ: 50 });
    expect(secondFrame?.tiles[1]?.translateZ).toBeUndefined();
    expect(secondFrame?.cuboids[0]).toMatchObject({ translateY: -10 });
  });

  it("applies inherited styles to tiles, with a tile's own style taking precedence", async () => {
    const { createDrawContext, views } =
      await loadDrawContextWithRecordingIsometricView();
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.withStyles({ fillStyle: "#f00", strokeWidth: 3 }, () => {
          d.render.isometric(({ render }) => {
            const tileProps = {
              type: "base" as const,
              isoY: 0,
              isoZ: 0,
              width: 1,
              height: 1,
            };

            render.tile({ ...tileProps, isoX: 0 });
            render.tile({ ...tileProps, isoX: 1, fillStyle: "#00f" });
          });
        });
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(views[0]?.tiles).toMatchObject([
      { fillStyle: "#f00", strokeWidth: 3 },
      { fillStyle: "#00f", strokeWidth: 3 },
    ]);
  });

  // The shape family's defaults (a #333 stroke) used to leak into isometric
  // primitives as if the caller had applied them, overriding the isometric
  // family's own transparent stroke.
  it.each([
    {
      scenario: "no styles at all",
      applied: null,
      expected: DEFAULT_ISOMETRIC_STYLES,
    },
    {
      scenario: "a withStyles() that sets only strokeWidth",
      applied: { strokeWidth: 3 },
      expected: { ...DEFAULT_ISOMETRIC_STYLES, strokeWidth: 3 },
    },
    {
      scenario: "a withStyles() that sets strokeStyle",
      applied: { strokeStyle: "#f00" },
      expected: { ...DEFAULT_ISOMETRIC_STYLES, strokeStyle: "#f00" },
    },
  ])(
    "resolves a cuboid to the isometric family's defaults, not the shape family's, given $scenario",
    async ({ applied, expected }) => {
      const { createDrawContext, views } =
        await loadDrawContextWithRecordingIsometricView();
      const drawContext = createDrawContext();

      const declareCuboid = (d: import("../types").DrawAPI): void => {
        d.render.isometric(({ render }) => {
          render.cuboid({
            isoX: 0,
            isoY: 0,
            isoZ: 0,
            lengthX: 1,
            lengthY: 1,
            lengthZ: 1,
          });
        });
      };

      drawContext.executeDrawCallback(
        (d) => {
          if (applied) {
            d.render.withStyles(applied, () => declareCuboid(d));
          } else {
            declareCuboid(d);
          }
        },
        createMockContext(),
        800,
        600,
        0,
      );

      expect(views[0]?.cuboids[0]).toMatchObject(expected);
    },
  );

  // group() always runs a measurement pass over its content before the real
  // one. isometric() used to register and paint in both, building its view
  // twice; now that tiles carry animation identity, a second registration
  // would also hand every tile two identities.
  it("builds one view per frame when nested in group(), and its tiles keep animating", async () => {
    const { createDrawContext, views } =
      await loadDrawContextWithRecordingIsometricView();
    const drawContext = createDrawContext();

    for (const timeInMs of [0, 500]) {
      drawContext.executeDrawCallback(
        (d) => {
          d.render.group(() => {
            d.render.isometric(({ render }) => {
              render
                .tile({
                  type: "base",
                  isoX: 0,
                  isoY: 0,
                  isoZ: 0,
                  width: 1,
                  height: 1,
                })
                .animateTo({ translateZ: 40 }, { duration: 1000 });
            });
          });
        },
        createMockContext(),
        800,
        600,
        timeInMs,
      );
    }

    expect(views).toHaveLength(2);
    expect(views[1]?.tiles).toHaveLength(1);
    expect(views[1]?.tiles[0]).toMatchObject({ translateZ: 20 });
  });
});

describe("isometric() identity scoping", () => {
  // The x a rect was painted at in the most recent frame, read off the
  // roundRect path the rect primitive traces.
  const lastPaintedRectX = (context: CanvasRenderingContext2D): unknown =>
    vi.mocked(context.roundRect).mock.calls.at(-1)?.[0];

  it("does not let a varying number of tiles (or a suppressed 2D call) shift the identity of a sibling declared after it", async () => {
    vi.resetModules();
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const tileProps = {
      type: "base" as const,
      isoY: 0,
      isoZ: 0,
      width: 1,
      height: 1,
    };

    const drawFrame = (tileCount: number, timeInMs: number): void => {
      drawContext.executeDrawCallback(
        (d) => {
          d.render.isometric(({ render }) => {
            for (let isoX = 0; isoX < tileCount; isoX++) {
              render.tile({ ...tileProps, isoX });
            }

            if (tileCount === 1) {
              d.render.rect({ x: 0, y: 0, width: 10, height: 10 });
            }
          });

          d.render
            .rect({ x: 0, y: 0, width: 20, height: 20, fillStyle: "#fff" })
            .animateTo({ x: 100 }, { duration: 1000 });
        },
        mockContext,
        800,
        600,
        timeInMs,
      );
    };

    drawFrame(1, 0);
    drawFrame(4, 500);

    // Had the sibling rect inherited a different identity at t=500, it would
    // have started a fresh animation from x: 0 instead of continuing.
    expect(lastPaintedRectX(mockContext)).toBe(50);

    warnSpy.mockRestore();
  });
});

describe("2D primitives inside isometric()", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("draws nothing, runs no frame callbacks, and returns a chainable no-op", async () => {
    vi.resetModules();
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const circleFrame = vi.fn();
    const groupFrame = vi.fn();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.isometric(() => {
          d.render
            .rect({ x: 10, y: 20, width: 30, height: 40, fillStyle: "#fff" })
            .animateTo({ x: 100 }, { duration: 500 })
            .loop();
          d.render.circle({ cx: 50, cy: 50, radius: 10 }, circleFrame);
          d.render.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 } });
          d.render.group(groupFrame);
          d.render.background({ color: "#000" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.roundRect).not.toHaveBeenCalled();
    expect(mockContext.ellipse).not.toHaveBeenCalled();
    expect(mockContext.lineTo).not.toHaveBeenCalled();
    expect(mockContext.fillRect).not.toHaveBeenCalled();
    expect(circleFrame).not.toHaveBeenCalled();
    expect(groupFrame).not.toHaveBeenCalled();
  });

  it("still renders the isometric content declared alongside them", async () => {
    vi.resetModules();
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.render.isometric(({ render }) => {
          d.render.rect({ x: 10, y: 20, width: 30, height: 40 });
          render.cuboid({
            isoX: 0,
            isoY: 0,
            isoZ: 0,
            lengthX: 1,
            lengthY: 1,
            lengthZ: 1,
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.moveTo).toHaveBeenCalled();
    expect(mockContext.roundRect).not.toHaveBeenCalled();
  });
});

describe("isometric animateTo() types", () => {
  it("accepts only transform and opacity targets, per primitive", () => {
    // Never invoked: the assertions are the @ts-expect-error directives,
    // which `npm run type-check` fails on if the line does NOT error.
    const assertTypes = (
      isometricAPI: import("../types").IsometricAPI,
    ): void => {
      const { tile, cuboid } = isometricAPI.render;
      const tileProps = {
        type: "base" as const,
        isoX: 0,
        isoY: 0,
        isoZ: 0,
        width: 1,
        height: 1,
      };
      const cuboidProps = {
        isoX: 0,
        isoY: 0,
        isoZ: 0,
        lengthX: 1,
        lengthY: 1,
        lengthZ: 1,
      };

      tile(tileProps).animateTo({
        translateX: 1,
        translateY: 1,
        translateZ: 1,
        scale: 2,
        opacity: 0.5,
      });
      cuboid(cuboidProps).animateTo({
        translateX: 1,
        translateY: 1,
        translateZ: 1,
        opacity: 0.5,
      });

      // @ts-expect-error -- grid position is an integer cell, not interpolable
      tile(tileProps).animateTo({ isoX: 3 });
      // @ts-expect-error -- grid extent is an integer cell count
      tile(tileProps).animateTo({ width: 2 });
      // @ts-expect-error -- strokeWidth is numeric but not on the allow-list
      tile(tileProps).animateTo({ strokeWidth: 2 });
      // @ts-expect-error -- grid extent is an integer cell count
      cuboid(cuboidProps).animateTo({ lengthZ: 2 });
      // @ts-expect-error -- addCuboidAt does not apply scale
      cuboid(cuboidProps).animateTo({ scale: 2 });
      // @ts-expect-error -- the narrowing survives chaining
      tile(tileProps).withOptions({ duration: 100 }).loop().animateTo({ isoZ: 1 });
    };

    expect(assertTypes).toBeTypeOf("function");
  });
});
