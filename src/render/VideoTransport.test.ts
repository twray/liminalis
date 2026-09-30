import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VideoTransport from "./VideoTransport";
import type { VideoProps } from "./types";

// VideoTransport is the one piece of the renderer that is not a pure function
// of (props, time): it drives a live <video> element whose clock runs
// independently of the scene's. These tests pin the state machine that keeps
// the two reconciled -- see spec/video-primitive-plan.md §4.
//
// The mock records an ORDERED log of operations, because several of the
// guarantees are about ordering and call counts rather than end state: that a
// seek precedes play, that play happens once rather than once per frame, and
// that looping never pauses.

const SRC = "clip.mp4";

class MockVideoElement {
  src = "";
  duration = NaN;
  readyState = 0;
  paused = true;
  ended = false;
  muted = false;
  playsInline = false;
  crossOrigin: string | null = null;
  loop = false;
  videoWidth = 0;
  videoHeight = 0;

  calls: string[] = [];

  #currentTime = 0;
  #playRejects = false;

  // Assignments through the setter are OUR seeks, so they are logged.
  // __advance below writes the backing field directly, standing in for
  // playback moving the head on its own.
  get currentTime(): number {
    return this.#currentTime;
  }

  set currentTime(seconds: number) {
    this.#currentTime = seconds;
    // Per spec the ended flag is derived from the playback position, so moving
    // the head clears it. Note what it deliberately does NOT clear: paused. A
    // paused element stays paused through a seek, which is why looping needs
    // an explicit play().
    this.ended = false;
    this.calls.push(`seek:${seconds}`);
  }

  play = vi.fn(() => {
    this.calls.push("play");
    this.paused = false;
    return this.#playRejects
      ? Promise.reject(new Error("blocked"))
      : Promise.resolve();
  });

  pause = vi.fn(() => {
    this.calls.push("pause");
    this.paused = true;
  });

  load = vi.fn(() => {
    this.calls.push("load");
  });

  countOf(operation: string): number {
    return this.calls.filter((entry) => entry === operation).length;
  }

  seeks(): number[] {
    return this.calls
      .filter((entry) => entry.startsWith("seek:"))
      .map((entry) => Number(entry.slice("seek:".length)));
  }

  // --- test-only controls, not part of the real element's surface ---

  __advance(seconds: number): void {
    this.#currentTime = seconds;
  }

  // What a real element does when playback runs out, as distinct from
  // __advance's "the head moved": the head stops at the last frame's
  // presentation time -- which is NOT necessarily the declared duration --
  // and both flags flip.
  //
  // Modelling only the clock is exactly why the "stops early and never loops"
  // bug survived a full suite of passing tests.
  __reachNaturalEnd(atSeconds = this.duration): void {
    this.#currentTime = atSeconds;
    this.ended = true;
    this.paused = true;
  }

  __rejectPlay(): void {
    this.#playRejects = true;
  }

  __loadMetadata(durationSeconds: number, width = 640, height = 360): void {
    this.readyState = 2; // HAVE_CURRENT_DATA
    this.duration = durationSeconds;
    this.videoWidth = width;
    this.videoHeight = height;
  }

  asElement(): HTMLVideoElement {
    return this as unknown as HTMLVideoElement;
  }
}

// Records what the transport asked of its frame hold, without needing a canvas
// or a document. Injected for the same reason the element is: the decisions
// under test are "when to capture" and "which source to paint", neither of
// which is about how a bitmap is retained.
class StubFrameHold {
  captures: Array<{ source: unknown; width: number; height: number }> = [];
  releases = 0;

  #frame: object | null = null;
  // Shared with the element so captures and seeks land in ONE ordered log.
  // Ordering is the whole point here: a capture after the head has moved would
  // retain the incoming frame, which is not a hold at all.
  #log: string[] | null = null;

  constructor(log?: string[]) {
    this.#log = log ?? null;
  }

  capture(source: unknown, width: number, height: number): void {
    this.captures.push({ source, width, height });
    this.#log?.push("capture");
    this.#frame = { heldFrame: true };
  }

  get(): unknown {
    return this.#frame;
  }

  release(): void {
    this.releases += 1;
    this.#frame = null;
  }

  asFrameHold() {
    return this as unknown as ConstructorParameters<typeof VideoTransport>[1];
  }
}

