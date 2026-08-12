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

const FONT_FACE_SOURCE_REGEX =
  /^(?:(?:https?:)?\/\/[^\s?#]+\.(?:woff2?|ttf|otf|eot)(?:[?#][^\s]*)?|\/[^\s?#]+\.(?:woff2?|ttf|otf|eot)(?:[?#][^\s]*)?|\.\.?\/[^\s?#]+\.(?:woff2?|ttf|otf|eot)(?:[?#][^\s]*)?|data:font\/[a-z0-9.+-]+(?:;charset=[a-z0-9-]+)?;base64,[a-z0-9+/=]+)$/i;
const STYLESHEET_SOURCE_REGEX =
  /(^https?:\/\/fonts\.googleapis\.com\/css2?\?.+)|(^https?:\/\/[^\s]+\.css(?:\?.*)?$)|(^\/[^\s]+\.css(?:\?.*)?$)|(^\.\.?\/[^\s]+\.css(?:\?.*)?$)/i;
const FONT_FACE_BLOCK_REGEX = /@font-face\s*\{[\s\S]*?\}/gi;
const FONT_FAMILY_DECLARATION_REGEX = /font-family\s*:\s*([^;]+);/gi;

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

const normalizeFontFamilyName = (family: string): string => {
  const firstFamily = family.split(",")[0] ?? family;

  return firstFamily
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
};

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
      return this.#loadFromFontUrl(definition);
    }

    if (STYLESHEET_SOURCE_REGEX.test(definition.source)) {
      return this.#loadFromStylesheet(definition);
    }

    throw new Error(
      `Unsupported font source: ${definition.source}. Use a FontFace source (for example url(...)) or a stylesheet URL.`,
    );
  }

  #loadFromFontUrl = async (
    definition: FontAssetDefinition,
  ): Promise<LoadedFontAsset> => {
    if (typeof FontFace === "undefined") {
      throw new Error("FontFace API is unavailable in this environment");
    }

    if (!document?.fonts?.add) {
      throw new Error("document.fonts API is unavailable in this environment");
    }

    try {
      const fontFace = new FontFace(
        definition.family,
        `url('${definition.source}')`,
        definition.descriptors,
      );

      const loadedFontFace = await fontFace.load();

      document.fonts.add(loadedFontFace);

      return {
        family: definition.family,
        fontFace: loadedFontFace,
      };
    } catch (error) {
      throw new Error(`Failed to load font: ${definition.family}. ${error}`);
    }
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

    await this.#assertStylesheetDeclaresFamily(
      definition.source,
      definition.family,
    );

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

  #assertStylesheetDeclaresFamily = async (
    source: string,
    requestedFamily: string,
  ): Promise<void> => {
    const declaredFamilies = await this.#loadDeclaredFontFamilies(source);

    if (declaredFamilies.length === 0) {
      throw new Error(
        `Unable to find any @font-face font-family declarations in stylesheet: ${source}`,
      );
    }

    const normalizedRequestedFamily = normalizeFontFamilyName(requestedFamily);

    const hasMatchingFamily = declaredFamilies.some(
      (declaredFamily) =>
        normalizeFontFamilyName(declaredFamily) === normalizedRequestedFamily,
    );

    if (!hasMatchingFamily) {
      throw new Error(
        `Font family \"${requestedFamily}\" was not declared in stylesheet: ${source}. Declared families: ${declaredFamilies.join(", ")}`,
      );
    }
  };

  #loadDeclaredFontFamilies = async (source: string): Promise<string[]> => {
    const response = await fetch(source);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch stylesheet for family validation: ${source}`,
      );
    }

    const stylesheet = await response.text();
    return this.#extractFontFamiliesFromStylesheet(stylesheet);
  };

  #extractFontFamiliesFromStylesheet = (stylesheet: string): string[] => {
    const fontFaceBlocks = stylesheet.match(FONT_FACE_BLOCK_REGEX) ?? [];

    const families = new Set<string>();

    for (const block of fontFaceBlocks) {
      const familyMatches = block.matchAll(FONT_FAMILY_DECLARATION_REGEX);

      for (const familyMatch of familyMatches) {
        const declaredFamily = familyMatch[1];

        if (!declaredFamily) {
          continue;
        }

        const normalized = normalizeFontFamilyName(declaredFamily);

        if (normalized.length === 0) {
          continue;
        }

        families.add(normalized);
      }
    }

    return [...families];
  };
}

export const fontAssetCache = new FontAssetCache();
