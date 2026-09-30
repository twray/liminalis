import { describe, expect, it, vi } from "vitest";

import AnimatableRegistry from "./AnimatableRegistry";
import VideoTransport from "./VideoTransport";
import VideoTransportRegistry from "./VideoTransportRegistry";

const SRC = "clip.mp4";

// Minimal stand-in: the registry only ever calls reconcile and dispose on a
// transport, so the tests only need those observable.
const createStubTransport = () => {
  const element = {
    src: "",
    duration: NaN,
    readyState: 0,
    paused: true,
    muted: false,
    playsInline: false,
    crossOrigin: null as string | null,
    loop: false,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
  };

  return new VideoTransport(element as unknown as HTMLVideoElement);
};

const createRegistry = () => {
  const created: VideoTransport[] = [];

  const registry = new VideoTransportRegistry(() => {
    const transport = createStubTransport();
    created.push(transport);
    return transport;
  });

  return { registry, created };
};

describe("VideoTransportRegistry", () => {
  it("reuses the same transport for the same declaration site across frames", () => {
    const { registry } = createRegistry();

    registry.beginFrame();
    const first = registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    registry.beginFrame();
    const second = registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    // Identity, not merely equivalent state: the same <video> element has to
    // survive, or playback would restart every frame.
    expect(second).toBe(first);
    expect(registry.size).toBe(1);
  });

  it("gives separate declaration sites independent transports", () => {
    const { registry } = createRegistry();

    registry.beginFrame();
    const first = registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    const second = registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    // Same src, two call sites -- two independent playback heads, per the
    // identity decision in §2.
    expect(second).not.toBe(first);
    expect(registry.size).toBe(2);
  });

  it("disposes a transport whose declaration site disappears, not just drops it", () => {
    const { registry, created } = createRegistry();

    registry.beginFrame();
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();
    expect(registry.size).toBe(2);

    const disposeSpy = vi.spyOn(created[1]!, "dispose");

    // Second site no longer declared.
    registry.beginFrame();
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    // The distinction that matters: dropping the reference alone would leave a
    // decode pipeline and an in-flight request running.
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(1);
  });

  it("keeps a surviving transport alive when a sibling is swept", () => {
    const { registry, created } = createRegistry();

    registry.beginFrame();
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    const survivorDispose = vi.spyOn(created[0]!, "dispose");

    registry.beginFrame();
    const survivor = registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    expect(survivorDispose).not.toHaveBeenCalled();
    expect(survivor).toBe(created[0]);
  });

  describe("keys", () => {
    it("follows the item rather than the slot when a list reorders", () => {
      // The §5b hazard, made observable. If the key did not reach this
      // registry, a reordered list would draw each video in the right place
      // while showing another item's footage -- and every geometry-level test
      // would still pass.
      const { registry } = createRegistry();

      registry.beginFrame();
      const a = registry.getOrCreate(
        SRC,
        {},
        {
          primitiveType: "video",
          key: "a",
        },
      );
      const b = registry.getOrCreate(
        SRC,
        {},
        {
          primitiveType: "video",
          key: "b",
        },
      );
      registry.endFrame();

      // Declaration order reversed.
      registry.beginFrame();
      const bAgain = registry.getOrCreate(
        SRC,
        {},
        {
          primitiveType: "video",
          key: "b",
        },
      );
      const aAgain = registry.getOrCreate(
        SRC,
        {},
        {
          primitiveType: "video",
          key: "a",
        },
      );
      registry.endFrame();

      expect(aAgain).toBe(a);
      expect(bAgain).toBe(b);
    });

    it("throws on a duplicated key, from this registry", () => {
      // Inherited from the tracker's nextId rather than implemented here.
      // Asserted explicitly because inherited behaviour is exactly what
      // silently stops working when the extraction is refactored later.
      const { registry } = createRegistry();

      registry.beginFrame();
      registry.getOrCreate(SRC, {}, { primitiveType: "video", key: "dup" });

      expect(() =>
        registry.getOrCreate(SRC, {}, { primitiveType: "video", key: "dup" }),
      ).toThrow(/Duplicate key/);
    });

    it("does not construct a second transport for the rejected duplicate", () => {
      // The throw has to happen before anything is allocated or reconciled,
      // or a duplicate would leave a stray <video> element behind.
      const { registry, created } = createRegistry();

      registry.beginFrame();
      registry.getOrCreate(SRC, {}, { primitiveType: "video", key: "dup" });

      try {
        registry.getOrCreate(SRC, {}, { primitiveType: "video", key: "dup" });
      } catch {
        // expected
      }

      expect(created).toHaveLength(1);
    });
  });

  it("resolves identity independently of AnimatableRegistry at the same depth", () => {
    // Two tracker instances, deliberately not one shared: a scene's video call
    // sites and its shape call sites must not consume each other's positional
    // indices. Exercised side by side because that is the only way the
    // independence is observable.
    const { registry } = createRegistry();
    const animatables = new AnimatableRegistry();

    registry.beginFrame();
    animatables.beginFrame(0);

    const videoFirst = registry.getOrCreate(
      SRC,
      {},
      {
        primitiveType: "video",
      },
    );
    const shape = animatables.queue({ x: 0 }, () => {}, {
      primitiveType: "rect",
    });

    registry.endFrame();
    animatables.endFrame();

    registry.beginFrame();
    animatables.beginFrame(16);

    const videoSecond = registry.getOrCreate(
      SRC,
      {},
      {
        primitiveType: "video",
      },
    );
    const shapeAgain = animatables.queue({ x: 0 }, () => {}, {
      primitiveType: "rect",
    });

    registry.endFrame();
    animatables.endFrame();

    // Both held their own identity; neither was shifted by the other.
    expect(videoSecond).toBe(videoFirst);
    expect(shapeAgain).toBe(shape);
  });

  it("disposes everything on clear", () => {
    const { registry, created } = createRegistry();

    registry.beginFrame();
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.getOrCreate(SRC, {}, { primitiveType: "video" });
    registry.endFrame();

    const spies = created.map((transport) => vi.spyOn(transport, "dispose"));

    registry.clear();

    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(registry.size).toBe(0);
  });
});
