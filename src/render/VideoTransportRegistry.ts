import type { PositionalIdentity } from "../types/identity";
import PositionalIdentityTracker from "./PositionalIdentityTracker";
import type { VideoProps } from "./types";
import VideoTransport from "./VideoTransport";

// Holds one VideoTransport per declaration site, resolved by the same
// positional identity scheme AnimatableRegistry uses -- via its own
// PositionalIdentityTracker instance, deliberately not a shared one, so a
// scene's video call sites and its shape call sites cannot steal each other's
// positional index.
//
// Much thinner than AnimatableRegistry, and for a specific reason: that
// registry defers primitive-operation pushes to flush because a primitive's
// .animateTo() calls can arrive after its declaration, chained onto the
// returned handle. Nothing chains onto a video's playback state -- its three
// props arrive complete in one call -- so reconciliation runs synchronously
// here and there is no queue/flush concept at all.
//
// A video's *geometry* still goes through AnimatableRegistry, via
// queueAnimatable, so its container can be .animateTo()'d like any other
// primitive. These two registries run side by side per frame; see
// spec/video-primitive-plan.md §3 and §5b.
class VideoTransportRegistry {
  #identityTracker = new PositionalIdentityTracker();
  #transports: Map<string, VideoTransport> = new Map();
  #createTransport: () => VideoTransport;

  // The factory is injectable for the same reason VideoTransport's element is:
  // so this can be exercised without a DOM, and without monkeypatching
  // document.createElement.
  constructor(
    createTransport: () => VideoTransport = () => new VideoTransport(),
  ) {
    this.#createTransport = createTransport;
  }

  beginFrame(): void {
    this.#identityTracker.beginFrame();
  }

  // Resolves this declaration site's transport and reconciles it against the
  // frame's props in one call. Unlike AnimatableRegistry.getOrCreate, which
  // deliberately evaluates nothing (segment resolution waits for flush), there
  // is nothing to defer here.
  //
  // The identity is passed straight through to nextId, so a keyed video's
  // <video> element follows the item exactly as its animatable does. If the
  // two diverged, a reordered list would draw each video in the right place
  // while showing another item's footage.
  //
  // Duplicate-key detection needs no code here: the guard lives inside
  // nextId, so a duplicated video key throws from this registry -- the one
  // that resolves it first.
  getOrCreate(
    src: string,
    props: VideoProps,
    identity?: PositionalIdentity,
  ): VideoTransport {
    // nextId records the id as seen itself, which is what endFrame's sweep
    // below reads -- no separate bookkeeping to keep in step.
    const id = this.#identityTracker.nextId(identity);

    const existing = this.#transports.get(id);

    if (existing) {
      existing.reconcile(src, props);
      return existing;
    }

    const transport = this.#createTransport();
    this.#transports.set(id, transport);
    transport.reconcile(src, props);

    return transport;
  }

  // Unlike AnimatableRegistry's sweep, which can simply drop a Map entry,
  // a discarded transport must be torn down explicitly -- dropping the
  // reference alone would leave a decode pipeline and an in-flight network
  // request running. Disposed before deletion so the order matches whatever a
  // future registry built the same way should follow.
  endFrame(): void {
    for (const [id, transport] of this.#transports) {
      if (this.#identityTracker.hasBeenSeen(id)) {
        continue;
      }

      transport.dispose();
      this.#transports.delete(id);
    }
  }

  get size(): number {
    return this.#transports.size;
  }

  clear(): void {
    for (const transport of this.#transports.values()) {
      transport.dispose();
    }

    this.#transports.clear();
    this.#identityTracker.reset();
  }
}

export default VideoTransportRegistry;
