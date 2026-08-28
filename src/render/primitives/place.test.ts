import { describe, expect, it } from "vitest";

import { createLayer } from "../createLayer";
import { createDrawContext } from "../index";

const createMockContext = (): CanvasRenderingContext2D =>
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

describe("place()", () => {
  it("injects the ambient DrawMethods and the component's own props into render", () => {
    const mockContext = createMockContext();
    const drawContext = createDrawContext();
    const seenCircleArgs: unknown[] = [];
    let sawMeasurements: { width: number; height: number } | null = null;

    const logo = createLayer<{ fillStyle: string }>(
      ({ props, circle, measurements }) => {
        sawMeasurements = { width: measurements.width, height: measurements.height };
        circle({ cx: 0, cy: 0, radius: 10, fillStyle: props.fillStyle });
        seenCircleArgs.push(props.fillStyle);
      },
    );

    drawContext.executeDrawCallback(
      (d) => {
        d.place(logo({ fillStyle: "red" }), { x: 0, y: 0, width: 50, height: 50 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(seenCircleArgs).toEqual(["red"]);
    expect(sawMeasurements).toEqual({ width: 50, height: 50 });
  });

  it("positions the component like layer() (translates to x/y)", () => {
    const mockContext = createMockContext();
    const drawContext = createDrawContext();
    const translateCalls: Array<[number, number]> = [];
    (mockContext as any).translate = (x: number, y: number) =>
      translateCalls.push([x, y]);

    // Clip scopes are applied lazily, when a leaf primitive inside the
    // container is actually rendered — an empty component has nothing to
    // position, so this needs real content to observe the translate.
    const marker = createLayer(({ rect }) => {
      rect({ x: 0, y: 0, width: 5, height: 5, fillStyle: "red" });
    });

    drawContext.executeDrawCallback(
      (d) => {
        d.place(marker(), { x: 100, y: 50, width: 10, height: 10 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(translateCalls).toContainEqual([100, 50]);
  });

  it("supports recursive composition: a component can place another component", () => {
    const innerRenderOrder: string[] = [];

    const inner = createLayer<{ label: string }>(({ props }) => {
      innerRenderOrder.push(props.label);
    });

    const outer = createLayer(({ place }) => {
      place(inner({ label: "child-a" }), { x: 0, y: 0, width: 10, height: 10 });
      place(inner({ label: "child-b" }), { x: 10, y: 0, width: 10, height: 10 });
    });

    const drawContext = createDrawContext();
    drawContext.executeDrawCallback(
      (d) => {
        d.place(outer(), { x: 0, y: 0, width: 20, height: 10 });
      },
      createMockContext(),
      800,
      600,
      0,
    );

    expect(innerRenderOrder).toEqual(["child-a", "child-b"]);
  });

  it("keeps a placed component's animation identity stable by key even when list order changes across frames", () => {
    const marker = createLayer<{ label: string }>(() => {});
    const drawContext = createDrawContext();
    const mockContext = createMockContext();

    const renderFrame = (labels: string[], timeInMs: number) => {
      const captured: Record<string, unknown> = {};

      drawContext.executeDrawCallback(
        (d) => {
          for (const label of labels) {
            captured[label] = d.place(marker({ label }), {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              key: label,
            });
          }
        },
        mockContext,
        800,
        600,
        timeInMs,
      );

      return captured;
    };

    const frame1 = renderFrame(["a", "b"], 0);
    // Frame 2: the same two keyed items, called in the opposite order.
    const frame2 = renderFrame(["b", "a"], 100);

    expect(frame2.a).toBe(frame1.a);
    expect(frame2.b).toBe(frame1.b);
  });

  it("without a key, reordering placed components across frames shifts identity", () => {
    const marker = createLayer<{ label: string }>(() => {});
    const drawContext = createDrawContext();
    const mockContext = createMockContext();

    const renderFrame = (labels: string[], timeInMs: number) => {
      const captured: Record<string, unknown> = {};

      drawContext.executeDrawCallback(
        (d) => {
          for (const label of labels) {
            captured[label] = d.place(marker({ label }), {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
            });
          }
        },
        mockContext,
        800,
        600,
        timeInMs,
      );

      return captured;
    };

    const frame1 = renderFrame(["a", "b"], 0);
    const frame2 = renderFrame(["b", "a"], 100);

    // Positional identity: whichever item is called first now owns the slot
    // that used to belong to "a" — this is exactly the fragility the `key`
    // option (previous test) opts out of.
    expect(frame2.b).toBe(frame1.a);
    expect(frame2.a).toBe(frame1.b);
  });
});
