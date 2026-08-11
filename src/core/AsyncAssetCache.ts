export interface AssetCacheLoadingEntry {
  status: "loading";
  promise: Promise<void>;
}

export interface AssetCacheReadyEntry<TAsset> {
  status: "ready";
  asset: TAsset;
}

export interface AssetCacheErrorEntry {
  status: "error";
  error: unknown;
}

export type AssetCacheEntry<TAsset> =
  | AssetCacheLoadingEntry
  | AssetCacheReadyEntry<TAsset>
  | AssetCacheErrorEntry;

abstract class AsyncAssetCache<TKey, TAsset> {
  #cache = new Map<TKey, AssetCacheEntry<TAsset>>();

  protected abstract loadAsset(key: TKey): Promise<TAsset>;

  protected ensureLoadedByKey(key: TKey): AssetCacheEntry<TAsset> {
    const cachedEntry = this.#cache.get(key);

    // Single-attempt policy: once a key is cached in any state,
    // do not issue another load request.
    if (cachedEntry) {
      return cachedEntry;
    }

    const loadingPromise = this.loadAsset(key)
      .then((asset) => {
        this.#cache.set(key, {
          status: "ready",
          asset,
        });
      })
      .catch((error: unknown) => {
        this.#cache.set(key, {
          status: "error",
          error,
        });
      });

    const loadingEntry: AssetCacheLoadingEntry = {
      status: "loading",
      promise: loadingPromise,
    };

    this.#cache.set(key, loadingEntry);

    return loadingEntry;
  }

  protected getReadyAssetByKey(key: TKey): TAsset | null {
    const entry = this.ensureLoadedByKey(key);

    if (entry.status !== "ready") {
      return null;
    }

    return entry.asset;
  }

  protected preloadKeys(keyOrKeys: TKey | TKey[]): void {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    const uniqueKeys = [...new Set(keys)];

    for (const key of uniqueKeys) {
      this.ensureLoadedByKey(key);
    }
  }
}

export default AsyncAssetCache;
