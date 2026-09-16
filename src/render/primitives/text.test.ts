import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IAnimatableLike } from "../../types";
import type { Bounds } from "../types";
import { getTextBounds } from "./text";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("text rendering", () => {
  it("uses default text font properties when no font properties are provided", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Hello", { x: 10, y: 20 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.font).toBe("normal normal 12px Arial, sans-serif");
    expect(mockContext.fillText).toHaveBeenCalledWith("Hello", 10, 20);
    expect(mockContext.strokeText).toHaveBeenCalledWith("Hello", 10, 20);
  });

  it("applies base draw styles to text including stroke and decomposed font properties", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.withStyles(
          {
            fillStyle: "#ff0000",
            strokeStyle: "#00ff00",
            strokeWidth: 3,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: "18px",
            fontFamily: "monospace",
            opacity: 0.4,
            blend: "screen",
          },
          () => {
            d.text("Styled", { x: 30, y: 40 });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.font).toBe("italic 700 18px monospace");
    expect(mockContext.globalAlpha).toBe(0.4);
    expect(mockContext.globalCompositeOperation).toBe("screen");
    expect(mockContext.fillStyle).toBe("#ff0000");
    expect(mockContext.strokeStyle).toBe("#00ff00");
    expect(mockContext.lineWidth).toBe(3);
    expect(mockContext.fillText).toHaveBeenCalledWith("Styled", 30, 40);
    expect(mockContext.strokeText).toHaveBeenCalledWith("Styled", 30, 40);
  });

  it("supports text() fontStyle, fontSize, fontWeight and fontFamily props", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Typed", {
          x: 16,
          y: 24,
          fontStyle: "oblique 12deg",
          fontWeight: "bold",
          fontSize: "20ch",
          fontFamily: '"Fredericka the Great", sans-serif',
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.font).toBe(
      'oblique 12deg bold 20ch "Fredericka the Great", sans-serif',
    );
    expect(mockContext.fillText).toHaveBeenCalledWith("Typed", 16, 24);
  });

  it("supports shorthand text() font prop and prioritizes it over decomposed font properties", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Shorthand", {
          x: 50,
          y: 60,
          font: 'italic 500 24px "Fira Code", monospace',
          fontStyle: "normal",
          fontWeight: "normal",
          fontSize: "12px",
          fontFamily: "Arial, sans-serif",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.font).toBe('italic 500 24px "Fira Code", monospace');
    expect(mockContext.fillText).toHaveBeenCalledWith("Shorthand", 50, 60);
  });

  it("exposes getTextBounds() with accurate bounds and stroke inflation", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    let measuredBounds: Bounds | undefined;

    drawContext.executeDrawCallback(
      (d) => {
        measuredBounds = d.getTextBounds("Hello", {
          x: 10,
          y: 20,
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: "18px",
          fontFamily: "monospace",
          strokeStyle: "#00ff00",
          strokeWidth: 4,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(measuredBounds).toEqual({
      x: 8,
      y: 18,
      width: 54,
      height: 22,
    });
  });

  it("applies withStyles() font props when measuring with getTextBounds()", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();
    const measuredFonts: string[] = [];

    mockContext.measureText = vi.fn(function (
      this: CanvasRenderingContext2D,
      value: string,
    ) {
      measuredFonts.push(this.font);

      return {
        width: value.length * 10,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      } as TextMetrics;
    });

    let measuredBounds: Bounds | undefined;

    drawContext.executeDrawCallback(
      (d) => {
        d.withStyles(
          {
            font: 'oblique 14deg bold 16px "Fredericka the Great", serif',
            strokeStyle: "#123456",
            strokeWidth: 2,
          },
          () => {
            measuredBounds = d.getTextBounds("Hi", {
              x: 100,
              y: 40,
            });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.measureText).toHaveBeenCalledWith("Hi");
    expect(measuredFonts).toContain(
      'oblique 14deg bold 16px "Fredericka the Great", serif',
    );
    expect(measuredBounds).toEqual({
      x: 99,
      y: 39,
      width: 22,
      height: 18,
    });
  });

  it("applies transforms to text", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Hi", { x: 100, y: 50, rotate: 45 });
      },
      mockContext,
      800,
      600,
      0,
    );

    // "Hi" => width 20, ascent 10, descent 2
    // With textBaseline="top", bounds are x=100, y=50, width=20, height=12
    // center=(110, 56)
    expect(mockContext.translate).toHaveBeenCalledWith(110, 56);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-110, -56);
  });

  it("does not draw a fill when fillStyle is transparent", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Hello", { x: 10, y: 20, fillStyle: "transparent" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fillText).not.toHaveBeenCalled();
  });

  it("does not draw a stroke when strokeStyle is transparent", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Hello", { x: 10, y: 20, strokeStyle: "transparent" });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.strokeText).not.toHaveBeenCalled();
  });

  // Unlike drawTextMask (used for the frame-callback masking path below,
  // which explicitly skips empty strings), text()'s own render path has no
  // such guard -- it calls fillText with whatever string it's given.
  it("calls fillText even with an empty string", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.text("", { x: 10, y: 20 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.fillText).toHaveBeenCalledWith("", 10, 20);
  });

  // TextProps doesn't extend JoinableStrokeStyles or CappableStrokeStyles --
  // deliberate: canvas's strokeText() does technically respect lineJoin/
  // miterLimit/lineCap for glyph corners, but per-glyph join/cap control
  // isn't a meaningful, user-facing configuration point the way it is for a
  // hand-authored polygon/bezier/arc path. See
  // stroke-width-aware-bounds-plan.md 4.1.1.
});

