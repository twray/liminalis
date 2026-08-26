import Animatable from "./Animatable";

interface PendingRender {
  validate: () => void;
  render: () => void;
}

class AnimatableRegistry {
  #registry: Map<string, Animatable<object>> = new Map();
  #callIndex = 0;
  #seenThisFrame: Set<string> = new Set();
  #pendingRenders: PendingRender[] = [];
  #currentTimeInMs = 0;
  #isFlushing = false;
  #flushIndex = 0;
  #flushInsertionIndex = 0;

  beginFrame(timeInMs: number): void {
    this.#callIndex = 0;
    this.#seenThisFrame.clear();
    this.#pendingRenders = [];
    this.#currentTimeInMs = timeInMs;
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }

  getOrCreate<T extends object>(props: T, timeInMs: number): Animatable<T> {
    const id = String(this.#callIndex++);
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
    this.#callIndex = 0;
    this.#seenThisFrame.clear();
    this.#pendingRenders = [];
    this.#isFlushing = false;
    this.#flushIndex = 0;
    this.#flushInsertionIndex = 0;
  }
}

export default AnimatableRegistry;
