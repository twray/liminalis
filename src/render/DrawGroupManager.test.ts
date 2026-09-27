import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_BOUNDS } from "./common";
import DrawGroupManager from "./DrawGroupManager";
import type { Bounds, ClipScope, DrawAPI } from "./types";

// Hoisted, so it applies to this whole file. Harmless for the
// DrawGroupManager suite, which never touches ImageAssetCache -- it exists
// for the signature-memoisation suite at the bottom, where an image's
// readiness is the thing that has to invalidate a signature whose props
// never changed.
vi.mock("../core/ImageAssetCache", () => ({
  imageAssetCache: {
    getReadyAsset: () => readyAsset,
  },
}));

// `source` is what the image primitive hands to drawImage, which is how a
// real image draw is told apart from a cache blit.
const IMAGE_SOURCE = { marker: "image-source" };
let readyAsset: { source: unknown; width: number; height: number } | null =
  null;

const createPassthroughCache = () => ({
  renderGroup: vi.fn(
    ({
      targetContext,
      draw,
    }: {
      groupId: string;
      signature: string;
      targetContext: CanvasRenderingContext2D;
      bounds: Bounds;
      useLocalCoordinateContext: boolean;
      scope: ClipScope | null;
      draw: (context: CanvasRenderingContext2D) => void;
    }) => draw(targetContext),
  ),
});

// Used throughout for tests that only care about tree/stack mechanics, not
// scope application — a real ClipScope is only exercised by the dedicated
// scope-aware tests further down.
const noScope = null;

const createMockContext = () =>
  ({ save: vi.fn(), restore: vi.fn() }) as unknown as CanvasRenderingContext2D;

