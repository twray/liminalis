# Video in liminalis: a decorative primitive, and the two bugs that shaped it

**Status:** current as of September 2026
**Audience:** engineers evaluating liminalis, or working on its video primitive

---

## 1. Summary

`video()` is a primitive with the same shape as `rect()` or `image()`: declarative props, resolved and re-declared every frame, composited into the group tree exactly like anything else. It adds three props beyond what every primitive already has — `clipStartTime`, `clipEndTime`, `loop` — and nothing else. There is no way to play, pause, seek, or unmute one from outside the framework.

That narrowness is the design, not a phase-one limitation. §2 explains why video is treated as moving set dressing rather than a media player embedded in a canvas.

Two real bugs shaped the current implementation, both found by measurement rather than guessed at: a looping clip that silently froze on its final frame after roughly eighteen of its twenty seconds, and a blank flash on every loop iteration once the first bug was fixed. §4 covers both — what was actually wrong, what the fix is, and how each fix was verified to matter rather than merely written.

§3 covers why every declaration site gets its own `<video>` element rather than sharing one, §5 what was deliberately not built, and §6 an honest, narrowly-scoped comparison against four other JS/TS creative-coding and rendering libraries.

---

## 2. Design position: decorative, not interactive

The entire public surface is this:

```ts
interface VideoProps
  extends Positioned2D, Partial<Dimensions2D>, WithOpacity, WithBlend,
    WithFitMode, TransformProps, WithIdentityKey {
  clipStartTime?: number | EventTime;
  clipEndTime?: number | EventTime;
  loop?: boolean;
}
```

— geometry, opacity, blend mode, fit mode, transform, and an optional key, which every primitive already has, plus a clip range and a loop flag. No `muted`, no `volume`, no `controls`, no `play`/`pause`, no way to read back playback state. `VideoTransport` — the object that actually owns the `<video>` element — isn't exported from `src/lib.ts` at all; the only thing user code ever holds is the same `IAnimatableLike<VideoProps>` handle every other primitive returns, usable for exactly one thing: `.animateTo()` on its container.

This wasn't left out. Three specific decisions enforce it:

**Muted unconditionally, not defaulted off.** `VideoTransport`'s constructor sets `this.#element.muted = true` once, with no prop that touches it. Two independent reasons converge on the same answer:

- *Domain fit.* liminalis exists to visualise music. A background video's own soundtrack would always be a second, unwanted audio source competing with whatever is actually driving the visualisation — there is no scenario in this framework's stated purpose where that's desirable. As the code puts it: audio is out of scope by design, not merely defaulted off.
- *Browser mechanics.* Every major browser blocks autoplay-with-sound absent a user gesture or an engagement heuristic; muted autoplay is universally exempt. A framework whose contract is "this plays the moment the scene declares it" cannot lean on sound working reliably regardless of policy — so ruling audio out isn't a workaround for the restriction, it sidesteps the whole problem class. There's no unmute affordance to build, no "did the user interact yet" state to track across frames, no per-browser autoplay quirk to special-case.

That second point matters more once you look at where it would have to live. The render loop is immediate-mode — the whole scene is redeclared from nothing every frame (see the companion report, [`render-pipeline-and-performance.md`](./render-pipeline-and-performance.md), §2–3). A real unmute control is the opposite kind of thing: a persistent, externally-triggered, one-time state transition tied to a specific user gesture on a specific element. Supporting it properly would mean growing a second, stateful, imperatively-managed API bolted onto an otherwise fully declarative one — for a feature that conflicts with the framework's own stated purpose in the first place.

**`playsInline` unconditionally.** Without it, iOS Safari is free to hijack the element into its native fullscreen video player chrome the moment it plays — the single most actively hostile thing that could happen to something meant to read as background texture rather than a video player.