describe("framed clipping for text", () => {
  const originalDocument = globalThis.document;

  const createOffscreenContext = (): CanvasRenderingContext2D =>
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

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: originalDocument,
    });
  });

  it("returns an Animatable when text() is used with a frame callback", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const offscreenContext = createOffscreenContext();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => offscreenContext),
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn(() => offscreenCanvas),
      },
    });

    const textClipRef: { current: IAnimatableLike<any> | null } = {
      current: null,
    };

    drawContext.executeDrawCallback(
      (d) => {
        textClipRef.current = d.text(
          "Mask",
          { x: 120, y: 140, fontSize: "48px" },
          () => {
            d.circle({ cx: 130, cy: 150, radius: 20, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(textClipRef.current).not.toBeNull();

    if (!textClipRef.current) {
      throw new Error("Expected text() clip callback to return Animatable");
    }

    expect(typeof textClipRef.current.animateTo).toBe("function");
  });

  it("resolves text bounds once per frame regardless of useLocalCoordinateContext (memoized across getCompositeInfo/apply)", async () => {
    const offscreenContext = createOffscreenContext();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => offscreenContext),
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn(() => offscreenCanvas),
      },
    });

    const renderWith = (useLocalCoordinateContext: boolean) => {
      vi.mocked(mockContext.measureText).mockClear();

      drawContextInstance.executeDrawCallback(
        (d) => {
          d.text(
            "Mask",
            { x: 120, y: 140, fontSize: "48px", useLocalCoordinateContext },
            () => {
              d.circle({ cx: 10, cy: 10, radius: 5, fillStyle: "red" });
            },
          );
        },
        mockContext,
        800,
        600,
        0,
      );

      return vi.mocked(mockContext.measureText).mock.calls.length;
    };

    const { createDrawContext } = await import("../index");
    let drawContextInstance = createDrawContext();
    const withoutLocalContext = renderWith(false);

    drawContextInstance = createDrawContext();
    const withLocalContext = renderWith(true);

    // apply()'s bounds resolution (only needed when
    // useLocalCoordinateContext is set) reuses the bounds
    // getCompositeInfo already computed this frame, so turning the
    // flag on must not add an extra measureText() call.
    expect(withLocalContext).toBe(withoutLocalContext);
  });

  it("still masks a real but narrow/small piece of text instead of treating tiny measured bounds as invalid", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const offscreenContext = createOffscreenContext();
    // Force an unrealistically tiny measured width (< 0.5px) to
    // simulate a pathological font/glyph-metrics case for a real,
    // non-empty string — this must still be masked, not bypassed as if
    // it were empty/invalid.
    const tinyMeasureText = vi.fn(
      () =>
        ({
          width: 0.2,
          actualBoundingBoxAscent: 0.1,
          actualBoundingBoxDescent: 0,
        }) as TextMetrics,
    );
    offscreenContext.measureText = tinyMeasureText;
    mockContext.measureText = tinyMeasureText;

    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => offscreenContext),
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn(() => offscreenCanvas),
      },
    });

    drawContext.executeDrawCallback(
      (d) => {
        // strokeStyle: "transparent" avoids the ambient default stroke
        // width (1px) inflating these deliberately tiny bounds back
        // above the old 0.5px threshold before the validity check runs.
        d.text(
          "i",
          { x: 10, y: 10, fontSize: "1px", strokeStyle: "transparent" },
          () => {
            d.circle({ cx: 0, cy: 0, radius: 1, fillStyle: "red" });
          },
        );
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(offscreenContext.fillText).toHaveBeenCalled();
    expect(mockContext.drawImage).toHaveBeenCalled();
  });

  it("uses fillText-only masking and renders nested draws to offscreen context", async () => {
    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const offscreenContext = createOffscreenContext();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => offscreenContext),
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn(() => offscreenCanvas),
      },
    });

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Mask", { x: 120, y: 140, fontSize: "48px" }, () => {
          d.circle({ cx: 130, cy: 150, radius: 20, fillStyle: "red" });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(offscreenContext.ellipse).toHaveBeenCalled();
    expect(offscreenContext.fillText).toHaveBeenCalledWith("Mask", 120, 140);
    expect(offscreenContext.strokeText).not.toHaveBeenCalled();

    // The mask's offscreen surface is now sized and positioned to the
    // text's own local bounds — not the full canvas blitted at (0,0) —
    // which is the whole point of local-bounds bitmap caching. Bounds
    // are computed with the same ambient default stroke style/width
    // appliedStylesManager merges in before text() ever sees its props.
    const bounds = getTextBounds(mockContext, "Mask", {
      x: 120,
      y: 140,
      fontSize: "48px",
      strokeStyle: "#333",
      strokeWidth: 1,
    });
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      offscreenCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );
  });

  it("supports mixed scope nesting: text mask containing rect clip containing image", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 320,
      height: 180,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    const offscreenContext = createOffscreenContext();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => offscreenContext),
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: vi.fn(() => offscreenCanvas),
      },
    });

    drawContext.executeDrawCallback(
      (d) => {
        d.text("Mask", { x: 80, y: 90, fontSize: "36px" }, () => {
          d.rect({ x: 100, y: 100, width: 120, height: 80 }, () => {
            d.image("https://example.com/masked.png", {
              x: 90,
              y: 90,
              width: 140,
              height: 100,
            });
          });
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/masked.png",
    );

    expect(offscreenContext.roundRect).toHaveBeenCalledWith(
      100,
      100,
      120,
      80,
      0,
    );
    expect(offscreenContext.clip).toHaveBeenCalled();

    expect(offscreenContext.drawImage).toHaveBeenCalled();
    const drawImageCalls = vi.mocked(offscreenContext.drawImage).mock.calls;
    const latestDrawImageCall = drawImageCalls[drawImageCalls.length - 1];

    if (!latestDrawImageCall) {
      throw new Error("Expected offscreen drawImage call");
    }

    expect(latestDrawImageCall[0]).toBe(readySource);
    expect(latestDrawImageCall.slice(-4)).toEqual([90, 90, 140, 100]);

    expect(offscreenContext.fillText).toHaveBeenCalledWith("Mask", 80, 90);
    expect(offscreenContext.strokeText).not.toHaveBeenCalled();

    const bounds = getTextBounds(mockContext, "Mask", {
      x: 80,
      y: 90,
      fontSize: "36px",
      strokeStyle: "#333",
      strokeWidth: 1,
    });
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      offscreenCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );

    vi.doUnmock("../../core/ImageAssetCache");
  });
});