describe("DrawGroupManager", () => {
  describe("createPrimitiveSignature", () => {
    it("combines type and serialized props", () => {
      const signature = DrawGroupManager.createPrimitiveSignature("rect", {
        x: 1,
        y: 2,
      });

      expect(signature).toBe('rect|props:{"x":1,"y":2}');
    });

    // What a signature must actually guarantee is an equality RELATION --
    // equal state produces equal strings, different state produces
    // different ones. The literal format is incidental (it was
    // "1.000000" before numbers were serialised more cheaply) and nothing
    // parses or persists it, so these pin the contract that matters.
    it("is independent of key order", () => {
      expect(
        DrawGroupManager.createPrimitiveSignature("rect", { x: 1, y: 2 }),
      ).toBe(DrawGroupManager.createPrimitiveSignature("rect", { y: 2, x: 1 }));
    });

    it("collapses float noise below six decimal places", () => {
      // Otherwise arithmetic that lands a hair away from the same value
      // would churn every cache keyed on this signature.
      expect(
        DrawGroupManager.createPrimitiveSignature("rect", { x: 0.1 + 0.2 }),
      ).toBe(DrawGroupManager.createPrimitiveSignature("rect", { x: 0.3 }));
    });

    it("still distinguishes values that differ within six decimal places", () => {
      expect(
        DrawGroupManager.createPrimitiveSignature("rect", { x: 1.000001 }),
      ).not.toBe(
        DrawGroupManager.createPrimitiveSignature("rect", { x: 1.000002 }),
      );
    });

    it("distinguishes a number from the string of that number", () => {
      expect(
        DrawGroupManager.createPrimitiveSignature("rect", { x: 1 }),
      ).not.toBe(DrawGroupManager.createPrimitiveSignature("rect", { x: "1" }));
    });

    it("escapes strings that would otherwise forge the serialized form", () => {
      // Hand-quoting is only safe for strings with nothing to escape; a
      // value containing a quote must not be able to imitate structure.
      expect(
        DrawGroupManager.createPrimitiveSignature("rect", { a: 'x","b":"y' }),
      ).not.toBe(
        DrawGroupManager.createPrimitiveSignature("rect", { a: "x", b: "y" }),
      );
    });

    it("appends an extra signature segment when provided", () => {
      const signature = DrawGroupManager.createPrimitiveSignature(
        "rect",
        {},
        "scope-signature:abc",
      );

      expect(signature).toBe("rect|props:{}|extra:scope-signature:abc");
    });

    it("omits the extra segment when it is an empty string", () => {
      const signature = DrawGroupManager.createPrimitiveSignature(
        "rect",
        {},
        "",
      );

      expect(signature).toBe("rect|props:{}");
    });
  });

  describe("pushPrimitiveOperation", () => {
    it("renders a pushed primitive when the root group is rendered", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const render = vi.fn();

      manager.pushPrimitiveOperation({ signature: "sig-a", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      expect(render).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });
  });

  describe("withNestedGroup", () => {
    it("runs the callback synchronously", () => {
      const manager = new DrawGroupManager();
      const callback = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        callback,
      );

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("routes primitives pushed during the callback into the nested group, not the root", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const rootRender = vi.fn();
      const nestedRender = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "nested-sig" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "nested",
            render: nestedRender,
          });
        },
      );
      manager.pushPrimitiveOperation({ signature: "root", render: rootRender });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      // Both the nested group and the root group get their own renderGroup call.
      expect(cache.renderGroup).toHaveBeenCalledTimes(2);
      expect(nestedRender).toHaveBeenCalledTimes(1);
      expect(rootRender).toHaveBeenCalledTimes(1);
    });

    it("pops back to the parent group after the callback returns", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const targetContext = {} as CanvasRenderingContext2D;
      const render = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        () => {},
      );
      manager.pushPrimitiveOperation({ signature: "after-nested", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 100,
        height: 100,
      });

      // The root group should have both the empty nested group and this primitive.
      expect(render).toHaveBeenCalledTimes(1);
    });

    it("pops back to the parent group even when the callback throws", () => {
      const manager = new DrawGroupManager();
      const error = new Error("boom");

      expect(() => {
        manager.withNestedGroup(
          { scope: noScope, getInvalidationSignature: () => "sig" },
          () => {
            throw error;
          },
        );
      }).toThrow(error);

      const cache = createPassthroughCache();
      const render = vi.fn();
      manager.pushPrimitiveOperation({ signature: "after-throw", render });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(render).toHaveBeenCalledTimes(1);
    });

    it("supports arbitrarily deep nesting, rendering innermost groups first via recursion", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const order: string[] = [];

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "outer" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "outer-primitive",
            render: () => order.push("outer-primitive"),
          });

          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "inner" },
            () => {
              manager.pushPrimitiveOperation({
                signature: "inner-primitive",
                render: () => order.push("inner-primitive"),
              });
            },
          );
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(order).toEqual(["outer-primitive", "inner-primitive"]);
    });
  });

  describe("renderToContext", () => {
    it("assigns sequential ids across the root and nested groups", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "a" },
        () => {
          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "b" },
            () => {},
          );
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      const groupIds = cache.renderGroup.mock.calls.map(
        (call) => call[0].groupId,
      );

      expect(groupIds).toEqual(["group-0", "group-1", "group-2"]);
    });

    it("includes the group's invalidation signature and its operations in the group signature", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.pushPrimitiveOperation({
        signature: "primitive-sig",
        render: vi.fn(),
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      const rootCall = cache.renderGroup.mock.calls[0]?.[0];

      expect(rootCall.signature).toBe(
        "id:group-0|invalidate:root|primitive:primitive-sig",
      );
    });

    it("passes the group's own child context down through recursive draw calls", () => {
      const manager = new DrawGroupManager();
      const outerContext = {} as CanvasRenderingContext2D;
      const innerContext = {} as CanvasRenderingContext2D;
      const nestedRender = vi.fn();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "sig" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "nested",
            render: nestedRender,
          });
        },
      );

      const cache = {
        renderGroup: vi.fn(
          ({
            groupId,
            draw,
          }: {
            groupId: string;
            draw: (context: CanvasRenderingContext2D) => void;
          }) => {
            draw(groupId === "group-0" ? outerContext : innerContext);
          },
        ),
      };

      manager.renderToContext({
        cache: cache as any,
        targetContext: outerContext,
        width: 100,
        height: 100,
      });

      expect(nestedRender).toHaveBeenCalledWith(innerContext);
    });

    it("gives the root group full-canvas bounds and a null scope", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 800,
        height: 600,
      });

      const rootCall = cache.renderGroup.mock.calls[0]?.[0];

      expect(rootCall.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
      expect(rootCall.useLocalCoordinateContext).toBe(false);
      expect(rootCall.scope).toBeNull();
    });

    it("applies a nested group's own scope exactly once and passes its composite bounds through to the cache", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const scope: ClipScope = {
        apply: vi.fn(),
        getCompositeInfo: () => ({
          bounds: { x: 5, y: 10, width: 20, height: 30 },
          isValid: true,
          useLocalCoordinateContext: true,
        }),
      };

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "scoped" },
        () => {
          manager.pushPrimitiveOperation({
            signature: "inner",
            render: vi.fn(),
          });
        },
      );

      manager.renderToContext({
        cache: cache as any,
        targetContext: createMockContext(),
        width: 800,
        height: 600,
      });

      const nestedCall = cache.renderGroup.mock.calls.find(
        (call) => call[0].groupId === "group-1",
      )?.[0];

      expect(nestedCall).toBeDefined();
      expect(nestedCall!.bounds).toEqual({
        x: 5,
        y: 10,
        width: 20,
        height: 30,
      });
      expect(nestedCall!.useLocalCoordinateContext).toBe(true);
      expect(nestedCall!.scope).toBe(scope);
      expect(scope.apply).toHaveBeenCalledTimes(1);
    });

    it("bypasses the cache and runs a group's operations directly on the parent context when its scope reports invalid bounds", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const render = vi.fn();
      const scope: ClipScope = {
        apply: vi.fn(),
        getCompositeInfo: () => ({
          bounds: EMPTY_BOUNDS,
          isValid: false,
          useLocalCoordinateContext: false,
        }),
      };

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "invalid" },
        () => {
          manager.pushPrimitiveOperation({ signature: "inner", render });
        },
      );

      const targetContext = createMockContext();

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 800,
        height: 600,
      });

      // Only the root's own renderGroup call happens — the invalid-bounds
      // group never reaches the cache at all, matching how an invalid clip
      // scope's apply() already no-ops without transform/clip/offset, so
      // content still renders, unshifted, directly on the parent context.
      expect(cache.renderGroup).toHaveBeenCalledTimes(1);
      expect(scope.apply).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });

    it("bypasses the cache when a scope has no getCompositeInfo (e.g. a custom renderWithScope-style scope)", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const render = vi.fn();
      const scope: ClipScope = {};

      manager.withNestedGroup(
        { scope, getInvalidationSignature: () => "no-composite-info" },
        () => {
          manager.pushPrimitiveOperation({ signature: "inner", render });
        },
      );

      const targetContext = createMockContext();

      manager.renderToContext({
        cache: cache as any,
        targetContext,
        width: 800,
        height: 600,
      });

      expect(cache.renderGroup).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledWith(targetContext);
    });
  });

  describe("captureCurrentGroupHandle", () => {
    it("pushes into the group that was current when captured, not whatever is current when pushed", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const nestedRender = vi.fn();
      const rootRender = vi.fn();
      let nestedHandle: ReturnType<
        DrawGroupManager["captureCurrentGroupHandle"]
      >;

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "nested" },
        () => {
          // Captured *while* the nested group is current...
          nestedHandle = manager.captureCurrentGroupHandle();
        },
      );

      // ...but pushed through only after the nested scope has already
      // exited and the stack is back to root. This mirrors exactly how
      // AnimatableRegistry.flush() invokes pushPrimitiveOperation long after
      // every group()/layer()/place() has already popped off the stack.
      nestedHandle!.pushPrimitiveOperation({
        signature: "nested-primitive",
        render: nestedRender,
      });
      manager.pushPrimitiveOperation({
        signature: "root-primitive",
        render: rootRender,
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      // Both groups render, but only the nested group's draw should have
      // fired the operation captured for it.
      expect(cache.renderGroup).toHaveBeenCalledTimes(2);
      expect(nestedRender).toHaveBeenCalledTimes(1);
      expect(rootRender).toHaveBeenCalledTimes(1);
    });

    it("keeps working even if further nested groups open and close after capture", () => {
      const manager = new DrawGroupManager();
      const cache = createPassthroughCache();
      const capturedRender = vi.fn();

      const handle = manager.captureCurrentGroupHandle();

      manager.withNestedGroup(
        { scope: noScope, getInvalidationSignature: () => "unrelated" },
        () => {
          manager.withNestedGroup(
            { scope: noScope, getInvalidationSignature: () => "deeper" },
            () => {},
          );
        },
      );

      handle.pushPrimitiveOperation({
        signature: "root-level-primitive",
        render: capturedRender,
      });

      manager.renderToContext({
        cache: cache as any,
        targetContext: {} as CanvasRenderingContext2D,
        width: 100,
        height: 100,
      });

      expect(capturedRender).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Signature memoisation reuses the previous frame's signature string when a
// primitive's inputs are unchanged, instead of re-running stableSerialize.
// Every cache in the renderer keys off the strings this manager builds, so a
// signature that is reused when it SHOULDN'T be does not merely cost
// performance -- it shows stale pixels. These tests pin the invalidation
// paths rather than the optimisation, because that is the direction that
// fails silently.
// ---------------------------------------------------------------------------

let paintedWidths: number[] = [];

// Fuller than createMockContext above, which only needs save/restore for
// stack mechanics. This one has to satisfy the real primitive render path.
const createCanvasMockContext = (): CanvasRenderingContext2D => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    roundRect: vi.fn((_x: number, _y: number, width: number) => {
      paintedWidths.push(width);
    }),
    measureText: vi.fn(
      (value: string) =>
        ({
          width: value.length * 10,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }) as TextMetrics,
    ),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;

  (context as unknown as { canvas: unknown }).canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn(),
  };

  return context;
};

class SignatureMockOffscreenCanvas {
  static instances: SignatureMockOffscreenCanvas[] = [];

  width: number;
  height: number;
  context: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    SignatureMockOffscreenCanvas.instances.push(this);
    this.width = width;
    this.height = height;
    this.context = createCanvasMockContext();
    (this.context as unknown as { canvas: unknown }).canvas = this;
  }

  getContext(kind: string) {
    return kind === "2d" ? this.context : null;
  }
}

