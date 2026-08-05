export interface LoadedImageAsset {
  source: CanvasImageSource;
  width: number;
  height: number;
}

interface ImageCacheLoadingEntry {
  status: "loading";
  promise: Promise<void>;
}

interface ImageCacheReadyEntry {
  status: "ready";
  asset: LoadedImageAsset;
}

interface ImageCacheErrorEntry {
  status: "error";
  error: unknown;
}

type ImageCacheEntry =
  | ImageCacheLoadingEntry
  | ImageCacheReadyEntry
  | ImageCacheErrorEntry;

class ImageAssetCache {
  #cache = new Map<string, ImageCacheEntry>();

  ensureLoaded(imageSrc: string): ImageCacheEntry {
    const cachedEntry = this.#cache.get(imageSrc);

    // Single-attempt policy: once a URL is cached in any state,
    // do not issue another network request.
    if (cachedEntry) {
      return cachedEntry;
    }

    const loadingPromise = new Promise<void>((resolve) => {
      const imageElement = new Image();
      imageElement.crossOrigin = "anonymous";

      imageElement.onload = () => {
        void this.#toLoadedImageAsset(imageElement)
          .then((asset) => {
            this.#cache.set(imageSrc, {
              status: "ready",
              asset,
            });
          })
          .catch((error: unknown) => {
            this.#cache.set(imageSrc, {
              status: "error",
              error,
            });
          })
          .finally(() => {
            resolve();
          });
      };

      imageElement.onerror = () => {
        this.#cache.set(imageSrc, {
          status: "error",
          error: new Error(`Failed to load image: ${imageSrc}`),
        });

        resolve();
      };

      imageElement.src = imageSrc;
    });

    const loadingEntry: ImageCacheLoadingEntry = {
      status: "loading",
      promise: loadingPromise,
    };

    this.#cache.set(imageSrc, loadingEntry);

    return loadingEntry;
  }

  getReadyAsset(imageSrc: string): LoadedImageAsset | null {
    const entry = this.ensureLoaded(imageSrc);

    if (entry.status !== "ready") {
      return null;
    }

    return entry.asset;
  }

  preload(imageSources: string[]): void {
    const uniqueImageSources = [...new Set(imageSources)];

    for (const imageSource of uniqueImageSources) {
      this.ensureLoaded(imageSource);
    }
  }

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
