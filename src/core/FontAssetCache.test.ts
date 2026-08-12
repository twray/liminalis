import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeFontFaceCtor {
  family: string;
  source: string;
  descriptors?: FontFaceDescriptors;
}

type FontBehavior = "success" | "error";

class FakeFontFace {
  static constructed: FakeFontFaceCtor[] = [];
  static loadCountByKey = new Map<string, number>();
  static behaviorByKey = new Map<string, FontBehavior>();

  static reset(): void {
    FakeFontFace.constructed = [];
    FakeFontFace.loadCountByKey.clear();
    FakeFontFace.behaviorByKey.clear();
  }

  family: string;
  source: string;
  descriptors?: FontFaceDescriptors;

  constructor(
    family: string,
    source: string,
    descriptors?: FontFaceDescriptors,
  ) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;

    FakeFontFace.constructed.push({
      family,
      source,
      descriptors,
    });
  }

  load(): Promise<FontFace> {
    const key = `${this.family}|${this.source}|${JSON.stringify(this.descriptors ?? {})}`;
    const currentCount = FakeFontFace.loadCountByKey.get(key) ?? 0;

    FakeFontFace.loadCountByKey.set(key, currentCount + 1);

    const behavior = FakeFontFace.behaviorByKey.get(key) ?? "success";

    if (behavior === "error") {
      return Promise.reject(new Error(`Failed to load font: ${key}`));
    }

    return Promise.resolve(this as unknown as FontFace);
  }
}

const nextTick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const waitForReadyAsset = async (
  getReadyAsset: () => { family: string; fontFace: FontFace } | null,
): Promise<{ family: string; fontFace: FontFace } | null> => {
  for (let index = 0; index < 10; index++) {
    const asset = getReadyAsset();

    if (asset !== null) {
      return asset;
    }

    await nextTick();
  }

  return null;
};