const GROUPED_WIDTH = 41;

describe("signature memoisation", () => {
  const previousOffscreenCanvas = (globalThis as any).OffscreenCanvas;

  // Scoped to this describe rather than the file, so the DrawGroupManager
  // suite above keeps whatever global it started with.
  beforeEach(() => {
    paintedWidths = [];
    readyAsset = null;
    SignatureMockOffscreenCanvas.instances = [];
    (globalThis as any).OffscreenCanvas = SignatureMockOffscreenCanvas;
  });

  afterEach(() => {
    (globalThis as any).OffscreenCanvas = previousOffscreenCanvas;
  });

  const groupedScene =
    (width: number) =>
    (d: DrawAPI): void => {
      d.group(
        () => {
          d.rect({
            x: 10,
            y: 10,
            width,
            height: 20,
            fillStyle: "#333",
            strokeStyle: "transparent",
          });
        },
        { x: 0, y: 0, width: 300, height: 200 },
      );
    };

  // A memo hit produces the IDENTICAL signature string, so it changes
  // nothing about what is rendered -- no render-based assertion can detect
  // one. Counting serialisations is the only way to observe the
  // optimisation actually happening.
  const countRectSerialisations = (spy: ReturnType<typeof vi.spyOn>): number =>
    spy.mock.calls.filter((call) => call[0] === "rect").length;

  it("stops serialising a primitive whose props are unchanged", async () => {
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    const serialiseSpy = vi.spyOn(DrawGroupManager, "createPrimitiveSignature");

    try {
      drawContext.executeDrawCallback(
        groupedScene(GROUPED_WIDTH),
        context,
        800,
        600,
        0,
      );
      drawContext.executeDrawCallback(
        groupedScene(GROUPED_WIDTH),
        context,
        800,
        600,
        16,
      );

      const beforeThirdFrame = countRectSerialisations(serialiseSpy);

      drawContext.executeDrawCallback(
        groupedScene(GROUPED_WIDTH),
        context,
        800,
        600,
        32,
      );

      expect(countRectSerialisations(serialiseSpy)).toBe(beforeThirdFrame);
    } finally {
      serialiseSpy.mockRestore();
    }
  });

  it("stops serialising again once a changing primitive settles", async () => {
    // The memo stops comparing props for a primitive that is actively
    // changing, since the comparison would fail before a serialisation that
    // has to happen anyway. That must be self-correcting: once the
    // primitive stops moving it has to start hitting the memo again, or the
    // optimisation is simply disabled for anything that ever animated.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    const serialiseSpy = vi.spyOn(DrawGroupManager, "createPrimitiveSignature");

    try {
      // Three changing frames, then it settles.
      [41, 42, 43, 43, 43].forEach((width, index) => {
        drawContext.executeDrawCallback(
          groupedScene(width),
          context,
          800,
          600,
          index * 16,
        );
      });

      const beforeSettledFrame = countRectSerialisations(serialiseSpy);

      drawContext.executeDrawCallback(groupedScene(43), context, 800, 600, 96);

      expect(countRectSerialisations(serialiseSpy)).toBe(beforeSettledFrame);
    } finally {
      serialiseSpy.mockRestore();
    }
  });

  it("keeps the group cache working while memoising", async () => {
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    drawContext.executeDrawCallback(
      groupedScene(GROUPED_WIDTH),
      context,
      800,
      600,
      0,
    );
    drawContext.executeDrawCallback(
      groupedScene(GROUPED_WIDTH),
      context,
      800,
      600,
      16,
    );

    paintedWidths = [];

    drawContext.executeDrawCallback(
      groupedScene(GROUPED_WIDTH),
      context,
      800,
      600,
      32,
    );

    // A reused signature must still equal what a fresh serialisation would
    // produce, or the cache would miss and redraw here.
    expect(paintedWidths).not.toContain(GROUPED_WIDTH);
  });

  it("recomputes when a prop actually changes", async () => {
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    drawContext.executeDrawCallback(
      groupedScene(GROUPED_WIDTH),
      context,
      800,
      600,
      0,
    );
    drawContext.executeDrawCallback(
      groupedScene(GROUPED_WIDTH),
      context,
      800,
      600,
      16,
    );

    paintedWidths = [];

    drawContext.executeDrawCallback(groupedScene(77), context, 800, 600, 32);

    expect(paintedWidths).toContain(77);
  });

  it("returns to the cheap path once a changing primitive settles", async () => {
    // The render-visible counterpart to the serialisation-count test above:
    // a settled primitive must also stop being REPAINTED, which is the
    // downstream consequence of its signature going stable again.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    // Three changing frames, then it settles.
    [41, 42, 43, 43, 43, 43].forEach((width, index) => {
      drawContext.executeDrawCallback(
        groupedScene(width),
        context,
        800,
        600,
        index * 16,
      );
    });

    paintedWidths = [];

    drawContext.executeDrawCallback(groupedScene(43), context, 800, 600, 96);

    // Settled: the group's signature is stable again, so its cache hits and
    // nothing is redrawn.
    expect(paintedWidths).not.toContain(43);
  });

  it("recomputes when the extra signature changes even though props are identical", async () => {
    // The subtle one: an image's props never change, but its signature must
    // still flip when the asset finishes loading. Memoising on props alone
    // would pin the signature at "not ready" and the image would never
    // appear.
    const { createDrawContext } = await import("./index");
    const drawContext = createDrawContext();
    const context = createCanvasMockContext();

    const imageScene = (d: DrawAPI): void => {
      d.image("https://example.test/asset.png", {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    };

    drawContext.executeDrawCallback(imageScene, context, 800, 600, 0);
    drawContext.executeDrawCallback(imageScene, context, 800, 600, 16);

    // Same props, asset now available.
    readyAsset = { source: IMAGE_SOURCE, width: 100, height: 100 };

    drawContext.executeDrawCallback(imageScene, context, 800, 600, 32);

    // Asserting specifically that the IMAGE was drawn, not merely that
    // drawImage ran -- a cache blit calls drawImage too, which is why an
    // untargeted assertion here passes even with the invalidation removed.
    const drewTheImage = [
      context,
      ...SignatureMockOffscreenCanvas.instances.map(
        (surface) => surface.context,
      ),
    ].some((candidate) =>
      vi
        .mocked(candidate.drawImage)
        .mock.calls.some((call) => call[0] === IMAGE_SOURCE),
    );

    expect(drewTheImage).toBe(true);
  });
});
