import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../IsometricView", () => {
  class MockIsometricView {
    static calls: Array<{ width: number; height: number }> = [];

    constructor(_context: unknown, width: number, height: number) {
      MockIsometricView.calls.push({ width, height });
    }

    render(): void {}
  }

  return { default: MockIsometricView };
});

import { createDrawContext } from "../index";
import IsometricView from "../IsometricView";

const MockedIsometricView = IsometricView as unknown as {
  calls: Array<{ width: number; height: number }>;
};

const createMockContext = (): CanvasRenderingContext2D =>
  ({
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    canvas: { width: 800, height: 600 },
  }) as unknown as CanvasRenderingContext2D;

describe("isometric() default viewport sizing", () => {
  beforeEach(() => {
    MockedIsometricView.calls = [];
  });

  it("defaults to the outer canvas size at the top level", () => {
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
  });

  it("defaults to the nearest enclosing container's measurements when nested in layer()", () => {
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
  });

  it("defaults to the innermost container's measurements when doubly nested", () => {
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
  });

  it("still honors an explicit width/height even when nested", () => {
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
  });

  it("reverts to the outer canvas size again after leaving the container", () => {
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
  });
});
