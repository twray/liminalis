import { vi } from "vitest";

// The shared canvas mock used across primitive test files. Every method is a
// vi.fn() spy so tests can assert on individual calls (toHaveBeenCalledWith,
// invocationCallOrder, etc.) -- this is the mock every primitive rendering
// and clipping test in this suite was written against.
export const createSpyMockContext = (): CanvasRenderingContext2D =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    font: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    miterLimit: 10,
    lineCap: "butt",
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(
      (value: string) =>
        ({
          width: value.length * 10,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }) as TextMetrics,
    ),
    canvas: { width: 800, height: 600 },
  }) as unknown as CanvasRenderingContext2D;

// A lighter-weight mock (plain no-ops, not vi.fn() spies) for tests that
// only need a valid CanvasRenderingContext2D to render against without
// asserting on individual draw calls -- e.g. isometric() viewport sizing
// and place() identity/composition tests, which assert on other things
// (mocked view instances, render order, captured props).
export const createMinimalMockCanvasContext = (): CanvasRenderingContext2D =>
  ({
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    clip: () => {},
    rect: () => {},
    roundRect: () => {},
    arc: () => {},
    ellipse: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0 }) as TextMetrics,
    canvas: { width: 800, height: 600 },
  }) as unknown as CanvasRenderingContext2D;
