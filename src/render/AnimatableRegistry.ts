import Animatable from "./Animatable";

interface PendingRender {
  validate: () => void;
  render: () => void;
}

export interface AnimatableIdentity {
  // Distinguishes primitives that share a positional slot but are not the
  // same kind of thing -- a conditional rendering a rect on one frame and a
  // circle on the next would otherwise resolve to the same slot, and the
  // circle would inherit the rect's animation state (including its creation
  // time, so its own entrance animation would be evaluated as already over).
  // Omitted means legacy, un-qualified positional identity.
  primitiveType?: string;
  // Opt-in stable identity. When supplied, this primitive is identified by
  // the key rather than by where it sits in declaration order, and it does
  // NOT consume a positional index -- exactly how withScope already treats
  // an explicit key for containers. Needed whenever declaration order can
  // change between frames (prepend/insert/remove-from-middle/sort).
  key?: string;
}

class AnimatableRegistry {
  #registry: Map<string, Animatable<object>> = new Map();
  // Identity is path-based rather than a single flat counter: #scopePath is
  // the chain of scope segments (see withScope) leading to the current call
  // site, and #localIndexStack holds one auto-increment counter per active
  // scope level. This keeps a container's internal identity stable when
  // unrelated siblings elsewhere in the tree are added, removed, or
  // reordered — only reordering *within* the same scope still shifts ids,
  // which withScope's explicit key lets callers opt out of.
  #scopePath: string[] = [];
  #localIndexStack: number[] = [0];
  #seenThisFrame: Set<string> = new Set();
  // Per-scope count of UNKEYED declarations, which is just the scope's own
  // positional counter at the point the scope closed -- so recording it
  // costs nothing per primitive. Compared against the previous frame's to
  // detect a list whose length changed while nothing was keyed; see
  // #warnOnUnkeyedReorderHazard.
  #scopeDeclarationCounts: Map<string, number> = new Map();
  #previousScopeDeclarationCounts: Map<string, number> = new Map();
  #warnedScopes: Set<string> = new Set();
  #pendingRenders: PendingRender[] = [];
  #currentTimeInMs = 0;
  #isFlushing = false;
  #flushIndex = 0;
  #flushInsertionIndex = 0;

  beginFrame(timeInMs: number): void {
    this.#scopePath = [];
    this.#localIndexStack = [0];
    this.#seenThisFrame.clear();
    this.#previousScopeDeclarationCounts = this.#scopeDeclarationCounts;
    this.#scopeDeclarationCounts = new Map();
    this.#pendingRenders = [];
    this.#currentTimeInMs = timeInMs;
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }

