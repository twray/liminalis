import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpyMockContext } from "./testMockCanvasContext";

let mockContext: CanvasRenderingContext2D;

beforeEach(() => {
  mockContext = createSpyMockContext();
});

describe("image rendering", () => {
  it("draws image when ImageAssetCache returns a ready asset", async () => {
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

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/ready.png", { x: 12, y: 34 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/ready.png",
    );
    expect(mockContext.drawImage).toHaveBeenCalledWith(readySource, 12, 34);

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("does not draw when ImageAssetCache has no ready asset", async () => {
    vi.resetModules();

    const getReadyAssetMock = vi.fn(() => null);

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/pending.png", { x: 10, y: 20 });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/pending.png",
    );
    expect(mockContext.drawImage).not.toHaveBeenCalled();

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("uses cover fit by default when width and height are provided", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/cover.png", {
          x: 10,
          y: 20,
          width: 100,
          height: 100,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/cover.png",
    );
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      readySource,
      100,
      0,
      200,
      200,
      10,
      20,
      100,
      100,
    );

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("uses contain fit when specified", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/contain.png", {
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          fit: "contain",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/contain.png",
    );
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      readySource,
      10,
      45,
      100,
      50,
    );

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("uses stretch fit when specified", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/stretch.png", {
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          fit: "stretch",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/stretch.png",
    );
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      readySource,
      10,
      20,
      100,
      100,
    );

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("falls back to natural dimensions when only width is provided", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/partial-dimensions.png", {
          x: 10,
          y: 20,
          width: 100,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/partial-dimensions.png",
    );
    expect(mockContext.drawImage).toHaveBeenCalledWith(readySource, 10, 20);

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("does not draw when scaled width or height is non-positive", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/non-positive-dimensions.png", {
          x: 10,
          y: 20,
          width: 0,
          height: 100,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(getReadyAssetMock).toHaveBeenCalledWith(
      "https://example.com/non-positive-dimensions.png",
    );
    expect(mockContext.drawImage).not.toHaveBeenCalled();

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("uses scaled frame dimensions for transform origin", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 400,
      height: 200,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/scaled-rotate.png", {
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          rotate: 45,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    // Default rotateOrigin is center, so use the scaled frame bounds.
    expect(mockContext.translate).toHaveBeenCalledWith(60, 45);
    expect(mockContext.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    expect(mockContext.translate).toHaveBeenCalledWith(-60, -45);

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("applies opacity", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 100,
      height: 100,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/opacity.png", {
          x: 0,
          y: 0,
          opacity: 0.5,
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalAlpha).toBe(0.5);

    vi.doUnmock("../../core/ImageAssetCache");
  });

  it("applies blend mode when specified", async () => {
    vi.resetModules();

    const readySource = {} as CanvasImageSource;
    const getReadyAssetMock = vi.fn(() => ({
      source: readySource,
      width: 100,
      height: 100,
    }));

    vi.doMock("../../core/ImageAssetCache", () => ({
      imageAssetCache: {
        preload: vi.fn(),
        getReadyAsset: getReadyAssetMock,
      },
    }));

    const { createDrawContext } = await import("../index");
    const drawContext = createDrawContext();

    drawContext.executeDrawCallback(
      (d) => {
        d.image("https://example.com/blend.png", {
          x: 0,
          y: 0,
          blend: "multiply",
        });
      },
      mockContext,
      800,
      600,
      0,
    );

    expect(mockContext.globalCompositeOperation).toBe("multiply");

    vi.doUnmock("../../core/ImageAssetCache");
  });
});