**Looping is reimplemented, not delegated.** The native `element.loop` attribute is never set (`this.#element.loop = false`, permanently). It's free — no seek, no readiness gap, no possibility of the flash in §4.2 — but it can only loop the whole file from true zero to natural duration, and cannot express `clipStartTime`/`clipEndTime`. Taking it for the untrimmed case would split looping into two code paths: native when untrimmed, a manual reseek loop otherwise. The API presents looping as one declarative `loop: true` prop; the implementation keeps it as one mechanism underneath, uniformly, at the cost of the free path. §5 returns to this.

The net effect: video is drawn from the same conceptual bucket as `image()` — a compositing source with animatable geometry — with exactly the additional surface a moving image needs (a time range, a loop flag) and nothing that would make it a media player.

---

## 3. Architecture: one transport per declaration site

Every `draw.video(src, props)` call resolves to its own [`VideoTransport`](../src/render/VideoTransport.ts), and every transport owns its own `<video>` element. Two calls with the *identical* `src` still get two independent elements, two independent decode pipelines, and two independent playheads.

### 3.1 How identity resolves

```
draw.video(src, props)
  → identity = { primitiveType: "video:<src>", key?: props.key }
  → VideoTransportRegistry.getOrCreate(src, props, identity)
      → PositionalIdentityTracker.nextId(identity)   ← its OWN tracker,
                                                          not shared with
                                                          AnimatableRegistry
      → existing transport? reconcile(src, props) and return it
      → else: new VideoTransport() → new <video> element → reconcile(...)
  → transport.getFrameSource() / getExtraSignature()
  → primitives/video.ts → drawImageSourceWithFit(context, source, …)
```

Without an explicit `key`, identity comes from a flat, frame-wide positional counter — deliberately *not* scoped by surrounding containers (`VideoTransportRegistry` never calls `withScope`), and deliberately on its own `PositionalIdentityTracker` instance so a scene's shape declarations and its video declarations can't steal each other's positional slots. Two `video()` calls in one frame, keyed or not, always resolve to two different ids and therefore two different transports.

### 3.2 Why this isn't really a choice

For the common case — two calls declaring *different* clip ranges, as in [`test-apps/bars-animation/src/index.ts`](../test-apps/bars-animation/src/index.ts), which trims the same remote source to `0:01`–`0:05` in one frame and `0:05`–`0:10` in another — sharing one element is not an optimisation opportunity being left on the table. It's not implementable. A `<video>` element has exactly one playhead. It cannot be scrubbed to two positions to serve two simultaneous composites. This is the real distinction from `image()`: a decoded bitmap has no "current position", so `ImageAssetCache` can legitimately share one decode across arbitrarily many `drawImage` calls at different source rects. A video's decoded output is inherently tied to one evolving playback position, so independent playheads require independent elements — full stop, not a trade-off.

### 3.3 The cost that per-instance ownership actually pays

Two axes, and only one of them is genuinely duplicated:

| Cost | Shared across instances of the same URL? |
| --- | --- |
| Network transfer | Possibly — depends on the server's `Cache-Control`/`ETag` headers for that URL, same as any repeated fetch. Not something this framework controls or can rely on. |
| Decode (demux, decode, colour-convert, buffer) | Never. Each `<video>` element owns its own decoder. |

Worth being precise about the decode cost, because it's easy to overstate: it's the *browser's* video decode pipeline that runs off the main JS thread (typically hardware-accelerated), not liminalis's own canvas compositing — the actual `drawImage` calls that paint a video's current frame run on the same main-thread render loop as every other primitive, with no special treatment. So the real claim is narrower than "video rendering is off-thread": decode cost doesn't compete with the render loop's own frame budget the way an extra canvas paint would, but the composite step itself is ordinary main-thread work like any other primitive's.

In absolute terms, two or three concurrent 720p decoders is a small, well-bounded cost for a browser tab — not something this project's own profiling (see the companion report's §4) has ever shown to matter. §5 covers the one case where sharing would be worth building, and why it isn't yet.

---

## 4. Two bugs, found by measurement

### 4.1 The clip that stopped at eighteen seconds, not twenty

**Reported symptom.** A twenty-second clip, declared to loop, stopped abruptly after roughly eighteen seconds and never restarted.

