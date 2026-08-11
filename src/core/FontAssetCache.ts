import AsyncAssetCache, { type AssetCacheEntry } from "./AsyncAssetCache";

export interface FontAssetDefinition {
  family: string;
  source: string;
  descriptors?: FontFaceDescriptors;
}

export interface LoadedFontAsset {
  family: string;
  fontFace?: FontFace;
}

const FONT_FACE_SOURCE_REGEX = /(url\(|local\(|^data:)/i;
const STYLESHEET_SOURCE_REGEX =
  /(^https?:\/\/fonts\.googleapis\.com\/css2?\?.+)|(^https?:\/\/[^\s]+\.css(?:\?.*)?$)|(^\/[^\s]+\.css(?:\?.*)?$)|(^\.\.?\/[^\s]+\.css(?:\?.*)?$)/i;

const serializeFontDescriptors = (
  descriptors?: FontFaceDescriptors,
): string => {
  if (!descriptors) {
    return "";
  }

  const sortedEntries = Object.entries(descriptors).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return JSON.stringify(Object.fromEntries(sortedEntries));
};

const toFontKey = ({
  family,
  source,
  descriptors,
}: FontAssetDefinition): string =>
  `${family}::${source}::${serializeFontDescriptors(descriptors)}`;

class FontAssetCache extends AsyncAssetCache<string, LoadedFontAsset> {
  #definitions = new Map<string, FontAssetDefinition>();

  ensureLoaded(font: FontAssetDefinition): AssetCacheEntry<LoadedFontAsset> {
    const key = toFontKey(font);
    this.#definitions.set(key, font);
    return super.ensureLoadedByKey(key);
  }

  getReadyAsset(font: FontAssetDefinition): LoadedFontAsset | null {
    const key = toFontKey(font);
    this.#definitions.set(key, font);
    return super.getReadyAssetByKey(key);
  }

  preload(fontOrFonts: FontAssetDefinition | FontAssetDefinition[]): void {
    const fonts = Array.isArray(fontOrFonts) ? fontOrFonts : [fontOrFonts];

    for (const font of fonts) {
      this.#definitions.set(toFontKey(font), font);
    }

    super.preloadKeys(fonts.map((font) => toFontKey(font)));
  }

  protected async loadAsset(key: string): Promise<LoadedFontAsset> {
    const definition = this.#definitions.get(key);

    if (!definition) {
      throw new Error(`Missing font definition for key: ${key}`);
    }

    if (FONT_FACE_SOURCE_REGEX.test(definition.source)) {
      return this.#loadFromFontFace(definition);
    }

    if (STYLESHEET_SOURCE_REGEX.test(definition.source)) {
      return this.#loadFromStylesheet(definition);
    }

    throw new Error(
      `Unsupported font source: ${definition.source}. Use a FontFace source (for example url(...)) or a stylesheet URL.`,
    );
  }

  #loadFromFontFace = async (
    definition: FontAssetDefinition,
  ): Promise<LoadedFontAsset> => {
    if (typeof FontFace === "undefined") {
      throw new Error("FontFace API is unavailable in this environment");
    }

    if (!document?.fonts?.add) {
      throw new Error("document.fonts API is unavailable in this environment");
    }

    const fontFace = new FontFace(
      definition.family,
      definition.source,
      definition.descriptors,
    );

    const loadedFontFace = await fontFace.load();

    document.fonts.add(loadedFontFace);

    return {
      family: definition.family,
      fontFace: loadedFontFace,
    };
  };

  #loadFromStylesheet = async (
    definition: FontAssetDefinition,
  ): Promise<LoadedFontAsset> => {
    if (!document) {
      throw new Error("document API is unavailable in this environment");
    }

    await this.#appendStylesheet(definition.source);

    if (!document.fonts?.load) {
      throw new Error("document.fonts API is unavailable in this environment");
    }

    const style = definition.descriptors?.style ?? "normal";
    const weight = definition.descriptors?.weight ?? "normal";

    await document.fonts.load(`${style} ${weight} 16px "${definition.family}"`);

    return {
      family: definition.family,
    };
  };

  #appendStylesheet = (source: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = source;
      link.onload = () => resolve();
      link.onerror = () => {
        reject(new Error(`Failed to load stylesheet: ${source}`));
      };

      document.head.appendChild(link);
    });
}

export const fontAssetCache = new FontAssetCache();