  // Opens a new identity scope for the duration of callbackFn. Every
  // getOrCreate/queue call made inside (directly or via further nested
  // scopes) gets an id rooted at this scope's path rather than the frame's
  // flat call sequence. Pass an explicit key to pin identity for content
  // whose position among same-shaped siblings may change between frames
  // (e.g. a list of placed components); omit it to fall back to positional
  // numbering within the parent scope, matching today's call-order identity.
  withScope<T>(explicitKey: string | undefined, callbackFn: () => T): T {
    const parentLocalIndex = this.#localIndexStack.length - 1;
    const segment =
      explicitKey !== undefined
        ? `key:${explicitKey}`
        : String(this.#localIndexStack[parentLocalIndex]++);

    this.#scopePath.push(segment);
    this.#localIndexStack.push(0);

    try {
      return callbackFn();
    } finally {
      this.#recordScopeDeclarationCount();
      this.#localIndexStack.pop();
      this.#scopePath.pop();
    }
  }

  // The scope's positional counter, at the moment the scope closes, IS the
  // number of unkeyed declarations made inside it. Recorded here rather than
  // counted per declaration so the diagnostic adds no per-primitive cost.
  #recordScopeDeclarationCount(): void {
    this.#scopeDeclarationCounts.set(
      this.#scopePath.join("/"),
      this.#localIndexStack[this.#localIndexStack.length - 1],
    );
  }

  #nextId(identity?: AnimatableIdentity): string {
    const primitiveType = identity?.primitiveType;
    const key = identity?.key;

    // A keyed declaration is identified by its key alone and deliberately
    // does not consume a positional index, so keying one item cannot shift
    // its unkeyed siblings -- the same rule withScope already applies.
    const segment =
      key !== undefined
        ? `key:${key}`
        : String(this.#localIndexStack[this.#localIndexStack.length - 1]++);

    // Type-qualified so a positional slot cannot be shared by two different
    // kinds of primitive. Appended rather than prefixed to keep the
    // legacy (no-primitiveType) id byte-identical to what it was before.
    const qualified =
      primitiveType === undefined ? segment : `${segment}#${primitiveType}`;

    // At root -- which is where the overwhelming majority of primitives in
    // a typical scene are declared -- the path is empty and the spread plus
    // join produce a string identical to the segment alone, at the cost of an
    // array allocation per primitive per frame.
    if (this.#scopePath.length === 0) {
      return qualified;
    }

    return [...this.#scopePath, qualified].join("/");
  }

  getOrCreate<T extends object>(
    props: T,
    timeInMs: number,
    identity?: AnimatableIdentity,
  ): Animatable<T> {
    const id = this.#nextId(identity);

    // A repeated id within one frame always means a duplicated key, and is
    // unambiguously a mistake rather than a heuristic judgement. It is also
    // destructive: both declarations share one Animatable, so the second's
    // getOrCreate clears the segments the first just declared and the first
    // silently stops animating. Thrown rather than warned for that reason --
    // there is no correct frame to render here, and rendering a quietly
    // broken one is worse than stopping.
    //
    // Two distinct causes reach this point, and the guard must cover both:
    //   - a duplicated key on THIS declaration (`identity.key`);
    //   - a duplicated container key further up, from withScope, which gives
    //     two sibling containers the same scope path -- so their contents
    //     collide on an id that carries no key of its own.
    // An unkeyed id cannot otherwise repeat: positional counters only ever
    // increment, and an unkeyed scope segment is itself a counter.
    if (this.#seenThisFrame.has(id)) {
      throw new Error(AnimatableRegistry.#duplicateKeyMessage(id, identity));
    }

    this.#seenThisFrame.add(id);

    const existing = this.#registry.get(id);
    if (existing) {
      existing.setCurrentFrameTime(timeInMs);
      // Capture current animated state before rebuilding segments
      // This enables smooth transitions when re-attacking during release
      existing.captureCurrentProps(timeInMs);
      // Update props and clear segments for fresh definition this frame
      existing.updateInitialProps(props);
      existing.clearSegments();
      return existing as Animatable<T>;
    }

    // Create new Animatable
    const animatable = new Animatable<T>(props, timeInMs);
    animatable.setCurrentFrameTime(timeInMs);
    this.#registry.set(id, animatable);
    return animatable;
  }

  queue<T extends object>(
    mergedProps: T,
    renderFn: (props: T) => void,
    identity?: AnimatableIdentity,
  ): Animatable<T> {
    const animatable = this.getOrCreate(
      mergedProps,
      this.#currentTimeInMs,
      identity,
    );
    const timeInMs = this.#currentTimeInMs;

    // Capture all typed logic in closures - no type erasure needed
    const pendingRender: PendingRender = {
      validate: () => animatable.validate(),
      render: () => {
        const animatedProps = animatable.getCurrentProps(timeInMs);
        renderFn(animatedProps);
      },
    };

    if (this.#isFlushing) {
      this.#pendingRenders.splice(this.#flushInsertionIndex, 0, pendingRender);
      this.#flushInsertionIndex += 1;
    } else {
      this.#pendingRenders.push(pendingRender);
    }

    return animatable;
  }

  flush(): void {
    this.#isFlushing = true;
    this.#flushIndex = 0;

    while (this.#flushIndex < this.#pendingRenders.length) {
      const pending = this.#pendingRenders[this.#flushIndex];

      if (!pending) {
        this.#flushIndex += 1;
        continue;
      }

      this.#flushInsertionIndex = this.#flushIndex + 1;

      pending.validate();
      pending.render();

      this.#flushIndex += 1;
    }

    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
    this.#pendingRenders = [];
  }

  endFrame(): void {
    for (const id of this.#registry.keys()) {
      if (!this.#seenThisFrame.has(id)) {
        this.#registry.delete(id);
      }
    }

    // The root scope never closes via withScope, so record it here.
    this.#recordScopeDeclarationCount();
    this.#warnOnUnkeyedReorderHazard();
  }

  // Positional identity is only safe while declaration order is stable. It
  // is not possible to detect a reorder outright -- knowing whether two
  // declarations are "the same logical thing" is exactly what a key
  // supplies, and without one there is nothing to compare. What IS
  // detectable is the condition under which a reorder can corrupt state: a
  // scope whose number of unkeyed declarations changed between frames while
  // something in it was mid-animation.
  //
  // Deliberately narrow, to avoid crying wolf. It cannot fire when:
  //   - no UNKEYED declaration in the scope animates (identity has no effect
  //     on output for a primitive with no segments -- getCurrentProps returns
  //     initialProps verbatim -- and a keyed one is already safe regardless);
  //   - the scope's declaration count is stable frame to frame;
  //   - everything in the scope is keyed (keyed declarations consume no
  //     positional index, so the count stays at zero and never changes).
  #warnOnUnkeyedReorderHazard(): void {
    for (const [scope, count] of this.#scopeDeclarationCounts) {
      if (this.#warnedScopes.has(scope)) {
        continue;
      }

      const previousCount = this.#previousScopeDeclarationCounts.get(scope);

      if (previousCount === undefined || previousCount === count) {
        continue;
      }

      const hazard = this.#findUnkeyedReorderHazard(scope);

      if (!hazard) {
        continue;
      }

      this.#warnedScopes.add(scope);

      const { primitiveName, primitiveProps } = hazard;

      console.warn(
        `[liminalis] Liminalis requires a unique key prop on ` +
          `"${primitiveName}" with props ${primitiveProps} so that it can ` +
          `keep track of its animation across frames. \n\n Please add a unique ` +
          `key prop to distinguish each ${primitiveName} from the other ` +
          `${primitiveName}s.`,
      );
    }
  }

  // Locates the first mid-animation declaration directly inside this scope,
  // and describes it well enough to find in source. Returns null when nothing
  // in the scope is animating, in which case identity has no bearing on what
  // is rendered and there is nothing to warn about.
  #findUnkeyedReorderHazard(
    scope: string,
  ): { primitiveName: string; primitiveProps: string } | null {
    const prefix = scope === "" ? "" : `${scope}/`;

    for (const [id, animatable] of this.#registry) {
      if (!id.startsWith(prefix)) {
        continue;
      }

      const localId = id.slice(prefix.length);

      // Only declarations directly in this scope, not in nested ones.
      if (localId.includes("/")) {
        continue;
      }

      // A keyed declaration is already safe -- its identity does not depend
      // on declaration order at all -- so its animation says nothing about
      // whether an unkeyed count change is dangerous. Without this, a static
      // unkeyed list sharing a scope with an animated keyed one warns even
      // though nothing is at risk.
      if (AnimatableRegistry.#isKeyedLocalId(localId)) {
        continue;
      }

      if (!animatable.hasActiveAnimation()) {
        continue;
      }

      return {
        primitiveName: AnimatableRegistry.#primitiveNameFromId(id),
        primitiveProps: AnimatableRegistry.#describeProps(
          animatable.declaredProps,
        ),
      };
    }

    return null;
  }

  static #duplicateKeyMessage(
    id: string,
    identity?: AnimatableIdentity,
  ): string {
    const primitiveName = identity?.primitiveType ?? "primitive";

    if (identity?.key !== undefined) {
      return (
        `[liminalis] Duplicate key "${identity.key}" on "${primitiveName}". ` +
        `Please ensure that all keys are unique.`
      );
    }

    // No key on this declaration, so the duplication is a container key
    // higher up -- the colliding id's own scope path names it.
    const scope = id.slice(0, id.lastIndexOf("/"));

    return (
      `[liminalis] Duplicate key in container scope "${scope}", reached via ` +
      `"${primitiveName}". Please ensure that all keys are unique.`
    );
  }

  // A keyed declaration's slot segment is `key:<key>`, per #nextId.
  static #isKeyedLocalId(localId: string): boolean {
    return localId.startsWith("key:");
  }

  // Ids are `<slot>#<primitiveType>`, so the type is recoverable without
  // storing it a second time per primitive. Read from the LAST separator: a
  // key may legitimately contain one, and while a keyed declaration can never
  // reach this diagnostic today, parsing from the wrong end would be a quiet
  // trap for whatever calls this next.
  static #primitiveNameFromId(id: string): string {
    const separatorIndex = id.lastIndexOf("#");

    // No separator means the call site omitted primitiveType (the legacy
    // shape), so there is genuinely no name to report.
    return separatorIndex === -1 ? "primitive" : id.slice(separatorIndex + 1);
  }

  static #MAX_DESCRIBED_PROPS_LENGTH = 240;

  // Bounded and non-throwing: props can carry hundreds of points (a polygon)
  // or something JSON cannot represent, and a diagnostic must never be the
  // reason a frame fails to render.
  static #describeProps(props: object): string {
    try {
      const serialised = JSON.stringify(props);

      if (serialised === undefined) {
        return "{}";
      }

      return serialised.length > AnimatableRegistry.#MAX_DESCRIBED_PROPS_LENGTH
        ? `${serialised.slice(
            0,
            AnimatableRegistry.#MAX_DESCRIBED_PROPS_LENGTH,
          )}… (truncated)`
        : serialised;
    } catch {
      return "(props could not be serialised)";
    }
  }

  get size(): number {
    return this.#registry.size;
  }

  get pendingCount(): number {
    return this.#pendingRenders.length;
  }

  clear(): void {
    this.#registry.clear();
    this.#scopePath = [];
    this.#localIndexStack = [0];
    this.#seenThisFrame.clear();
    this.#scopeDeclarationCounts.clear();
    this.#previousScopeDeclarationCounts.clear();
    this.#warnedScopes.clear();
    this.#pendingRenders = [];
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }
}

export default AnimatableRegistry;