describe("FontAssetCache", () => {
  const originalFontFace = globalThis.FontFace;
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;

  const mockDocumentFontsAdd = vi.fn();
  const mockDocumentFontsLoad = vi.fn();
  const mockFetch = vi.fn();

  let mockDocumentCreateElement: ReturnType<typeof vi.fn>;
  let mockDocumentHeadAppendChild: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    FakeFontFace.reset();
    mockDocumentFontsAdd.mockReset();
    mockDocumentFontsLoad.mockReset();

    mockDocumentCreateElement = vi.fn(() => {
      return {
        rel: "",
        href: "",
        onload: null as null | (() => void),
        onerror: null as null | (() => void),
      };
    });

    mockDocumentHeadAppendChild = vi.fn((element) => {
      queueMicrotask(() => {
        element.onload?.();
      });

      return element;
    });

    Object.defineProperty(globalThis, "FontFace", {
      configurable: true,
      writable: true,
      value: FakeFontFace,
    });

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: mockDocumentCreateElement,
        head: {
          appendChild: mockDocumentHeadAppendChild,
        },
        fonts: {
          add: mockDocumentFontsAdd,
          load: mockDocumentFontsLoad,
        },
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: mockFetch,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () =>
        "@font-face { font-family: 'Fredericka the Great'; src: url('https://example.com/fred.woff2') format('woff2'); }",
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "FontFace", {
      configurable: true,
      writable: true,
      value: originalFontFace,
    });

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: originalDocument,
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });

  it("loads and registers a font once", async () => {
    const definition = {
      family: "Inter",
      source: "https://example.com/inter.woff2",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const key = `${definition.family}|url('${definition.source}')|${JSON.stringify(
      definition.descriptors,
    )}`;

    const { fontAssetCache } = await import("./FontAssetCache");

    expect(fontAssetCache.getReadyAsset(definition)).toBe(null);

    const readyAsset = await waitForReadyAsset(() =>
      fontAssetCache.getReadyAsset(definition),
    );

    expect(readyAsset).not.toBeNull();
    expect(FakeFontFace.loadCountByKey.get(key)).toBe(1);
    expect(mockDocumentFontsAdd).toHaveBeenCalledTimes(1);

    expect(fontAssetCache.getReadyAsset(definition)).not.toBe(null);
    expect(FakeFontFace.loadCountByKey.get(key)).toBe(1);
  });

  it("does not retry a failed font load", async () => {
    const definition = {
      family: "Inter",
      source: "https://example.com/inter-error.woff2",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const key = `${definition.family}|url('${definition.source}')|${JSON.stringify(
      definition.descriptors,
    )}`;

    FakeFontFace.behaviorByKey.set(key, "error");

    const { fontAssetCache } = await import("./FontAssetCache");

    expect(fontAssetCache.getReadyAsset(definition)).toBe(null);
    await nextTick();

    expect(fontAssetCache.getReadyAsset(definition)).toBe(null);
    fontAssetCache.preload(definition);

    expect(FakeFontFace.loadCountByKey.get(key)).toBe(1);
  });

  it("preload deduplicates equivalent font definitions", async () => {
    const definition = {
      family: "Inter",
      source: "https://example.com/inter-dup.woff2",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const duplicateDefinition = {
      family: "Inter",
      source: "https://example.com/inter-dup.woff2",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const key = `${definition.family}|url('${definition.source}')|${JSON.stringify(
      definition.descriptors,
    )}`;

    const { fontAssetCache } = await import("./FontAssetCache");

    fontAssetCache.preload([definition, duplicateDefinition]);

    await nextTick();

    expect(FakeFontFace.loadCountByKey.get(key)).toBe(1);
  });

  it("loads stylesheet sources and waits for font availability", async () => {
    mockDocumentFontsLoad.mockResolvedValue([{}]);

    const definition = {
      family: "Fredericka the Great",
      source:
        "https://fonts.googleapis.com/css2?family=Fredericka+the+Great&display=swap",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const { fontAssetCache } = await import("./FontAssetCache");

    expect(fontAssetCache.getReadyAsset(definition)).toBe(null);

    const readyAsset = await waitForReadyAsset(() =>
      fontAssetCache.getReadyAsset(definition),
    );

    expect(readyAsset).not.toBeNull();
    expect(readyAsset?.family).toBe("Fredericka the Great");

    expect(FakeFontFace.constructed).toHaveLength(0);
    expect(mockDocumentCreateElement).toHaveBeenCalledWith("link");
    expect(mockDocumentHeadAppendChild).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(definition.source);
    expect(mockDocumentFontsLoad).toHaveBeenCalledWith(
      'normal 400 16px "Fredericka the Great"',
    );
  });

  it("marks stylesheet font load as error when family is not declared in stylesheet", async () => {
    mockDocumentFontsLoad.mockResolvedValue([{}]);
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () =>
        "@font-face { font-family: 'Actual Font'; src: url('https://example.com/actual.woff2') format('woff2'); }",
    });

    const definition = {
      family: "Wrong Font",
      source:
        "https://fonts.googleapis.com/css2?family=Actual+Font&display=swap",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const { fontAssetCache } = await import("./FontAssetCache");

    const firstEntry = fontAssetCache.ensureLoaded(definition);
    expect(firstEntry.status).toBe("loading");

    await nextTick();

    const secondEntry = fontAssetCache.ensureLoaded(definition);
    expect(secondEntry.status).toBe("error");

    expect(mockFetch).toHaveBeenCalledWith(definition.source);
    expect(mockDocumentFontsLoad).not.toHaveBeenCalled();
  });

  it("accepts direct font URLs with common font extensions", async () => {
    const definition = {
      family: "Inter",
      source: "https://example.com/fonts/inter.woff2",
      descriptors: { weight: "400", style: "normal" } as FontFaceDescriptors,
    };

    const key = `${definition.family}|url('${definition.source}')|${JSON.stringify(
      definition.descriptors,
    )}`;

    const { fontAssetCache } = await import("./FontAssetCache");

    expect(fontAssetCache.getReadyAsset(definition)).toBe(null);

    const readyAsset = await waitForReadyAsset(() =>
      fontAssetCache.getReadyAsset(definition),
    );

    expect(readyAsset).not.toBeNull();
    expect(FakeFontFace.loadCountByKey.get(key)).toBe(1);
    expect(mockDocumentFontsAdd).toHaveBeenCalledTimes(1);
    expect(mockDocumentHeadAppendChild).toHaveBeenCalledTimes(0);
  });

  it("marks unsupported source strings as error", async () => {
    const definition = {
      family: "Inter",
      source: "https://example.com/fonts/inter.txt",
    };

    const { fontAssetCache } = await import("./FontAssetCache");

    const firstEntry = fontAssetCache.ensureLoaded(definition);
    expect(firstEntry.status).toBe("loading");

    await nextTick();

    const secondEntry = fontAssetCache.ensureLoaded(definition);
    expect(secondEntry.status).toBe("error");

    expect(FakeFontFace.constructed).toHaveLength(0);
    expect(mockDocumentHeadAppendChild).toHaveBeenCalledTimes(0);
  });
});
