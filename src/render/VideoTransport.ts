import { clampWithinRange, eventTimeToMs } from "../util";
import VideoFrameHold, { type FrameHold } from "./VideoFrameHold";
import type { Bounds, VideoProps } from "./types";

const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

// not-ready → starting → playing → ended
//
// `.play()` is called once per transport in the ordinary case. The single
// exception is a range change after `ended`, which returns the machine to
// `starting` so a newly-declared segment actually plays; see reconcile.
type TransportState = "not-ready" | "starting" | "playing" | "ended";

interface ResolvedRange {
  startMs: number;
  endMs: number;
}

// Owns one <video> element for one declaration site, and reconciles it
// against declared props once per frame. Deliberately polls readyState and
// currentTime rather than registering media events: the render loop already
// re-invokes this every animation frame, so listeners would add registration
// and teardown (and a disposal race) to buy at most one frame of latency.
class VideoTransport {
  #element: HTMLVideoElement;
  #frameHold: FrameHold;
  #src: string | null = null;
  #state: TransportState = "not-ready";
  #startMs = 0;
  #endMs = 0;
  #declaredStart: VideoProps["clipStartTime"];
  #declaredEnd: VideoProps["clipEndTime"];
  #hasDeclaredRange = false;
  #hasWarnedDegenerateRange = false;
  #hasWarnedPlayRejected = false;

  // The element -- and, for the same reason, the frame hold -- is injectable
  // so tests can substitute a stub without monkeypatching document. Muted
  // unconditionally and never unmuted: audio is out of scope by design, not
  // merely defaulted off.
  constructor(element?: HTMLVideoElement, frameHold?: FrameHold) {
    this.#element = element ?? VideoTransport.#createElement();
    this.#frameHold = frameHold ?? new VideoFrameHold();

    this.#element.muted = true;
    this.#element.playsInline = true;
    this.#element.crossOrigin = "anonymous";
    this.#element.loop = false;
  }

  #setState(next: TransportState): void {
    if (this.#state === next) {
      return;
    }

