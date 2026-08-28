import Animatable from "./Animatable";

interface PendingRender {
  validate: () => void;
  render: () => void;
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
  #pendingRenders: PendingRender[] = [];
  #currentTimeInMs = 0;
  #isFlushing = false;
  #flushIndex = 0;
  #flushInsertionIndex = 0;

  beginFrame(timeInMs: number): void {
    this.#scopePath = [];
    this.#localIndexStack = [0];
    this.#seenThisFrame.clear();
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
      this.#localIndexStack.pop();
      this.#scopePath.pop();
    }
  }

  #nextId(): string {
    const currentLocalIndex = this.#localIndexStack.length - 1;
    const localIndex = this.#localIndexStack[currentLocalIndex]++;

    return [...this.#scopePath, String(localIndex)].join("/");
  }

  getOrCreate<T extends object>(props: T, timeInMs: number): Animatable<T> {
    const id = this.#nextId();
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
  ): Animatable<T> {
    const animatable = this.getOrCreate(mergedProps, this.#currentTimeInMs);
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
    this.#pendingRenders = [];
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }
}

export default AnimatableRegistry;