**Investigation.** `ffprobe` was unusable on the development machine (`dyld: Library not loaded: libjxl.0.9.dylib`), so the served file's actual MP4 structure was read directly — a small Python atom parser walking `moov`/`trak`/`mdia` boxes — rather than reasoning about the bug from the symptom alone. That produced real numbers, not a guess:

```
mvhd (container):        timescale=1000   duration=20000   → 20.0000s
elst (video track edit): segment_duration=20000, media_time=1024
                          → trims 0.0667s off the front, still claims a
                            20.000s segment
mdhd (video track):      timescale=15360  duration=307712  → 20.0333s
stts (video track):      600 samples × 512 units = 307200 units = 20.0000s
```

The sample table (`stts`) — the authoritative record of what frames actually exist — totals exactly 20.0000s of real media. The edit list trims 0.0667s off the front of that media while still declaring a 20.000s presented segment. The arithmetic: `element.duration` reads 20.000s, but only 19.9333s of decodable content exists behind the trim point. The last frame stops being presented 66.7ms short of the duration the element itself reports.

That's one inconsistency. There's a second, independent one in the same file: `mdhd`'s own duration field (307712 units) overstates its own sample table (307200 units) by exactly one frame's worth. Two different fields in one file disagreeing with the actual frame data, by two different mechanisms — this is the concrete case for treating a file's self-reported metadata as advisory rather than authoritative.

**Root cause.** [`#hasReachedEnd()`](../src/render/VideoTransport.ts) tested only `element.currentTime * 1000 >= this.#endMs`. Once `currentTime` tops out below the declared duration — which this file guarantees — that comparison is never true. The loop's reseek never fires. Playback sits frozen on its final decoded frame, which reads as "stopped early" because, functionally, it did.

**Fix.**

```ts
#hasReachedEnd(): boolean {
  // element.ended is authoritative and checked FIRST, because a threshold
  // comparison on currentTime alone is not sufficient: a file's declared
  // duration can exceed the presentation time of its own last frame...
  if (this.#element.ended) {
    return true;
  }

  return this.#element.currentTime * 1000 >= this.#endMs;
}
```

`ended` is the browser's own verdict on whether playback has finished — set once presentation genuinely runs out of samples, regardless of what the container's metadata claims. It wins over arithmetic on that metadata precisely because that metadata isn't reliable, as measured above.

**One honest limit on this diagnosis.** The measured gap here is 66.7ms. The user-reported symptom was roughly two seconds short of twenty. Those are not the same number, and this report doesn't claim they are. What's established is the *mechanism* — a threshold test against `currentTime` can never fire once a file's declared duration exceeds its actual content — precisely enough to be confident it's real and worth fixing regardless of whether it fully accounts for the reported magnitude. Runtime logging (since removed once the fix was confirmed working end-to-end) was the intended way to close that gap empirically rather than by further arithmetic.

**Two secondary bugs the same investigation surfaced**, each independently real and independently fixed:

1. *A natural end leaves the element paused.* Per spec, seeking a paused element does not resume playback. So the `ended` fix alone would have reseeked correctly and then sat frozen on frame one — a different freeze in the same place. Fixed by resuming playback explicitly if the element is paused after the loop's own seek.

