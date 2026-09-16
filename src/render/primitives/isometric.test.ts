import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
        d.isometric(() => {
          d.rect({ x: 10, y: 20, width: 30, height: 40 });
          d.rect({ x: 40, y: 60, width: 30, height: 40 });
          d.circle({ cx: 100, cy: 120, radius: 12 });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    drawContext.executeDrawCallback(
      (d) => {
        d.isometric(() => {
          d.circle({ cx: 150, cy: 150, radius: 16 });
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
        d.rect({ x: 10, y: 20, width: 30, height: 40 });
        d.circle({ cx: 100, cy: 120, radius: 12 });
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
        d.circle({
          cx: 200,
          cy: 200,
          radius: 120,
          fillStyle: "#fff",
          strokeStyle: "transparent",
        });

        d.isometric(({ cuboid }) => {
          cuboid({
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
        d.isometric(() => {});
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
        d.layer(
          () => {
            d.isometric(() => {});
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
        d.layer(
          () => {
            d.group(
              () => {
                d.isometric(() => {});
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
        d.layer(
          () => {
            d.isometric(() => {}, { width: 30, height: 20 });
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
        d.layer(() => {}, { x: 0, y: 0, width: 200, height: 100 });
        d.isometric(() => {});
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
