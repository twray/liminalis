import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeProbeElement {
  src = "";
  muted = false;
  preload = "";
  crossOrigin: string | null = null;
  readyState = 0;

  pause = vi.fn();
  load = vi.fn();

  #listeners = new Map<string, Set<() => void>>();

  addEventListener = vi.fn((type: string, listener: () => void) => {
    const existing = this.#listeners.get(type) ?? new Set();
    existing.add(listener);
    this.#listeners.set(type, existing);
  });

  removeEventListener = vi.fn((type: string, listener: () => void) => {
    this.#listeners.get(type)?.delete(listener);
  });

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  emit(type: string): void {
    // Copied before iterating: a listener settles the promise, which removes
    // it mid-iteration.
    [...(this.#listeners.get(type) ?? [])].forEach((listener) => listener());
  }
}

let probes: FakeProbeElement[] = [];
const previousDocument = (globalThis as any).document;

const useFakeDocument = () => {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag !== "video") {
        throw new Error(`unexpected createElement("${tag}")`);
      }

      const element = new FakeProbeElement();
      probes.push(element);
      return element;
    },
  };
};

// Fresh module instance per test, matching ImageAssetCache.test.ts: resetting
// here, then importing inside each test body, is what guarantees
// videoMetadataLoader's internal cache starts empty.
const getLoader = async () =>
  (await import("./VideoMetadataLoader")).videoMetadataLoader;

beforeEach(() => {
  probes = [];
  vi.resetModules();
  useFakeDocument();
});

afterEach(() => {
  (globalThis as any).document = previousDocument;
});

describe("videoMetadataLoader", () => {
  it("resolves once metadata arrives", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("clip.mp4");

    probes[0]!.emit("loadedmetadata");

    await expect(pending).resolves.toBeUndefined();
  });

  it("asks only for metadata, not the whole file", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("clip.mp4");

    // Buffering the entire file for an element that is about to be discarded
    // would defeat the point of preloading cheaply.
    expect(probes[0]!.preload).toBe("metadata");
    expect(probes[0]!.crossOrigin).toBe("anonymous");

    probes[0]!.emit("loadedmetadata");
    await pending;
  });

  it("rejects with the src named when the source fails", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("missing.mp4");

    probes[0]!.emit("error");

    await expect(pending).rejects.toThrow(/missing\.mp4/);
  });

  it("releases the probe element once settled", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("clip.mp4");
    const probe = probes[0]!;

    probe.emit("loadedmetadata");
    await pending;

    // Left attached to a src, the probe would keep a decode pipeline and
    // request alive for a video the scene may never declare.
    expect(probe.pause).toHaveBeenCalled();
    expect(probe.src).toBe("");
    expect(probe.load).toHaveBeenCalled();
  });

  it("removes both listeners once settled", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("clip.mp4");
    const probe = probes[0]!;

    probe.emit("loadedmetadata");
    await pending;

    expect(probe.listenerCount("loadedmetadata")).toBe(0);
    expect(probe.listenerCount("error")).toBe(0);
  });

  it("removes both listeners after a failure too", async () => {
    const loader = await getLoader();
    const pending = loader.awaitMetadata("missing.mp4");
    const probe = probes[0]!;

    probe.emit("error");
    await expect(pending).rejects.toThrow();

    expect(probe.listenerCount("error")).toBe(0);
    expect(probe.listenerCount("loadedmetadata")).toBe(0);
  });

  it("issues one request per src, however many times it is preloaded", async () => {
    const loader = await getLoader();
    const first = loader.awaitMetadata("clip.mp4");
    const second = loader.awaitMetadata("clip.mp4");

    expect(probes).toHaveLength(1);
    expect(second).toBe(first);

    probes[0]!.emit("loadedmetadata");
    await first;
  });

  it("probes distinct sources separately", async () => {
    const loader = await getLoader();
    const a = loader.awaitMetadata("a.mp4");
    const b = loader.awaitMetadata("b.mp4");

    expect(probes).toHaveLength(2);

    probes[0]!.emit("loadedmetadata");
    probes[1]!.emit("loadedmetadata");

    await Promise.all([a, b]);
  });

  it("settles immediately when metadata is already available", async () => {
    // A cached response can satisfy this before any event fires, in which
    // case waiting for one would hang the deferred first render indefinitely.
    (globalThis as any).document = {
      createElement: () => {
        const element = new FakeProbeElement();
        element.readyState = 1; // HAVE_METADATA
        probes.push(element);
        return element;
      },
    };

    const loader = await getLoader();

    await expect(loader.awaitMetadata("cached.mp4")).resolves.toBeUndefined();
  });

  it("rejects rather than throwing when there is no document", async () => {
    (globalThis as any).document = undefined;

    const loader = await getLoader();

    await expect(loader.awaitMetadata("clip.mp4")).rejects.toThrow(/document/);
  });
});
