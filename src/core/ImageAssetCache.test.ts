import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ImageBehavior = "success" | "error";

class FakeImage {
  static requestCountByUrl = new Map<string, number>();
  static behaviorByUrl = new Map<string, ImageBehavior>();
  static dimensionsByUrl = new Map<string, { width: number; height: number }>();

  static reset(): void {
    FakeImage.requestCountByUrl.clear();
    FakeImage.behaviorByUrl.clear();
    FakeImage.dimensionsByUrl.clear();
  }

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;

  naturalWidth = 0;
  naturalHeight = 0;

  #src = "";

  set src(value: string) {
    this.#src = value;

    const previousCount = FakeImage.requestCountByUrl.get(value) ?? 0;
    FakeImage.requestCountByUrl.set(value, previousCount + 1);

    const dimensions = FakeImage.dimensionsByUrl.get(value) ?? {
      width: 0,
      height: 0,
    };

    this.naturalWidth = dimensions.width;
    this.naturalHeight = dimensions.height;

    const behavior = FakeImage.behaviorByUrl.get(value) ?? "success";

    queueMicrotask(() => {
      if (behavior === "success") {
        this.onload?.();
        return;
      }

      this.onerror?.();
    });
  }

  get src(): string {
    return this.#src;
  }
}

const nextTick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const waitForReadyAsset = async (
  getReadyAsset: (url: string) => { source: CanvasImageSource } | null,
  url: string,
): Promise<{ source: CanvasImageSource } | null> => {
  for (let index = 0; index < 10; index++) {
    const asset = getReadyAsset(url);

    if (asset !== null) {
      return asset;
    }

    await nextTick();
  }

  return null;
};

describe("ImageAssetCache", () => {
  const originalImage = globalThis.Image;
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  beforeEach(() => {
    vi.resetModules();
    FakeImage.reset();

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: FakeImage,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: originalImage,
    });

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: originalCreateImageBitmap,
    });
  });

  it("loads an image once and serves the ready bitmap asset", async () => {
    FakeImage.behaviorByUrl.set("https://example.com/image.png", "success");

    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValue({ width: 320, height: 180 });

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: createImageBitmapMock,
    });

    const { imageAssetCache } = await import("./ImageAssetCache");

    expect(imageAssetCache.getReadyAsset("https://example.com/image.png")).toBe(
      null,
    );

    const readyAsset = await waitForReadyAsset(
      (url) => imageAssetCache.getReadyAsset(url),
      "https://example.com/image.png",
    );

    expect(readyAsset).not.toBeNull();
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(
      FakeImage.requestCountByUrl.get("https://example.com/image.png"),
    ).toBe(1);

    // Once ready, repeated reads should not trigger new requests.
    expect(
      imageAssetCache.getReadyAsset("https://example.com/image.png"),
    ).not.toBe(null);
    expect(
      FakeImage.requestCountByUrl.get("https://example.com/image.png"),
    ).toBe(1);
  });

  it("falls back to HTMLImageElement when createImageBitmap fails", async () => {
    const url = "https://example.com/fallback.png";

    FakeImage.behaviorByUrl.set(url, "success");
    FakeImage.dimensionsByUrl.set(url, { width: 640, height: 360 });

    const createImageBitmapMock = vi.fn().mockRejectedValue(new Error("nope"));

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: createImageBitmapMock,
    });

    const { imageAssetCache } = await import("./ImageAssetCache");

    const readyAsset = await waitForReadyAsset(
      (imageUrl) => imageAssetCache.getReadyAsset(imageUrl),
      url,
    );

    expect(readyAsset).not.toBeNull();
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);

    // Fallback uses the underlying image element dimensions.
    expect((readyAsset as { width?: number }).width).toBe(640);
    expect((readyAsset as { height?: number }).height).toBe(360);
  });

  it("does not retry a failed URL (single-attempt policy)", async () => {
    const url = "https://example.com/error.png";

    FakeImage.behaviorByUrl.set(url, "error");

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const { imageAssetCache } = await import("./ImageAssetCache");

    expect(imageAssetCache.getReadyAsset(url)).toBe(null);
    await nextTick();

    // Failed URL should remain failed with no additional load attempts.
    expect(imageAssetCache.getReadyAsset(url)).toBe(null);
    imageAssetCache.preload([url]);
    expect(imageAssetCache.getReadyAsset(url)).toBe(null);

    expect(FakeImage.requestCountByUrl.get(url)).toBe(1);
  });

  it("preload deduplicates duplicate URLs", async () => {
    const urlA = "https://example.com/a.png";
    const urlB = "https://example.com/b.png";

    FakeImage.behaviorByUrl.set(urlA, "success");
    FakeImage.behaviorByUrl.set(urlB, "success");

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
    });

    const { imageAssetCache } = await import("./ImageAssetCache");

    imageAssetCache.preload([urlA, urlA, urlB, urlB]);

    await nextTick();

    expect(FakeImage.requestCountByUrl.get(urlA)).toBe(1);
    expect(FakeImage.requestCountByUrl.get(urlB)).toBe(1);
  });
});
