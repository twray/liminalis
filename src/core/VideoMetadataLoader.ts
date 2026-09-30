const HAVE_METADATA = 1;

class VideoMetadataLoader {
  #pendingBySrc = new Map<string, Promise<void>>();

  // Awaits just enough of a video for its intrinsic size and duration to be
  // known, so a scene's first frame can size a video() frame from real
  // dimensions rather than rendering nothing until metadata arrives.
  awaitMetadata(videoSrc: string): Promise<void> {
    const pending = this.#pendingBySrc.get(videoSrc);

    if (pending) {
      return pending;
    }

    const promise = this.#loadMetadata(videoSrc);
    this.#pendingBySrc.set(videoSrc, promise);

    return promise;
  }

  #loadMetadata(videoSrc: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(
          new Error(
            "[liminalis] load({ video }) requires a DOM document to preload metadata.",
          ),
        );
        return;
      }

      const element = document.createElement("video");

      const settle = (outcome: () => void) => {
        element.removeEventListener("loadedmetadata", onLoadedMetadata);
        element.removeEventListener("error", onError);

        // Release the probe: it has served its purpose, and leaving it
        // attached to a src would keep a decode pipeline and request alive
        // for a video the scene may not even declare yet.
        element.pause();
        element.src = "";
        element.load();

        outcome();
      };

      const onLoadedMetadata = () => settle(resolve);
      const onError = () =>
        settle(() =>
          reject(new Error(`Failed to load video metadata: ${videoSrc}`)),
        );

      element.addEventListener("loadedmetadata", onLoadedMetadata);
      element.addEventListener("error", onError);

      element.muted = true;
      element.crossOrigin = "anonymous";
      // Asks the browser for metadata only, rather than beginning to buffer
      // the whole file for an element that is about to be thrown away.
      element.preload = "metadata";
      element.src = videoSrc;

      // A cached response can already satisfy this before the listener
      // attaches.
      if (element.readyState >= HAVE_METADATA) {
        settle(resolve);
      }
    });
  }
}

export const videoMetadataLoader = new VideoMetadataLoader();