// The first reconcile of a given src only assigns it and calls load() --
// there is no duration to resolve a range against yet. This drives past that
// into a playing transport, which is the starting point for most cases below.
const startPlaying = (
  props: VideoProps = {},
  durationSeconds = 5,
): {
  transport: VideoTransport;
  element: MockVideoElement;
  hold: StubFrameHold;
} => {
  const element = new MockVideoElement();
  const hold = new StubFrameHold(element.calls);
  const transport = new VideoTransport(element.asElement(), hold.asFrameHold());

  transport.reconcile(SRC, props);
  element.__loadMetadata(durationSeconds);
  transport.reconcile(SRC, props);

  return { transport, element, hold };
};

describe("VideoTransport", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("element setup", () => {
    it("configures the element once, and never enables native looping", () => {
      const element = new MockVideoElement();
      new VideoTransport(element.asElement());

      expect(element.muted).toBe(true);
      expect(element.playsInline).toBe(true);
      expect(element.crossOrigin).toBe("anonymous");
      expect(element.loop).toBe(false);
    });

    it("leaves native loop off even for a looping clip", () => {
      // The guard against regressing toward the native attribute, which
      // cannot express a trimmed segment. Looping is implemented by reseeking
      // so there is one code path regardless of whether a clip is trimmed.
      const { element } = startPlaying({ loop: true });

      element.__advance(5);
      expect(element.loop).toBe(false);
    });
  });

  describe("before metadata arrives", () => {
    it("neither seeks nor plays", () => {
      const element = new MockVideoElement();
      const transport = new VideoTransport(element.asElement());

      transport.reconcile(SRC, {});
      transport.reconcile(SRC, {});
      transport.reconcile(SRC, {});

      expect(element.countOf("play")).toBe(0);
      expect(element.seeks()).toEqual([]);
      expect(transport.isReady()).toBe(false);
    });

    it("assigns the src and loads it", () => {
      const element = new MockVideoElement();
      const transport = new VideoTransport(element.asElement());

      transport.reconcile(SRC, {});

      expect(element.src).toBe(SRC);
      expect(element.countOf("load")).toBe(1);
    });
  });

  describe("starting playback", () => {
    it("plays exactly once, not once per frame", () => {
      const { transport, element } = startPlaying();

      transport.reconcile(SRC, {});
      transport.reconcile(SRC, {});
      transport.reconcile(SRC, {});

      expect(element.countOf("play")).toBe(1);
    });

    it("seeks to clipStartTime before playing", () => {
      const { element } = startPlaying({ clipStartTime: 2000 });

      // Order matters: playing first would briefly show the wrong frame. The
      // capture ahead of the seek covers the readiness gap this first seek
      // opens too, so startup holds frame zero rather than flashing blank.
      expect(element.calls).toEqual(["load", "capture", "seek:2", "play"]);
    });

    it("accepts a TimeExpression for clipStartTime", () => {
      // Proves eventTimeToMs is actually wired in rather than only the
      // numeric branch being handled.
      const { element } = startPlaying({ clipStartTime: "0:02" });

      expect(element.seeks()).toEqual([2]);
    });

    it("clamps clipStartTime to the duration", () => {
      const { element } = startPlaying({ clipStartTime: 9000 }, 5);

      // Clamped to 5s, which then equals the end -- a zero-length range.
      expect(element.seeks()).toEqual([5]);
      expect(element.countOf("play")).toBe(0);
    });
  });

  describe("looping", () => {
    it("reseeks to the start and never pauses", () => {
      const { transport, element } = startPlaying({ loop: true }, 5);

      element.__advance(5);
      transport.reconcile(SRC, { loop: true });

      expect(element.seeks()).toEqual([0, 0]);
      expect(element.countOf("pause")).toBe(0);
    });

    it("loops within a trimmed segment rather than the whole file", () => {
      const props: VideoProps = { clipStartTime: 1000, clipEndTime: 3000 };
      const { transport, element } = startPlaying(props, 10);

      element.__advance(3);
      transport.reconcile(SRC, props);

      // Back to 1s, not 0 -- the segment's start, not the file's.
      expect(element.seeks()).toEqual([1, 1]);
    });

    it("loops by default when loop is not declared", () => {
      const { transport, element } = startPlaying({}, 5);

      element.__advance(5);
      transport.reconcile(SRC, {});

      expect(element.countOf("pause")).toBe(0);
      expect(element.seeks()).toEqual([0, 0]);
    });
  });

  describe("non-looping", () => {
    it("pauses exactly once at the end and stays paused", () => {
      const props: VideoProps = { loop: false };
      const { transport, element } = startPlaying(props, 5);

      element.__advance(5);
      transport.reconcile(SRC, props);

      // Further frames must not produce a second pause -- this is the test
      // that catches a reconciler which re-checks the threshold without
      // tracking that it already stopped.
      element.__advance(6);
      transport.reconcile(SRC, props);
      transport.reconcile(SRC, props);

      expect(element.countOf("pause")).toBe(1);
    });

    it("stops at clipEndTime rather than the natural end", () => {
      const props: VideoProps = { loop: false, clipEndTime: 2000 };
      const { transport, element } = startPlaying(props, 10);

      element.__advance(2);
      transport.reconcile(SRC, props);

      expect(element.countOf("pause")).toBe(1);
    });

    it("defaults clipEndTime to the natural duration", () => {
      const props: VideoProps = { loop: false };
      const { transport, element } = startPlaying(props, 5);

      // Short of the duration: must not have stopped yet.
      element.__advance(4.9);
      transport.reconcile(SRC, props);
      expect(element.countOf("pause")).toBe(0);

      element.__advance(5);
      transport.reconcile(SRC, props);
      expect(element.countOf("pause")).toBe(1);
    });
  });

  // The cases above drive the end by moving the clock to the threshold, which
  // is the tidy case. A real element's own end is messier, and the difference
  // is where the "20 second clip stops at 18 seconds and never loops" bug
  // lived: a container's declared duration can exceed the last frame's actual
  // presentation time, so currentTime can top out BELOW endMs and a
  // threshold-only comparison never becomes true.
  describe("the element's own end, not just the clock", () => {
    // Not an invented figure: measured from the clip this was diagnosed
    // against, whose edit list trims 0.0667s off the front of the video track
    // while still declaring a 20.000s segment. Its 600 frames therefore stop
    // being presented at 19.933s, 66.7ms short of the duration the element
    // reports.
    const LAST_FRAME = 19.933;

    it("loops although the clock never reached endMs", () => {
      const props: VideoProps = { loop: true };
      const { transport, element } = startPlaying(props, 20);

      element.__reachNaturalEnd(LAST_FRAME);
      transport.reconcile(SRC, props);

      // Without consulting ended, 19967 >= 20000 is false forever and the
      // video sits frozen on its final frame.
      expect(element.seeks()).toEqual([0, 0]);
    });

    it("restarts playback when the natural end left the element paused", () => {
      const props: VideoProps = { loop: true };
      const { transport, element } = startPlaying(props, 20);

      element.__reachNaturalEnd(LAST_FRAME);
      transport.reconcile(SRC, props);

      // Seeking alone is not enough here: a paused element stays paused
      // through a seek, so the loop would show its first frame and stop.
      expect(element.countOf("play")).toBe(2);
      expect(element.paused).toBe(false);
    });

    it("does not re-issue play() when the loop was never paused", () => {
      // The contrast case for the test above -- the resume must be conditional
      // on paused, not an unconditional second play() on every loop.
      const props: VideoProps = { loop: true };
      const { transport, element } = startPlaying(props, 5);

      element.__advance(5);
      transport.reconcile(SRC, props);

      expect(element.countOf("play")).toBe(1);
    });

    it("ends a non-looping clip on the element's own end too", () => {
      const props: VideoProps = { loop: false };
      const { transport, element } = startPlaying(props, 20);

      element.__reachNaturalEnd(LAST_FRAME);
      transport.reconcile(SRC, props);

      expect(element.countOf("pause")).toBe(1);

      // And genuinely settled: the signature has to stabilise, or the bitmap
      // cache can never promote a finished video.
      const settled = transport.getExtraSignature();
      transport.reconcile(SRC, props);
      expect(transport.getExtraSignature()).toBe(settled);
    });
  });

  describe("duration refinement", () => {
    it("does not restart playback when the element refines its own duration", () => {
      const props: VideoProps = { loop: true };
      const { transport, element } = startPlaying(props, 20);

      element.__advance(8);
      // Identical declared props, but the element now reports a longer
      // duration -- a durationchange, i.e. the element correcting itself
      // rather than the caller declaring a different segment. Reacting to the
      // RESOLVED range moving would yank playback back to zero eight seconds
      // in, which reads as a random restart mid-play.
      element.duration = 20.033;
      transport.reconcile(SRC, props);

      expect(element.seeks()).toEqual([0]);
      expect(element.currentTime).toBe(8);
    });

    it("still restarts when the caller actually re-declares the range", () => {
      // The refinement guard must not have cost us the declarative behaviour
      // it sits next to.
      const { transport, element } = startPlaying({ clipStartTime: 0 }, 20);

      element.__advance(8);
      transport.reconcile(SRC, { clipStartTime: 3000 });

      expect(element.seeks()).toEqual([0, 3]);
    });
  });

  describe("declarative range changes", () => {
    it("reseeks when the range changes mid-playback", () => {
      const { transport, element } = startPlaying({ clipStartTime: 0 }, 10);

      element.__advance(2);
      transport.reconcile(SRC, { clipStartTime: 6000 });

      expect(element.seeks()).toEqual([0, 6]);
    });

    it("resumes an ended transport given a new range", () => {
      // The one case where play() legitimately fires more than once in a
      // transport's life, so it is asserted explicitly rather than assumed.
      const ended: VideoProps = { loop: false, clipEndTime: 2000 };
      const { transport, element } = startPlaying(ended, 10);

      element.__advance(2);
      transport.reconcile(SRC, ended);
      expect(element.countOf("play")).toBe(1);

      transport.reconcile(SRC, { loop: false, clipEndTime: 8000 });

      expect(element.countOf("play")).toBe(2);
    });

    it("does not replay while the range is unchanged", () => {
      const { transport, element } = startPlaying({ clipEndTime: 4000 }, 10);

      transport.reconcile(SRC, { clipEndTime: 4000 });
      transport.reconcile(SRC, { clipEndTime: 4000 });

      expect(element.countOf("play")).toBe(1);
    });
  });

  describe("src changes", () => {
    it("reloads and returns to not-ready", () => {
      const { transport, element } = startPlaying();

      transport.reconcile("other.mp4", {});

      expect(element.src).toBe("other.mp4");
      expect(element.countOf("load")).toBe(2);
      // No seek or play against the new src until its metadata arrives.
      expect(element.calls.slice(-1)).toEqual(["load"]);
    });
  });

  describe("degenerate range", () => {
    it("never plays, and warns once", () => {
      const props: VideoProps = { clipStartTime: 3000, clipEndTime: 1000 };
      const { transport, element } = startPlaying(props, 10);

      transport.reconcile(SRC, props);
      transport.reconcile(SRC, props);

      expect(element.countOf("play")).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("zero");
    });
  });

  describe("readiness and bounds", () => {
    it("is not ready below HAVE_CURRENT_DATA and ready at or above it", () => {
      const element = new MockVideoElement();
      const transport = new VideoTransport(element.asElement());

      element.readyState = 1;
      expect(transport.isReady()).toBe(false);

      element.readyState = 2;
      expect(transport.isReady()).toBe(true);

      element.readyState = 4;
      expect(transport.isReady()).toBe(true);
    });

    it("prefers explicit dimensions over the video's own", () => {
      const { transport } = startPlaying();

      expect(
        transport.getBounds({ x: 5, y: 6, width: 100, height: 50 }),
      ).toEqual({ x: 5, y: 6, width: 100, height: 50 });
    });

    it("falls back to the video's natural dimensions", () => {
      const { transport } = startPlaying();

      expect(transport.getBounds({ x: 1, y: 2 })).toEqual({
        x: 1,
        y: 2,
        width: 640,
        height: 360,
      });
    });

    it("has no bounds before metadata, whatever the props say", () => {
      const element = new MockVideoElement();
      const transport = new VideoTransport(element.asElement());

      expect(transport.getBounds({ x: 0, y: 0 })).toBeNull();
    });
  });

  // Seeking drops an element's readyState below paintable for a frame or two,
  // and drawImage on a video below that threshold draws nothing at all. So
  // without a retained frame every loop iteration shows a blank -- the flash
  // this machinery exists to remove.
  describe("holding a frame across a readiness gap", () => {
    it("captures the outgoing frame before moving the head, not after", () => {
      const props: VideoProps = { loop: true };
      const { transport, element } = startPlaying(props, 5);

      element.calls.length = 0;
      element.__reachNaturalEnd(5);
      transport.reconcile(SRC, props);

      // Capture strictly precedes the seek. Reversed, the hold would retain
      // the frame at the START of the segment -- so a loop would hold the
      // frame it was about to show anyway, and the gap would still read blank.
      expect(element.calls).toEqual(["capture", "seek:0", "play"]);
    });

    it("prefers the live element whenever it has a decoded frame", () => {
      const { transport, element } = startPlaying({}, 5);

      expect(transport.getFrameSource()).toBe(element);
    });

    it("falls back to the held frame while the element has none", () => {
      const { transport, element, hold } = startPlaying({}, 5);

      // The begin-playback seek already captured a frame.
      expect(hold.captures).toHaveLength(1);

      element.readyState = 1; // mid-seek

      expect(transport.getFrameSource()).toBe(hold.get());
      expect(transport.getFrameSource()).not.toBeNull();
    });

    it("paints nothing only when neither source has a frame", () => {
      const element = new MockVideoElement();
      const hold = new StubFrameHold();
      const transport = new VideoTransport(
        element.asElement(),
        hold.asFrameHold(),
      );

      expect(transport.getFrameSource()).toBeNull();
    });

    it("captures at the source's natural size, so fit maths is unchanged", () => {
      const { hold, element } = startPlaying({}, 5);

      expect(hold.captures[0]).toEqual({
        source: element,
        width: 640,
        height: 360,
      });
    });

    it("captures once per seek, not once per frame", () => {
      const props: VideoProps = { loop: true };
      const { transport, hold } = startPlaying(props, 5);

      expect(hold.captures).toHaveLength(1);

      // Many quiet frames mid-playback must not each blit a full-resolution
      // bitmap -- that is the cost this design exists to avoid.
      for (let frame = 0; frame < 30; frame++) {
        transport.reconcile(SRC, props);
      }

      expect(hold.captures).toHaveLength(1);
    });

    it("captures again on the loop's reseek", () => {
      const props: VideoProps = { loop: true };
      const { transport, element, hold } = startPlaying(props, 5);

      element.__reachNaturalEnd(5);
      transport.reconcile(SRC, props);

      // Second capture: the frame being held across the loop's own gap.
      expect(hold.captures).toHaveLength(2);
    });

    it("releases the held frame when the src changes", () => {
      const { transport, hold } = startPlaying({}, 5);

      // Assigning the first src already released once, so the count is
      // rebased to measure this change rather than the setup.
      hold.releases = 0;
      transport.reconcile("other.mp4", {});

      // Holding it would show the outgoing clip's last frame over the
      // incoming one while it loads.
      expect(hold.releases).toBe(1);
      expect(hold.get()).toBeNull();
    });

    it("releases the held frame on dispose", () => {
      const { transport, hold } = startPlaying({}, 5);

      hold.releases = 0;
      transport.dispose();

      // At native resolution it is the largest thing the transport retains.
      expect(hold.releases).toBe(1);
      expect(hold.get()).toBeNull();
    });
  });

  describe("signature contribution", () => {
    it("changes as playback advances", () => {
      const { transport, element } = startPlaying();

      const before = transport.getExtraSignature();
      element.__advance(1.5);

      expect(transport.getExtraSignature()).not.toBe(before);
    });

    it("stabilises once ended, which is what lets the cache promote it", () => {
      const props: VideoProps = { loop: false };
      const { transport, element } = startPlaying(props, 5);

      element.__advance(5);
      transport.reconcile(SRC, props);

      const first = transport.getExtraSignature();
      transport.reconcile(SRC, props);

      expect(transport.getExtraSignature()).toBe(first);
    });

    it("names the paint source, so a live/held/none swap invalidates", () => {
      const element = new MockVideoElement();
      const hold = new StubFrameHold();
      const transport = new VideoTransport(
        element.asElement(),
        hold.asFrameHold(),
      );

      // Nothing decoded and nothing retained.
      expect(transport.getExtraSignature()).toContain("src:none");

      element.__loadMetadata(5);
      expect(transport.getExtraSignature()).toContain("src:live");

      // A held frame is a THIRD distinct state, not merely "not live". Folding
      // it in with none would let the cache blit a blank surface over a frame
      // that is genuinely being held, reinstating the flash through the cache.
      hold.capture({}, 640, 360);
      element.readyState = 1;
      expect(transport.getExtraSignature()).toContain("src:held");
    });
  });

  describe("play() rejection", () => {
    it("is caught and warned about once, without escaping", async () => {
      const element = new MockVideoElement();
      element.__rejectPlay();
      const transport = new VideoTransport(element.asElement());

      transport.reconcile(SRC, {});
      element.__loadMetadata(5);
      transport.reconcile(SRC, {});

      // Let the rejection settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("playback");
    });
  });

  describe("dispose", () => {
    it("pauses, clears the src and reloads, releasing the pipeline", () => {
      const { transport, element } = startPlaying();

      transport.dispose();

      expect(element.countOf("pause")).toBe(1);
      expect(element.src).toBe("");
      expect(element.countOf("load")).toBe(2);
    });

    it("is safe on a transport that never became ready", () => {
      const element = new MockVideoElement();
      const transport = new VideoTransport(element.asElement());

      expect(() => transport.dispose()).not.toThrow();
    });

    it("is safe on an already-ended transport", () => {
      const props: VideoProps = { loop: false };
      const { transport, element } = startPlaying(props, 5);

      element.__advance(5);
      transport.reconcile(SRC, props);

      expect(() => transport.dispose()).not.toThrow();
    });
  });
});