2. *Restart-on-range-change was watching the wrong range.* The resolved range (`startMs`/`endMs`, clamped against the element's own duration) moves on its own whenever the element refines its duration estimate — an early metadata read followed by a later `durationchange`, for instance — independent of anything the caller declared. Comparing against the resolved range meant a duration refinement mid-play could look like a caller-declared range change and yank playback back to the start for no reason visible from the API. Fixed by comparing the *declared* `clipStartTime`/`clipEndTime` instead, which only changes when the caller's own props actually change.

**Verification discipline.** Each of the three fixes was reverted individually and the suite rerun. Reverting the `ended` check failed 3 tests; reverting the paused-resume failed 1; reverting declared-vs-resolved failed 1. That's the meaningful claim — not "the tests pass," which proves nothing about whether a regression would be caught, but "each fix is pinned by a specific test that fails without it."

**Why 30 previously-passing tests missed this.** The original test double's `__advance(seconds)` moved `currentTime` and nothing else — it never set `ended` or `paused`. No test in the suite could produce the state a real browser produces on a natural end, so no test could have caught a bug that only manifests in that state. `__reachNaturalEnd()` was added to set both flags the way the real API does. The lesson, stated plainly: a mock that cannot reach the state a real API produces is worse than no mock at all, because every test built on it inherits the same blind spot without anyone noticing it's there.

### 4.2 The flash on every loop

**Reported symptom.** Once §4.1 was fixed and looping worked, every loop iteration produced a brief blank flash at the reseek point.

**Root cause.** Seeking drops an element's `readyState` below `HAVE_CURRENT_DATA` for a frame or two while the new position decodes. Per the canvas spec, `drawImage` on a video below that threshold is a defined no-op — it draws *nothing*, not the previous frame. [`render/index.ts`](../src/render/index.ts)'s existing readiness gate (`if (!transport.isReady()) return;`) meant the primitive painted literally nothing during that window. Every loop reseeks, so every loop reproduced it.

Worth being explicit about why the obvious fix — relaxing the readiness gate — doesn't work: the no-op happens *inside* `drawImage` itself, per spec, regardless of who's asking or what check preceded the call. There is genuinely no frame available from the element during that window.

**Fix: [`VideoFrameHold`](../src/render/VideoFrameHold.ts).** A same-thread scratch surface that retains one decoded frame as a paintable bitmap, so there's something to show during the gap. Worth stating precisely what it is, because it's a smaller mechanism than it might sound: a single **`HTMLCanvasElement`**, created via `document.createElement("canvas")` — deliberately **not** the `OffscreenCanvas` API, unlike [`DrawGroupBitmapCache`](../src/render/DrawGroupBitmapCache.ts) elsewhere in the render pipeline, which prefers a real `OffscreenCanvas` and only falls back to `HTMLCanvasElement` when the constructor is unavailable. The two motivations that usually justify `OffscreenCanvas` — transferring canvas ownership to a worker, or decoupling a canvas from DOM-tied layout/paint scheduling — don't apply here: the hold is captured and read back within the same synchronous main-thread paint pass, is never transferred anywhere, and is created once per transport rather than per frame. It's a deliberate simplification, not an oversight, but it is a named limitation: the guard (`typeof document === "undefined"`) means that in a hypothetical context where `document` is unavailable but `OffscreenCanvas` is (a worker, for instance), the hold silently does nothing and the pre-fix blank-flash behaviour comes back rather than erroring. Worth revisiting only if this framework's render pipeline ever moves off the main thread.

**Mechanism:**

```ts
#seekTo(positionMs: number): void {
  // Snapshotted BEFORE the head moves, because this is the last moment the
  // outgoing frame is still decoded and paintable. Captured per seek rather
  // than per frame: roughly once a loop instead of sixty times a second.
  this.#captureHeldFrame();
  this.#element.currentTime = positionMs / 1000;
}
```

Captured once per *seek*, not once per *frame* — roughly once a loop rather than sixty times a second, covering a gap that lasts one or two frames. [`getFrameSource()`](../src/render/VideoTransport.ts) is the single point of decision: the live element when it has a decoded frame, otherwise the held one, otherwise `null` — and `null` only for the case that should genuinely paint nothing, before any frame has ever decoded. `getExtraSignature()` reports which of the three states (`live`/`held`/`none`) is active, not merely a ready/not-ready bit, so the group bitmap cache invalidates in step with what's actually on screen — folding `held` into `none` would let the cache blit a stale, blank cached surface across exactly the frame the hold exists to cover, reinstating the flash through the cache instead of through the draw call.

**Verification.** Six independent behaviours — fallback to the held frame, capture strictly before (not after) the seek, the signature distinguishing `held` from `none`, release on src change, no redundant canvas resize, and the primitive actually consuming `getFrameSource()` rather than the raw element — were each verified by reverting them individually and confirming a specific test fails without them.

**A visible trade-off, stated plainly rather than left implicit.** During the gap, the viewer now sees the outgoing segment's last frame held slightly longer (one or two frames) before the incoming frame appears, rather than a hard cut straight to frame zero. That's continuity over an instant cut — the right trade for something meant to read as decorative and continuous, but it is a real, visible change in the loop's cadence, not a pure bug fix with no side effect.

---

## 5. What wasn't built, and why

**Pooled transports for identical declarations.** If two call sites ever declared the *same* `(src, clipStartTime, clipEndTime, loop)`, one shared decode composited to both destinations would save real decode cost — the same model `ImageAssetCache` already uses for static images. This doesn't exist. Three reasons: nothing in this codebase or its demo apps currently declares that case; two or three concurrent decoders of a moderate-resolution source is a small, bounded cost that profiling has never shown to matter (§3.3); and this project's stated position, established in the companion report's §5 on dirty-rectangle invalidation, is to carry no feature whose benefit hasn't been measured. This is named as a real, deferred extension point — not ruled out, just not justified yet.

**Native `element.loop` for the untrimmed case.** Covered in §2: rejected even though it's free, because it would split looping into two code paths where the API presents one declarative prop.

**Any public playback-control surface.** Not a performance question — a design-position question, covered in full in §2.

**`OffscreenCanvas` for the frame hold.** Not rejected so much as not needed yet — see §4.2's honest limitation. The current single-threaded, same-frame read-back doesn't call for it; it would if the render pipeline ever moved off the main thread.

---

## 6. Comparison with other frameworks

Presented, as in the companion report, as differences in trade rather than quality — and narrowly scoped. This is a comparison of **JS/TS libraries offering 2D-canvas or WebGL video compositing**, based on each framework's current public documentation, not an exhaustive survey. A different category of tool — nodal, visual creative environments like TouchDesigner — has offered native clip-range video operators for a long time; the claim below is scoped specifically to code-first web frameworks, where it appears to hold.

| Framework | Video support | Model |
| --- | --- | --- |
| [p5.js](https://p5js.org/reference/p5/p5.MediaElement/) | `createVideo()` returns a `p5.MediaElement` — a real, controllable, DOM-visible media element with `.loop()`/`.noLoop()`. No documented trim/clip-range API. | Interactive DOM element by default; you own play/pause/visibility. |
| [PixiJS](https://pixijs.download/dev/docs/rendering.VideoSource.html) | `VideoResource`/`VideoSource` wraps an `HTMLVideoElement` as a texture, with `loop`, `muted`, `playsinline`, `autoplay`, and `requestVideoFrameCallback`-based frame sync. The most capable of the four researched here. No documented declarative trim/clip-range primitive. | Texture-compositing utility — you configure the underlying element yourself. |
| [Three.js](https://threejs.org/docs/pages/VideoTexture.html) | `VideoTexture` takes a caller-configured `HTMLVideoElement` and exposes it as a WebGL texture. Thinnest of the four — no loop/mute/playsinline options of its own. | Pure compositing utility; every media concern is the caller's. |
| [Konva](https://konvajs.org/docs/sandbox/Video_On_Canvas.html) | No native video node. The documented pattern is a manual DIY recipe: create a `<video>` yourself, wrap it in `Konva.Image`, and redraw the layer every frame via `Konva.Animation`. | No first-class support at all. |
| **liminalis** | `video()` — a primitive with its own resolved, animated props (`clipStartTime`, `clipEndTime`, `loop`, plus every primitive's shared geometry/transform/fit props) | **Declarative primitive**, same footing as every other shape. |

The actual point of difference is narrower than "supports video" — every one of the other four can technically composite a video, because a `<video>` element satisfies `CanvasImageSource`/texture-source requirements everywhere. The distinction is that in liminalis, video is a first-class **declarative** primitive with its own resolved, animated sub-API — trim range and loop behaviour declared as props and reconciled by the framework, the same way `rect()`'s geometry is — rather than "bring your own configured element and drive it yourself." Among the four researched here, none offer that; PixiJS's `VideoResource` comes closest, with genuinely sophisticated frame-sync options, but still expects the caller to own loop range and playback state via the underlying element's own attributes.

---

## 7. Trade-offs

**What the design gives you**

- A video primitive with zero object lifecycle, matching every other primitive in the framework — declare it, animate its container, done.
- No autoplay-policy surface area to test or work around: muted-by-default sidesteps the whole problem class rather than solving it per-browser.
- Independently correct playheads per declaration site, with no possibility of one instance's seek affecting another's — not a caching decision, a structural one (§3.2).
- A loop that survives the browser's own metadata being wrong about itself (§4.1), and that doesn't flash on every iteration (§4.2).

**What it costs you**

- No user control over playback, volume, or muting — by design, not oversight, but a real constraint if a future use case needs it.
- Decode cost scales linearly with on-screen instances of the same source; nothing pools it today (§5).
- The frame hold is a same-thread `HTMLCanvasElement`, not `OffscreenCanvas` — fine for the current single-threaded render pipeline, a named gap if that ever changes.

---

## 8. Method

The same discipline as the companion report's §8, applied to video specifically:

- **Measured the file, not the symptom.** The root cause in §4.1 came from parsing the actual served MP4's atoms, not from reasoning about "duration mismatches" in the abstract. `ffprobe` being unavailable on the dev machine didn't stop the investigation — it just meant writing a fifty-line atom parser instead.
- **Every fix verified by deliberately breaking it.** Nine behaviours across the two bugs (three for §4.1, six for §4.2), each reverted individually and confirmed to fail a specific test. "The suite passes" was never treated as sufficient on its own.
- **A mock's blind spot is a blind spot in every test built on it**, not just the one that happened to expose it. The `__advance()`-only test double in §4.1 is the second instance of this exact failure mode in this codebase's history — the first is documented in the companion report's §8, where six tests were caught passing while asserting nothing. Elsewhere in this same work cycle, a test claiming to verify the `VideoMetadataLoader` class refactor (`"keeps separate caches across module instances"`) was written, found to catch nothing against a deliberate break, and deleted rather than kept with a comment that overclaimed what it covered.
- **An honest gap left open rather than papered over.** §4.1 states plainly that the measured 66.7ms discrepancy explains the mechanism but wasn't reconciled against the reported ~2-second symptom to the millisecond. Runtime logging — since removed once the fix was confirmed — was the intended way to close that gap with evidence rather than further arithmetic.

---

## Appendix: key source locations

| Concern | File |
| --- | --- |
| Playhead state machine, loop/end logic, range resolution | [`src/render/VideoTransport.ts`](../src/render/VideoTransport.ts) |
| Retained-frame capture for the loop flash fix | [`src/render/VideoFrameHold.ts`](../src/render/VideoFrameHold.ts) |
| Per-declaration-site identity and transport lifecycle | [`src/render/VideoTransportRegistry.ts`](../src/render/VideoTransportRegistry.ts) |
| Positional identity resolution (shared mechanism, separate instance) | [`src/render/PositionalIdentityTracker.ts`](../src/render/PositionalIdentityTracker.ts) |
| One-shot metadata preload, deduped by src | [`src/core/VideoMetadataLoader.ts`](../src/core/VideoMetadataLoader.ts) |
| Compositing into the group tree, fit geometry | [`src/render/primitives/video.ts`](../src/render/primitives/video.ts) |
| `video()` wiring into `createDrawContext`, the `ownGroup` cache boundary | [`src/render/index.ts`](../src/render/index.ts) |
| Public prop surface | [`src/render/types.ts`](../src/render/types.ts) (`VideoProps`) |
| State-machine and loop/flash regression tests | [`src/render/VideoTransport.test.ts`](../src/render/VideoTransport.test.ts) |
| Frame-hold capture/release tests | [`src/render/VideoFrameHold.test.ts`](../src/render/VideoFrameHold.test.ts) |
| End-to-end draw-API tests, including the held-frame integration cases | [`src/render/primitives/video.test.ts`](../src/render/primitives/video.test.ts) |
