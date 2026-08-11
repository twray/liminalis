import AsyncAssetCache, { type AssetCacheEntry } from "./AsyncAssetCache";

export interface LoadedImageAsset {
  source: CanvasImageSource;
  width: number;
  height: number;
}
class ImageAssetCache extends AsyncAssetCache<string, LoadedImageAsset> {
  ensureLoaded(imageSrc: string): AssetCacheEntry<LoadedImageAsset> {
    return super.ensureLoadedByKey(imageSrc);
  }

  getReadyAsset(imageSrc: string): LoadedImageAsset | null {
    return super.getReadyAssetByKey(imageSrc);
  }

  preload(imageSourceOrSources: string | string[]): void {
    super.preloadKeys(imageSourceOrSources);
  }

  protected loadAsset = async (imageSrc: string): Promise<LoadedImageAsset> => {
    const imageElement = await this.#loadImageElement(imageSrc);
    return this.#toLoadedImageAsset(imageElement);
  };

  #loadImageElement = (imageSrc: string): Promise<HTMLImageElement> =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const imageElement = new Image();
      imageElement.crossOrigin = "anonymous";

      imageElement.onload = () => resolve(imageElement);
      imageElement.onerror = () => {
        reject(new Error(`Failed to load image: ${imageSrc}`));
      };

      imageElement.src = imageSrc;
    });

  #toLoadedImageAsset = async (
    imageElement: HTMLImageElement,
  ): Promise<LoadedImageAsset> => {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(imageElement);

        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        };
      } catch {
        // Fall through to HTMLImageElement if ImageBitmap creation fails.
      }
    }

    return {
      source: imageElement,
      width: imageElement.naturalWidth,
      height: imageElement.naturalHeight,
    };
  };
}

export const imageAssetCache = new ImageAssetCache();