    this.#state = next;
  }

  static #createElement(): HTMLVideoElement {
    if (typeof document === "undefined") {
      throw new Error(
        "[liminalis] video() requires a DOM document to create its <video> element.",
      );
    }

    return document.createElement("video");
  }

  getElement(): HTMLVideoElement {
    return this.#element;
  }

  // Mirrors image()'s readiness guard: nothing is drawn below this, the same
  // way nothing is drawn while an image asset is still decoding.
  isReady(): boolean {
    return this.#element.readyState >= HAVE_CURRENT_DATA;
  }

  // What the primitive should actually paint this frame: the live element when
  // it holds a decoded frame, otherwise the retained one. Null means there is
  // genuinely nothing to show -- before the first frame ever decodes -- which
  // is the only case that should draw nothing.
  //
  // Centralising the choice here rather than leaving readiness checks at the
  // call sites is what keeps "is there a frame, and which one" a single
  // decision; getExtraSignature below reports the same three-way answer so the
  // bitmap cache invalidates in step with what is on screen.
  getFrameSource(): CanvasImageSource | null {
    if (this.isReady()) {
      return this.#element;
    }

    return this.#frameHold.get();
  }

  #hasMetadata(): boolean {
    return this.#element.readyState >= HAVE_METADATA;
  }

  // Explicit dimensions win; otherwise the source's own, once known.
  // Mirrors getImageBounds' three-way branch.
  getBounds(props: VideoProps): Bounds | null {
    const { x = 0, y = 0, width, height } = props;

    if (width !== undefined && height !== undefined) {
      return { x, y, width, height };
    }

    if (!this.#hasMetadata()) {
      return null;
    }

    return {
      x,
      y,
      width: this.#element.videoWidth,
      height: this.#element.videoHeight,
    };
  }

  getNaturalDimensions(): { width: number; height: number } {
    return {
      width: this.#element.videoWidth,
      height: this.#element.videoHeight,
    };
  }

  // Fed through the same getExtraSignature hook image() uses for its
  // ready/not-ready flip. currentTime is the right signal in every state:
  // while playing it changes every poll, which correctly keeps this group off
  // the bitmap cache's promotion path; once ended (or holding a degenerate
  // single frame) it stops changing and the existing two-frame stability gate
  // promotes it, with no video-specific code needed.
  getExtraSignature(): string {
    return `src:${this.#describePaintSource()}|t:${Math.round(
      this.#element.currentTime * 1000,
    )}`;
  }

  // Names which of the three things getFrameSource would return, so a swap
  // between live and held frames invalidates even when the clock happens to
  // read the same on both sides of it -- which is exactly what a seek does.
  #describePaintSource(): "live" | "held" | "none" {
    if (this.isReady()) {
      return "live";
    }

    return this.#frameHold.get() ? "held" : "none";
  }

  reconcile(src: string, props: VideoProps): void {
    // 1. A changed src is a different video entirely -- reset rather than
    //    reinterpreting the new range against the old element's state.
    if (src !== this.#src) {
      this.#src = src;
      this.#element.src = src;
      this.#element.load();
      this.#setState("not-ready");
      this.#hasDeclaredRange = false;
      // A held frame belongs to the video that was playing. Keeping it across
      // a src change would show the outgoing clip's last frame over the
      // incoming one while it loads, which is worse than showing nothing.
      this.#frameHold.release();
      return;
    }

    // 2. Duration is unknown until metadata arrives, and the range depends on
    //    it, so there is nothing meaningful to resolve before then.
    if (!this.#hasMetadata()) {
      return;
    }

    // 3. Recomputed every frame so clipStartTime/clipEndTime/loop are genuinely
    //    declarative -- a scene may change which segment plays in response to
    //    whatever external state it tracks.
    const { startMs, endMs } = this.#resolveRange(props);

    this.#startMs = startMs;
    this.#endMs = endMs;

    // Compared against what was DECLARED, not what it resolved to. A resolved
    // range shifts whenever the element refines its duration, and treating
    // that as a caller intent change would restart playback mid-play.
    const declaredChanged =
      !this.#hasDeclaredRange ||
      props.clipStartTime !== this.#declaredStart ||
      props.clipEndTime !== this.#declaredEnd;

    this.#declaredStart = props.clipStartTime;
    this.#declaredEnd = props.clipEndTime;
    this.#hasDeclaredRange = true;

    // 4. A newly DECLARED range restarts the segment. Coming from `ended`,
    //    that means going back through `starting` so playback actually
    //    resumes -- the one case where .play() fires more than once.
    if (this.#state === "not-ready") {
      this.#setState("starting");
    } else if (declaredChanged && this.#state === "ended") {
      this.#setState("starting");
    } else if (declaredChanged && this.#state === "playing") {
      this.#seekTo(startMs);
    }

    if (this.#state === "starting") {
      this.#beginPlayback();
      return;
    }

    // 5. Loop by reseeking. Playback normally continues through a seek on its
    //    own, but see the paused check below.
    if (this.#state === "playing" && this.#hasReachedEnd()) {
      if (props.loop ?? true) {
        this.#seekTo(this.#startMs);

        // Seeking clears the ended flag and, per spec, resumes playback if the
        // element is not paused. A natural end can still leave it paused
        // though, and a paused element stays paused through a seek -- so
        // without this a loop freezes on its first frame instead of playing.
        if (this.#element.paused) {
          this.#play();
        }

        return;
      }

      this.#element.pause();
      this.#setState("ended");
    }
  }

  #beginPlayback(): void {
    this.#seekTo(this.#startMs);

    // A range that clamps to zero length can never advance, so playing it
    // would be meaningless. Hold the single frame at its start instead, and
    // say so -- it is far more likely a mistake than an intent.
    if (this.#endMs <= this.#startMs) {
      this.#warnDegenerateRange();
      this.#setState("ended");
      return;
    }

    this.#play();
    this.#setState("playing");
  }

  #hasReachedEnd(): boolean {
    // element.ended is authoritative and checked FIRST, because a threshold
    // comparison on currentTime alone is not sufficient: a file's declared
    // duration can exceed the presentation time of its own last frame, so
    // currentTime tops out BELOW endMs and `>=` never becomes true. The loop
    // then never fires and playback sits frozen on its final frame, looking
    // like it simply stopped early.
    //
    // This is not hypothetical. The clip this was diagnosed against carries an
    // edit list that trims 0.0667s off the front of the video track while
    // still declaring a 20.000s segment -- so element.duration reads 20.000s,
    // but only 19.933s of samples exist behind it. Files routinely disagree
    // with themselves like this (that same clip's mdhd also overstates its
    // sample table by exactly one frame), which is precisely why the element's
    // own verdict has to win over arithmetic on its metadata.
    if (this.#element.ended) {
      return true;
    }

    return this.#element.currentTime * 1000 >= this.#endMs;
  }

  #resolveRange(props: VideoProps): ResolvedRange {
    // Infinity rather than NaN for an unknown or unbounded duration (a live
    // stream): clamping against NaN would poison every derived value, whereas
    // an infinite upper bound simply means "plays until it stops".
    const durationMs = Number.isFinite(this.#element.duration)
      ? this.#element.duration * 1000
      : Number.POSITIVE_INFINITY;

    const startMs = clampWithinRange(
      props.clipStartTime === undefined
        ? 0
        : eventTimeToMs(props.clipStartTime),
      0,
      durationMs,
    );

    // Defaulting the end to the duration is what makes "play to the end" and
    // "the end of a bad clamp" the same code path.
    const requestedEndMs =
      props.clipEndTime === undefined
        ? durationMs
        : eventTimeToMs(props.clipEndTime);

    return {
      startMs,
      endMs: clampWithinRange(requestedEndMs, startMs, durationMs),
    };
  }

  #seekTo(positionMs: number): void {
    // Snapshotted BEFORE the head moves, because this is the last moment the
    // outgoing frame is still decoded and paintable. Captured per seek rather
    // than per frame: roughly once a loop instead of sixty times a second, to
    // cover a gap that lasts one or two frames.
    this.#captureHeldFrame();

    this.#element.currentTime = positionMs / 1000;
  }

  #captureHeldFrame(): void {
    if (!this.isReady()) {
      return;
    }

    const { width, height } = this.getNaturalDimensions();

    this.#frameHold.capture(this.#element, width, height);
  }

  #play(): void {
    const playback: unknown = this.#element.play();

    // Muted playback is allowed essentially everywhere, but a rejection is
    // still possible in unusual embedding contexts -- and an uncaught one
    // would surface as an unhandled rejection rather than anything useful.
    if (playback instanceof Promise) {
      playback.catch(() => {
        if (this.#hasWarnedPlayRejected) {
          return;
        }

        this.#hasWarnedPlayRejected = true;
        console.warn(
          `[liminalis] video() could not start playback for "${this.#src}". ` +
            `The browser refused the play() request.`,
        );
      });
    }
  }

  #warnDegenerateRange(): void {
    if (this.#hasWarnedDegenerateRange) {
      return;
    }

    this.#hasWarnedDegenerateRange = true;
    console.warn(
      `[liminalis] video() for "${this.#src}" has a clip range of zero ` +
        `length (clipStartTime and clipEndTime resolve to the same position, ` +
        `after clamping to the video's duration), so it will hold a single ` +
        `frame rather than play.`,
    );
  }

  // Explicit teardown, unlike anything else the renderer retains per frame:
  // dropping the reference alone would leave a decode pipeline and an
  // in-flight network request running.
  dispose(): void {
    this.#element.pause();
    this.#element.src = "";
    this.#element.load();
    this.#src = null;
    this.#state = "not-ready";
    this.#hasDeclaredRange = false;
    // Releases the retained bitmap along with the decode pipeline -- at native
    // resolution it is the largest thing this object holds.
    this.#frameHold.release();
  }
}

export default VideoTransport;
