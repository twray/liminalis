# The liminalis render pipeline: architecture, performance, and the things we deleted

**Status:** current as of September 2026
**Audience:** engineers evaluating liminalis, or working on its renderer

---

## 1. Summary

liminalis is an **immediate-mode** renderer for real-time music visualisation. Every frame, your callback re-declares the entire scene; the framework resolves animation state, builds an operation tree, and paints it to a canvas.

That choice determines everything else in this document. It buys a declarative API with no object lifecycle to manage — you describe what the frame looks like, not how to mutate it into existence. It costs a full scene rebuild on every frame, including frames where nothing has changed.

This report covers how the pipeline works, what we optimised, and — at some length, because it is the more useful half — what we built and then deleted. Two significant features were implemented, benchmarked, and thrown away. Three more were settled by measurement before any code was written.

The framework is not presented here as faster or slower than its neighbours. It makes a specific architectural trade that suits a specific job.

---

## 2. The render pipeline

### 2.1 One frame, three phases

Each frame runs through `executeDrawCallback` in `src/render/index.ts`:

```
registry.beginFrame(timeInMs)      ─┐
  callback(drawApi)                 │  DECLARE
    ↳ draw.rect(...) → registry.queue(props, renderFn)
                                    │
registry.flush()                   ─┤  RESOLVE
    ↳ per animatable:               │
        validate()                  │
        getCurrentProps(timeInMs)   │
        renderFn(animatedProps)     │
          ↳ pushPrimitiveOperation({ signature, render })
                                    │
registry.endFrame()                ─┘

drawGroupManager.renderToContext()  ─   PAINT
    ↳ buildGroupSignature(root)
    ↳ cache.renderGroup(...)  → blit or repaint
```

**Declare.** Your callback runs. Each primitive call resolves inherited styles, obtains or creates its `Animatable` from the registry, and _queues_ a render closure. Nothing is drawn yet — critically, the primitive's animated values aren't even known yet, because `animateTo` calls arrive during this same phase.

**Resolve.** `registry.flush()` walks the queued renders in declaration order. For each, `getCurrentProps(timeInMs)` evaluates the animation segments against the current scene time, and the render closure pushes a _primitive operation_ — a signature string plus a draw callback — into whichever draw group was current when the primitive was declared.

Flush is re-entrant by design: a render callback may itself queue more work (a reactive layer placing children), so new pending renders splice in immediately after the current index rather than appending at the end. That preserves declaration order for nested content.

**Paint.** `renderToContext` walks the group tree, builds each group's signature recursively from its children's, and hands each group to the bitmap cache, which decides between blitting a cached surface and repainting.

### 2.2 Identity without keys

Animation state has to survive between frames — a segment that runs from 1000ms to 6000ms must be the _same_ segment on frame 200 as on frame 1. But the scene is re-declared from scratch each frame, and nothing carries an explicit key.

The registry resolves this **positionally**. `AnimatableRegistry.#nextId()` derives an id from a scope path plus a per-scope incrementing index, so the third `rect` inside the second `group` gets a deterministic id every frame. `getOrCreate` then finds the existing `Animatable`, captures its current animated state, replaces its base props, and clears its segments so the frame can redeclare them:

```
existing.setCurrentFrameTime(timeInMs)
existing.captureCurrentProps(timeInMs)   // snapshot before rebuilding
existing.updateInitialProps(props)
existing.clearSegments()
```

The `captureCurrentProps` step is what makes re-triggering mid-animation smooth: a MIDI note re-attacking during release transitions from wherever it actually was, not from a cold start.

The trade-off is that **declaration order is the identity**. Conditional rendering that changes the order of siblings between frames will hand one primitive another's animation state. `withScope(explicitKey, ...)` exists to opt out where that matters.

### 2.3 Deferred pushes and the group handle

There is one subtlety worth understanding, because it is load-bearing for the caching described later.

Primitive operations are pushed during **flush**, which happens after your callback has fully unwound — every `group()` / `layer()` / `place()` has already pushed and popped. So a naive push at flush time would land wherever the group stack happens to be _then_, which is always the root.

The fix is a captured capability: when a primitive is declared, it takes a handle bound to whichever group is current at that instant, and pushes through that handle later. Without this, the group tree would be flat and per-group bitmap caching would have nothing to skip.

### 2.4 Signatures and the bitmap cache

Every primitive operation carries a **signature**: a stable serialisation of its resolved props. Every group's signature is built recursively:

```
signature(group) = id | invalidation | [ signature(child) for child in operations ]
```

`DrawGroupBitmapCache` compares a group's signature against the previous frame's. On a match with a cached surface, it blits. Otherwise it repaints — and, on the _second_ consecutive frame with the same signature, promotes the group to a cached `OffscreenCanvas`.

That two-frame gate matters. Allocating and rendering into an offscreen surface is more expensive than drawing directly, so speculatively creating one for a group that is about to change again is a net loss. The cache only pays that cost once a signature has proven stable by repeating.

One exception is a correctness requirement rather than an optimisation: a scope with a post-processing step (text's `destination-in` glyph masking) needs an isolated surface on _every_ frame, because masking the shared target context directly would erase unrelated content. That path bypasses the stability gate.

### 2.5 The root is a group

The root of the tree takes the same `cache.renderGroup` path as every other group — identity scope, full-canvas bounds, signature derived from every descendant. The consequence is that **a scene where nothing changed collapses to a single full-canvas `drawImage`.**

That's not a special case bolted on; it's the degenerate case of the general mechanism. Measured: on the third frame of an unchanged scene, the only call reaching the target context is one `drawImage(surface, 0, 0, w, h)`. Zero path operations, zero fills.

---

## 3. Developer experience

### 3.1 Animation is a declaration, not a state machine

The API's central idea is that an animation is described where the thing is drawn:

```js
draw
  .rect({ x: 10, y: 10, width: 40, height: 40 })
  .animateTo({ rotate: 360, opacity: 1 }, { at: 1000, duration: 5000 });
```

There is no tween object to hold, no timeline to register with, no teardown. The segment is declared fresh every frame and resolved against scene time. Re-declaring it is idempotent.

Segments support `at`, `duration`, `endTime`, `delay`, `easing` (by name or function) and `reverse`, and chain:

```js
draw
  .circle({ x: 100, y: 100, radius: 20 })
  .withOptions({ easing: "easeInOutCubic" })
  .animateTo({ radius: 60 }, { at: 0, duration: 500 })
  .animateTo({ radius: 20 }, { at: 500, duration: 500 });
```

### 3.2 Composition through frames

Primitives accept an optional frame callback, which turns the shape into a coordinate and clipping context for its children:

```js
draw.rect({ x: 0, y: 0, width: 200, height: 100 }, (frame) => {
  const { width, height, center } = frame.getMeasurements();
  draw.image("texture.png", { x: 0, y: 0, width, height });
});
```

Children are clipped to the parent's path — not its bounding box, its actual path — and can position themselves from measurements the parent resolves. Containers (`group`, `layer`, `place`) can size themselves implicitly from their content, which runs a measurement pass over children before the real declaration pass.

### 3.3 What the developer never does

This is the part that justifies the architecture:

- No object lifecycle. Nothing to create, retain, or dispose.
- No manual invalidation. No `markDirty()`, no `RepaintBoundary`, no `node.cache()`.
- No diffing keys, in the common case.
- No cache tuning. Bitmap caching is automatic and signature-driven; the only knob is `enableBitmapBasedCaching` on or off.

Every one of those is a decision the framework makes so the user doesn't. Section 6 covers what that costs.

---

## 4. Performance work

### 4.1 Measured results

Eight rounds against a 1024-primitive scene:

|                       | before | after  | change   |
| --------------------- | ------ | ------ | -------- |
| Static scene build    | 56.9ms | 21.7ms | **−62%** |
| Animating scene build | 58.9ms | 46.0ms | **−22%** |

The individual levers, measured on a harsher 4096-primitive scene, comparing an animating window against a settled one:

| Optimisation                               | Effect                                             |
| ------------------------------------------ | -------------------------------------------------- |
| `Animatable` lazy snapshot + settled cache | flush 32.9 → **7.4ms** when settled (4.4×)         |
| Signature memoisation                      | serialisation 12.2 → **1.7ms** when settled (7.2×) |
| `stableSerialize` rewrite                  | **1.87×** faster in isolation                      |
| Stability-gated surface promotion          | paint 10.6 → **0.7ms** when settled (~15×)         |

Final state, 4096 primitives: **19.9ms per static frame** (18.9 build / 0.8 paint), 57.9ms animating. That is ~4.6µs of framework work per primitive per frame, spread thinly with no dominant cost.

### 4.2 How each one works

**Lazy snapshots.** `captureCurrentProps` used to compute a full props snapshot eagerly, every frame, for every primitive — even though most are never read. It now stashes the _inputs_ (`{ segments, initialProps, previousSnapshot, timeInMs }`) and resolves on demand.

**The settled cache.** Once every segment on an animatable has elapsed, its resolved props cannot change until the segments themselves change. `#settledCache` stores the result alongside the segments and base props that produced it, validated by structural comparison. A settled primitive stops re-evaluating entirely. This is the single largest win, and it is why flush collapses 4.4× when a scene stops moving.

**Signature memoisation.** Signatures are cached in a `WeakMap` keyed by `Animatable` — the only per-primitive identity that survives between frames, since props objects and group handles are rebuilt. Equality is deliberately **conservative**: nested objects compare by reference, so a fresh clone reads as "changed". That asymmetry is intentional. A false "changed" costs one serialisation; a false "unchanged" reuses a stale signature and silently defeats every cache downstream.

The memo also tracks whether the last recompute produced a _different_ signature. If so, it skips the comparison next frame — an actively animating primitive would fail the check anyway, before a serialisation that has to happen regardless. That skip is self-correcting: the primitive rejoins the fast path when it settles.

**`stableSerialize`.** Rewritten to accumulate into a string rather than map-and-join, with type checks ordered by observed frequency and a regex fast path that hand-quotes strings needing no JSON escaping. Numbers round via `String(Math.round(v * 1e6) / 1e6)`, guarded against precision loss above `1e15`. The equality relation was verified unchanged across 406,230 value pairs before the old implementation was removed.

---

## 5. What we deleted

This section exists because it is more informative than section 4. Every item here represents work that looked correct in principle and failed on measurement.

### 5.1 Dirty-rectangle invalidation

**The idea.** Track which screen regions changed between frames; clear and repaint only those, blitting or leaving the rest untouched. Standard practice in browser compositors and game engines. If nothing changes for two seconds, do no work at all.

**What we built.** A complete implementation: per-primitive AABB tracking, region coalescing, clip-to-dirty-region painting, interaction with the existing bitmap cache, plus full test coverage for the edge cases — z-order and stacking, blend modes that read the destination, anti-aliased edges bleeding outside a naive bounding box, and clip scopes that transform their children's bounds. An architecture document went with it.

**One real bug found along the way.** The initial region coalescer was O(n³): `mergeDownToLimit` rescanned every pair of regions after each removal, producing 3493ms frames under load. Fixed with sorted row-major chunking (O(n log n)) plus moving the O(n) pre-checks ahead of coalescing.

**Why we deleted it.** Benchmarked against the existing bitmap cache, the improvement was marginal — a few percent in the good cases, and negative in scenes where the dirty region approached full-canvas, where the tracking cost was pure overhead on top of a repaint that happened anyway.

The underlying reason is structural, and it took us a while to articulate:

> Browsers use dirty rects because their scene is **retained**. The DOM persists between frames, so invalidation is a cheap annotation on an existing tree. In an immediate-mode system the tree is rebuilt regardless — so the dirty-rect machinery is pure addition, and it can only ever save _painting_, which was already the cheap half.

Painting was 0.8ms of a 19.9ms static frame. Dirty rects were competing for 4% of the budget while adding a tracking system with a dozen correctness edge cases. The decision was to carry no feature whose benefit we could not demonstrate, regardless of how much had been built. That is the judgement this project wanted to make explicitly.

### 5.2 Declaration-artifact memoisation

**The idea.** Frame primitives build three things per declaration: frame bounds, a measurement context, and a clip scope. Those are pure functions of the primitive's props, so a static primitive rebuilds identical objects every frame. Cache them per declaration site, invalidated by the same conservative comparison the signature memo uses.

**What we built.** Per-site state boxes so the context and scope closures could outlive the frame that created them, a `peekNextId()` addition to the registry for stable keying, a primitive-type guard against positional collisions, a carve-out for `text` (whose bounds depend on `measureText`, which changes when a webfont loads with no prop moving), and a separate path for measurement passes (which return before consuming a declaration id, so every primitive in one would peek the same key). Eight tests, each verified against a deliberate break.

**Why we deleted it.** It was a **regression**. `frame:declare` went 7.9 → 9.5ms; total scene build was flat to slightly worse.

The lesson is worth stating plainly: for a rect, `getFrameBounds` is a handful of arithmetic operations and the props transform is identity. Against that, the memo added — per primitive, per frame — a path-string allocation for the key, a string-keyed `Map` lookup, a `Set` insertion, and a ~15-key comparison. **The machinery to avoid the work cost more than the work.** At single-digit microseconds per primitive there is no room for bookkeeping.

### 5.3 Three things measured before they were built

**GC and allocation pressure.** The scene allocates ~11MB per static frame, roughly 2.75KB per primitive, and the p95-to-median frame time gap looked like collection pauses. Rather than start pooling objects, we instrumented it: sample the heap either side of the render call, then compare frames where the heap _shrank_ against frames where it didn't. Result: **2.2%** of frame time. Dropped, unwritten.

A subtlety this exposed: the heap sawtooth looked _steeper_ in the static window, which suggested static frames allocated more. They allocated less per frame (11.3MB vs 17.9MB) but ran 2.3× more frames per second, so the per-second rate was higher. Rate and per-frame cost point in opposite directions here, and only one of them is actionable.

**Whole-frame static short-circuit.** If every segment has elapsed and no reactive input has fired, skip the frame entirely — no clear, no declare, no flush, no paint. 19.9ms → ~0. Rejected on two grounds. Scenes that animate by reading the clock directly rather than through `animateTo` declare no segments at all, so the framework would see "settled" and silently freeze the canvas. And more decisively: a real-time music visualisation is driven by audio or MIDI on essentially every frame. The multi-second fully-static state being optimised for is an artifact of our benchmark, not of the domain.

**Root-canvas blit.** Proposed as a new feature; it already existed, as described in §2.5. Verified at runtime and pinned with tests, since the behaviour had previously been guarded only by a comment.

### 5.4 The unifying constraint

One sentence explains why four separate investigations converged:

> **A cache keyed on "did the output change?" cannot save the work that computes the answer.**

The root signature derives from its descendants', so knowing the canvas is unchanged requires a full scene build first. Dirty rects, the static short-circuit, and the root blit all hit this from different directions. It is also why the honest ceiling on the current architecture is _paint_ cost, which is already near zero, and why further gains would require changing the declaration model rather than caching harder.

---

## 6. Trade-offs

### What the architecture gives you

- **Declarative animation with no lifecycle.** Segments are re-declared each frame and resolved against time. Nothing to retain or dispose.
- **Automatic caching.** Signature-keyed bitmap caching needs no annotation. An unchanged canvas costs one `drawImage`.
- **Near-zero paint cost when settled.** 0.8ms of a 19.9ms frame at 4096 primitives.
- **Smooth re-triggering.** `captureCurrentProps` means a re-attacked note transitions from its actual current value.
- **Composition through geometry.** Frame callbacks clip to real paths and expose resolved measurements.

### What it costs you

- **Every frame rebuilds the scene.** ~4.6µs of framework work per primitive, whether or not anything moved. At a few hundred primitives this is irrelevant; at several thousand static ones it is the dominant cost.
- **No persistent scene graph.** You cannot hold a reference to a shape and mutate it. Everything flows through re-declaration.
- **Positional identity.** Declaration order carries animation state. Reordering siblings between frames transfers state incorrectly unless `withScope` is used.
- **A ceiling we can name.** Because knowing the scene is unchanged requires rebuilding it, no cache can reclaim the declaration cost. Getting past it needs explicit user-declared static regions — deliberately not built, because it was not yet clear that real scenes have large static subtrees.
- **Conservative equality means redundant work.** Nested values compare by reference, so a fresh clone counts as changed. Chosen because the opposite error renders stale pixels.

### Where it fits

Good fit: real-time audio and MIDI visualisation, generative and procedural work, scenes in the hundreds-to-low-thousands of primitives where most things are in motion, and work where iteration speed on the animation code matters more than peak throughput.

Poor fit: tens of thousands of mostly-static primitives, scenes needing direct imperative mutation of retained objects, or anything where the per-primitive floor dominates.

---

## 7. Comparison with other frameworks

Presented as differences in trade, not in quality. Each of these frameworks is correct for its own target.

### Immediate versus retained

| Framework                | Model                | Declaration cost per frame | API style        |
| ------------------------ | -------------------- | -------------------------- | ---------------- |
| Pixi.js, Three.js, Konva | Retained scene graph | None — you mutate          | Stateful objects |
| DOM / browsers           | Retained tree        | None — you mutate          | Stateful         |
| React                    | Virtual, reconciled  | Full render, then diff     | Declarative      |
| Dear ImGui               | Immediate            | Full rebuild               | Declarative      |
| p5.js / Processing       | Immediate            | Full rebuild               | Imperative       |
| **liminalis**            | **Immediate**        | **Full rebuild**           | **Declarative**  |

Retained-mode renderers don't pay a declaration cost because there is nothing to declare — you hold objects and change their fields. They buy that with a stateful API and an object lifecycle you own. liminalis trades in the other direction on purpose: the per-frame rebuild is the price of never managing a lifecycle.

The closest architectural relative is Dear ImGui, which rebuilds an entire UI every frame and treats that as a feature. Its performance strategy — make the per-item cost very small and accept the linear rebuild — is the same one we arrived at.

### Who decides what to skip

This is the more interesting axis, and the one where our findings lined up with prior art.

| Framework     | Skip mechanism                         | Decided by                     |
| ------------- | -------------------------------------- | ------------------------------ |
| React         | `memo`, `useMemo`, dependency arrays   | **User**                       |
| Flutter       | `RepaintBoundary`, relayout boundaries | **User**                       |
| Konva         | `node.cache()`                         | **User**                       |
| Browsers      | Layerisation, dirty rects              | Engine, over a _retained_ tree |
| **liminalis** | **Signature-keyed bitmap caching**     | **Automatic**                  |

Every declarative framework that skips subtree work does it through **explicitly declared boundaries**. None of them infer it. We came to understand why by failing at it twice: you cannot know a subtree is unchanged without running the code that declares it, and running that code is most of the cost.

Against that background, liminalis's automatic signature-keyed caching is a genuine point of difference. A static canvas collapses to one blit with no annotation, where Flutter would want a `RepaintBoundary` and Konva a `cache()` call. The trade is exactly the constraint in §5.4: it must _build_ the signature to know, so it saves painting rather than building. Frameworks with user-declared boundaries can skip both — because the user supplied the knowledge the framework couldn't derive.

If liminalis ever needs to skip declaration work, the honest path is the same one everyone else took: an explicit `draw.static(...)` boundary where the user asserts what the framework cannot infer. That remains unbuilt, pending evidence that real scenes need it.

---

## 8. Method

The approach here was closer to how compiler and runtime teams work than to typical application optimisation: form a hypothesis, instrument, measure, and revert on negative data. Three specifics are worth carrying forward.

**Every test was verified by deliberately breaking the code.** Six tests were caught passing while asserting nothing. Examples: an "image is ready" test that asserted `drawImage` was called — which is also how cache blits work; a test claiming to guard against a cache over-firing, which could not have detected over-firing because the over-firing case produces correct values; and a call-log assertion satisfied entirely by warm-up frames. A test that cannot fail is worse than no test, because it advertises coverage that does not exist.

**Instrumentation perturbs what it measures, quantifiably.** A `performance.now()` pair costs ~110ns. At 4096 primitives with three per-primitive timing sites, that is 2.7ms per frame — larger than most of the buckets being reported. One round of work read as a 12ms regression that was entirely measurement overhead. The profiler ended up with an explicit switch to separate "attribute the phases" runs from "read the true frame cost" runs, because the two cannot be done simultaneously.

**Overlapping buckets invite false conclusions.** A bucket measuring a group "including children" contained work also counted in three sibling buckets. Treating its total as independent headroom nearly produced an optimisation plan against several milliseconds that did not exist.

The scorecard, stated plainly: measurement contradicted expectation in roughly half the investigations, and both features proposed from reasoning rather than data had to be reverted. The framework is faster because of what was deleted as much as what was added — and the deletions were only possible because the measurements were trusted over the effort already spent.

---

## Appendix: key source locations

| Concern                                           | File                                      |
| ------------------------------------------------- | ----------------------------------------- |
| Frame orchestration, primitive declaration        | `src/render/index.ts`                     |
| Positional identity, flush ordering               | `src/render/AnimatableRegistry.ts`        |
| Segment resolution, settled cache, lazy snapshots | `src/render/Animatable.ts`                |
| Group tree, signature construction, compositing   | `src/render/DrawGroupManager.ts`          |
| Surface lifecycle, stability gate                 | `src/render/DrawGroupBitmapCache.ts`      |
| Clip scopes, path-based clipping                  | `src/render/clipping.ts`                  |
| `stableSerialize`                                 | `src/util/common.ts`                      |
| Signature memo behaviour                          | `src/render/signatureMemoisation.test.ts` |
| Root blit behaviour                               | `src/render/rootBitmapCache.test.ts`      |
